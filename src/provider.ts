import * as vscode from "vscode";
import {
  API_KEY_ENV,
  ApiError,
  KEY_PATTERN,
  KEYS_URL,
  describeBalance,
  fetchBalance,
  fetchCatalog,
  postChatCompletion,
} from "./api.ts";
import { buildChatRequest, estimateTokens, type ReasoningEffort } from "./convert.ts";
import { type AbliteratedModel, toChatModels } from "./models.ts";
import { ChatStreamParser, type StreamEvent } from "./stream.ts";

/** SecretStorage entry that holds the API key. */
export const SECRET_KEY = "abliteratedllm.apiKey";
/** How long the public model list is reused before it is fetched again. */
const CATALOG_TTL_MS = 10 * 60_000;
const CATALOG_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

export interface Settings {
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration("abliteratedllm");
  const effort = config.get<string>("reasoningEffort");
  const max = config.get<number>("maxOutputTokens");
  return {
    reasoningEffort: effort === "medium" || effort === "high" ? effort : "low",
    maxOutputTokens:
      typeof max === "number" && Number.isInteger(max) && max >= 256 ? max : DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

/** Where the key in use comes from: saved in VS Code's SecretStorage, or the environment. */
export type KeySource = "saved" | "environment";

export class AbliteratedLLMProvider implements vscode.LanguageModelChatProvider<AbliteratedModel> {
  private readonly secrets: vscode.SecretStorage;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changed.event;
  private catalog: { entries: unknown[]; fetchedAt: number } | undefined;

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
  }

  dispose(): void {
    this.changed.dispose();
  }

  /** Asks VS Code to list the models again, e.g. after the key or a setting changed. */
  notifyChanged(): void {
    this.changed.fire();
  }

  /** Drops the cached model list and lists the models again. */
  refresh(): void {
    this.catalog = undefined;
    this.changed.fire();
  }

  /** The saved key, else `ABLITERATEDLLM_API_KEY`. */
  async apiKey(): Promise<{ key: string; source: KeySource } | undefined> {
    const saved = (await this.secrets.get(SECRET_KEY))?.trim();
    if (saved) return { key: saved, source: "saved" };
    const env = process.env[API_KEY_ENV]?.trim();
    return env ? { key: env, source: "environment" } : undefined;
  }

  /**
   * Asks for a key, checks it with `GET /v1/balance` (no cost) and saves it in SecretStorage.
   * Returns the saved key, or undefined when the user cancelled or the API rejected the key.
   */
  async promptForApiKey(): Promise<string | undefined> {
    const entered = await vscode.window.showInputBox({
      title: "AbliteratedLLM API key",
      prompt: `Paste an API key from ${KEYS_URL}. It is stored in VS Code's secret storage.`,
      placeHolder: "sk-...",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim() === "" || KEY_PATTERN.test(value.trim())
          ? undefined
          : "An AbliteratedLLM key is sk- followed by 48 letters and digits.",
    });
    const key = entered?.trim();
    if (!key) return undefined;

    let summary: string | undefined;
    try {
      const balance = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Checking the AbliteratedLLM key…" },
        () => fetchBalance(key, AbortSignal.timeout(CATALOG_TIMEOUT_MS)),
      );
      summary = describeBalance(balance);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        void vscode.window.showErrorMessage(`${error.message} The key was not saved.`);
        return undefined;
      }
      // Network trouble says nothing about the key: save it and say it is unchecked.
      summary = `AbliteratedLLM key saved without a check: ${error instanceof Error ? error.message : String(error)}`;
    }
    await this.secrets.store(SECRET_KEY, key);
    void vscode.window.showInformationMessage(summary);
    this.changed.fire();
    return key;
  }

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken,
  ): Promise<AbliteratedModel[]> {
    if ((await this.apiKey()) === undefined) {
      // Models are listed once a key is set. A non-silent request comes from the user adding
      // AbliteratedLLM models, so ask for the key then.
      if (options.silent || (await this.promptForApiKey()) === undefined) return [];
    }
    return toChatModels(await this.loadCatalog(), readSettings().maxOutputTokens);
  }

  /** The public model list, reused for CATALOG_TTL_MS; a stale copy if a refresh fails. */
  private async loadCatalog(): Promise<unknown[]> {
    const cached = this.catalog;
    if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) return cached.entries;
    try {
      const entries = await fetchCatalog(AbortSignal.timeout(CATALOG_TIMEOUT_MS));
      this.catalog = { entries, fetchedAt: Date.now() };
      return entries;
    } catch (error) {
      if (cached) return cached.entries;
      throw error;
    }
  }

  async provideLanguageModelChatResponse(
    model: AbliteratedModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const credentials = await this.apiKey();
    if (credentials === undefined) {
      throw new Error(
        `AbliteratedLLM: no API key is set. Run "Manage AbliteratedLLM" and paste a key from ${KEYS_URL}.`,
      );
    }
    const body = buildChatRequest(model, messages, options, readSettings().reasoningEffort);

    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());
    try {
      if (token.isCancellationRequested) return;
      const response = await postChatCompletion(credentials.key, body, controller.signal);
      if (response.body === null) throw new Error("AbliteratedLLM: the API sent an empty response.");
      const parser = new ChatStreamParser();
      const decoder = new TextDecoder();
      const report = (events: StreamEvent[]): void => {
        for (const event of events) {
          progress.report(
            event.type === "text"
              ? new vscode.LanguageModelTextPart(event.text)
              : new vscode.LanguageModelToolCallPart(event.callId, event.name, event.input),
          );
        }
      };
      for await (const chunk of response.body) {
        report(parser.push(decoder.decode(chunk, { stream: true })));
      }
      report(parser.push(decoder.decode()));
      report(parser.end());
    } catch (error) {
      // A cancelled request ends quietly; VS Code already knows it stopped.
      if (token.isCancellationRequested) return;
      throw error;
    } finally {
      cancellation.dispose();
    }
  }

  async provideTokenCount(
    _model: AbliteratedModel,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    return estimateTokens(text);
  }
}
