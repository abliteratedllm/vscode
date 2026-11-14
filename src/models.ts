import type { LanguageModelChatInformation } from "vscode";
import { isRecord } from "./api.ts";

/** Listed first in the model picker: the abliterated flagship. */
export const DEFAULT_MODEL_ID = "glm-5.3-flash-abliterated";

/** A model as this extension reports it to VS Code, which hands the same object back per request. */
export interface AbliteratedModel extends LanguageModelChatInformation {
  /**
   * Served by DeepSeek's official API (`variant: "official_api"`). Requests to these models turn
   * reasoning off, because that API rejects an assistant turn sent back without its
   * `reasoning_content`, and VS Code's stable API has no place to keep it.
   */
  readonly officialApi: boolean;
}

const positiveInt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

const priceText = (value: unknown): string | undefined =>
  typeof value === "string" && /^\d+(\.\d+)?$/.test(value) ? value : undefined;

/**
 * The output budget for a model: the user's `maxOutputTokens` setting, lowered to the model's
 * `max_output_tokens`, and to half the context window so that input keeps room. The catalog
 * reports `max_output_tokens` equal to `context_length` for most models, and VS Code needs
 * input + output to fit the context window.
 */
export function outputBudget(contextLength: number, maxOutput: number, setting: number): number {
  return Math.max(1, Math.min(setting, maxOutput, Math.floor(contextLength / 2)));
}

/**
 * The VS Code model for one `GET /v1/models` entry, or undefined when the entry lacks an id or a
 * token limit. `outputSetting` is the `abliteratedllm.maxOutputTokens` setting.
 */
export function toChatModel(entry: unknown, outputSetting: number): AbliteratedModel | undefined {
  if (!isRecord(entry)) return undefined;
  const { id, name, variant, provider_label: label, input_modalities: modalities } = entry;
  const contextLength = positiveInt(entry.context_length);
  const maxOutput = positiveInt(entry.max_output_tokens);
  if (typeof id !== "string" || id === "" || contextLength === undefined || maxOutput === undefined) {
    return undefined;
  }
  const displayName = typeof name === "string" && name !== "" ? name : id;
  const maxOutputTokens = outputBudget(contextLength, maxOutput, outputSetting);
  const imageInput = Array.isArray(modalities) && modalities.includes("image");

  // "Abliterated", or the catalog's label for other variants ("Stock model").
  const kind =
    variant === "abliterated"
      ? "Abliterated"
      : typeof label === "string" && label !== ""
        ? label
        : "Stock model";
  const pricing = isRecord(entry.pricing) ? entry.pricing : {};
  const input = priceText(pricing.input);
  const output = priceText(pricing.output);
  const cachedInput = priceText(pricing.cached_input);
  const prices =
    input !== undefined && output !== undefined ? `$${input} in / $${output} out per 1M` : undefined;

  const tooltip = [
    variant === "abliterated"
      ? `${displayName}: abliterated, its refusal behavior was removed from the weights.`
      : `${displayName}: ${kind.toLowerCase()}, the vendor's original weights.`,
    `Context window ${contextLength.toLocaleString("en-US")} tokens; output budget ${maxOutputTokens.toLocaleString("en-US")} tokens (abliteratedllm.maxOutputTokens).`,
    prices !== undefined
      ? `USD per 1M tokens: ${input} input, ${output} output${cachedInput !== undefined ? `, ${cachedInput} cached input` : ""}.`
      : undefined,
    `Input: ${imageInput ? "text and images" : "text"}.`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return {
    id,
    name: displayName,
    family: id,
    version: typeof entry.created === "number" ? String(entry.created) : "1",
    detail: prices !== undefined ? `${kind} · ${prices}` : kind,
    tooltip,
    maxInputTokens: contextLength - maxOutputTokens,
    maxOutputTokens,
    // The API takes function tools on every model; it has no per-model flag for them.
    capabilities: { imageInput, toolCalling: true },
    officialApi: variant === "official_api",
  };
}

/** VS Code models for `GET /v1/models` entries in catalog order, `DEFAULT_MODEL_ID` first. */
export function toChatModels(entries: readonly unknown[], outputSetting: number): AbliteratedModel[] {
  const models = entries
    .map((entry) => toChatModel(entry, outputSetting))
    .filter((model) => model !== undefined);
  const flagship = models.findIndex((model) => model.id === DEFAULT_MODEL_ID);
  if (flagship > 0) models.unshift(...models.splice(flagship, 1));
  return models;
}
