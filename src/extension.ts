import * as vscode from "vscode";
import { API_KEY_ENV, KEYS_URL, describeBalance, fetchBalance } from "./api.ts";
import { AbliteratedLLMProvider, SECRET_KEY } from "./provider.ts";

/** The `languageModelChatProviders` vendor in package.json. */
const VENDOR = "abliteratedllm";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new AbliteratedLLMProvider(context.secrets);

  const setApiKey = async (): Promise<void> => {
    await provider.promptForApiKey();
  };

  const removeApiKey = async (): Promise<void> => {
    await context.secrets.delete(SECRET_KEY);
    provider.notifyChanged();
    const message = process.env[API_KEY_ENV]?.trim()
      ? `Removed the saved AbliteratedLLM key. ${API_KEY_ENV} is still set, so that key is used.`
      : "Removed the saved AbliteratedLLM key.";
    void vscode.window.showInformationMessage(message);
  };

  const showBalance = async (): Promise<void> => {
    const credentials = await provider.apiKey();
    if (credentials === undefined) {
      const choice = await vscode.window.showWarningMessage("No AbliteratedLLM API key is set.", "Set API Key");
      if (choice === "Set API Key") await setApiKey();
      return;
    }
    try {
      const balance = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Reading the AbliteratedLLM balance…" },
        () => fetchBalance(credentials.key, AbortSignal.timeout(15_000)),
      );
      void vscode.window.showInformationMessage(describeBalance(balance));
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const refreshModels = (): void => {
    provider.refresh();
    void vscode.window.showInformationMessage("AbliteratedLLM models will be listed again.");
  };

  const manage = async (): Promise<void> => {
    const credentials = await provider.apiKey();
    const keyState =
      credentials === undefined
        ? "No key set"
        : credentials.source === "saved"
          ? "Key saved in VS Code"
          : `Key from ${API_KEY_ENV}`;
    type Item = vscode.QuickPickItem & { run: () => unknown };
    const items: Item[] = [
      {
        label: credentials?.source === "saved" ? "$(key) Replace API key" : "$(key) Set API key",
        detail: `${keyState}. Keys are created at ${KEYS_URL}.`,
        run: setApiKey,
      },
      { label: "$(credit-card) Show balance", run: showBalance },
      { label: "$(refresh) Refresh models", run: refreshModels },
    ];
    if (credentials?.source === "saved") {
      items.push({ label: "$(trash) Remove saved API key", run: removeApiKey });
    }
    const picked = await vscode.window.showQuickPick(items, { title: "Manage AbliteratedLLM" });
    await picked?.run();
  };

  context.subscriptions.push(
    provider,
    vscode.lm.registerLanguageModelChatProvider(VENDOR, provider),
    vscode.commands.registerCommand("abliteratedllm.manage", manage),
    vscode.commands.registerCommand("abliteratedllm.setApiKey", setApiKey),
    vscode.commands.registerCommand("abliteratedllm.removeApiKey", removeApiKey),
    vscode.commands.registerCommand("abliteratedllm.showBalance", showBalance),
    vscode.commands.registerCommand("abliteratedllm.refreshModels", refreshModels),
    // A key saved or removed in another window.
    context.secrets.onDidChange((event) => {
      if (event.key === SECRET_KEY) provider.notifyChanged();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("abliteratedllm.maxOutputTokens")) provider.notifyChanged();
    }),
  );
}
