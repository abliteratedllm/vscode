/**
 * Turns a VS Code chat request into a `POST /v1/chat/completions` body: messages, function tools,
 * the output budget and the reasoning effort.
 */

import * as vscode from "vscode";
import type { AbliteratedModel } from "./models.ts";

export type ReasoningEffort = "low" | "medium" | "high";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  stream: true;
  max_tokens: number;
  reasoning_effort: ReasoningEffort | "none";
  tools?: { type: "function"; function: { name: string; description: string; parameters: object } }[];
  tool_choice?: "required";
  temperature?: number;
  top_p?: number;
}

/**
 * `LanguageModelChatMessageRole.System`. It is in a proposed API, but Copilot sends system
 * messages with this role value at runtime.
 */
const SYSTEM_ROLE = 3;

/** Rough token count for an image in `provideTokenCount`; the API reports the real count. */
const IMAGE_TOKEN_ESTIMATE = 1000;

const IMAGE_OMITTED = "[Image omitted: this model does not accept images.]";

/**
 * A `LanguageModelDataPart` (an image, JSON or text, or a marker such as Copilot's
 * `cache_control`). Matched by shape: the class is only in the stable API from VS Code 1.106.
 */
interface DataPart {
  mimeType: string;
  data: Uint8Array;
}

function asDataPart(part: unknown): DataPart | undefined {
  if (typeof part !== "object" || part === null) return undefined;
  const { mimeType, data } = part as Partial<DataPart>;
  return typeof mimeType === "string" && data instanceof Uint8Array ? { mimeType, data } : undefined;
}

/** The text a data part stands for; undefined for images and for markers that carry no content. */
function dataText(part: DataPart): string | undefined {
  const mime = part.mimeType.toLowerCase();
  if (mime.startsWith("text/") || mime === "application/json" || mime.endsWith("+json")) {
    return new TextDecoder().decode(part.data);
  }
  return undefined;
}

/** Text and data parts of a message or tool result, as content parts. Other parts are left out. */
function contentParts(parts: readonly unknown[], vision: boolean): ContentPart[] {
  const out: ContentPart[] = [];
  for (const part of parts) {
    if (part instanceof vscode.LanguageModelTextPart) {
      if (part.value !== "") out.push({ type: "text", text: part.value });
      continue;
    }
    if (part instanceof vscode.LanguageModelPromptTsxPart) {
      out.push({ type: "text", text: JSON.stringify(part.value) });
      continue;
    }
    const data = asDataPart(part);
    if (data === undefined) continue;
    if (data.mimeType.toLowerCase().startsWith("image/")) {
      const url = `data:${data.mimeType};base64,${Buffer.from(data.data).toString("base64")}`;
      out.push(vision ? { type: "image_url", image_url: { url } } : { type: "text", text: IMAGE_OMITTED });
      continue;
    }
    const text = dataText(data);
    if (text !== undefined && text !== "") out.push({ type: "text", text });
  }
  return out;
}

const joinText = (parts: readonly ContentPart[]): string =>
  parts.map((part) => (part.type === "text" ? part.text : "")).join("");

/**
 * Chat Completions messages for VS Code's messages. A user message's tool results become `tool`
 * messages placed before the rest of it, right after the assistant message that called the tools.
 * Images in a tool result move into that user message, because `tool` messages take text only.
 * Images are sent only when `vision` is true; otherwise a short note takes their place.
 */
export function toChatMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  vision: boolean,
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const message of messages) {
    const role: number = message.role;
    if (role === vscode.LanguageModelChatMessageRole.Assistant) {
      const content = joinText(contentParts(message.content, false));
      const toolCalls: ToolCall[] = message.content
        .filter((part) => part instanceof vscode.LanguageModelToolCallPart)
        .map((part) => ({
          id: part.callId,
          type: "function",
          function: { name: part.name, arguments: JSON.stringify(part.input ?? {}) },
        }));
      if (toolCalls.length > 0) {
        out.push({ role: "assistant", content: content === "" ? null : content, tool_calls: toolCalls });
      } else if (content !== "") {
        out.push({ role: "assistant", content });
      }
      continue;
    }
    if (role === SYSTEM_ROLE) {
      const content = joinText(contentParts(message.content, false));
      if (content !== "") out.push({ role: "system", content });
      continue;
    }
    // User messages, and any role this extension does not know.
    const userParts: ContentPart[] = [];
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelToolResultPart) {
        const parts = contentParts(part.content, vision);
        out.push({ role: "tool", tool_call_id: part.callId, content: joinText(parts) });
        userParts.push(...parts.filter((p) => p.type === "image_url"));
      } else {
        userParts.push(...contentParts([part], vision));
      }
    }
    if (userParts.length === 0) continue;
    out.push({
      role: "user",
      content: userParts.every((p) => p.type === "text") ? joinText(userParts) : userParts,
    });
  }
  return out;
}

/** Function tools in the Chat Completions form. */
export function toTools(
  tools: readonly vscode.LanguageModelChatTool[],
): NonNullable<ChatRequestBody["tools"]> {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

/**
 * The request body for one VS Code chat request. Always sets `max_tokens`, because the API's
 * default (16384) is held against the balance and the key's spend caps for every request.
 * `modelOptions` from the calling extension may set `temperature`, `top_p` and a lower
 * `max_tokens`.
 */
export function buildChatRequest(
  model: AbliteratedModel,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  reasoningEffort: ReasoningEffort,
): ChatRequestBody {
  const modelOptions: Record<string, unknown> = options.modelOptions ?? {};
  const requestedMax = modelOptions.max_tokens;
  const maxTokens =
    typeof requestedMax === "number" && Number.isInteger(requestedMax) && requestedMax > 0
      ? Math.min(requestedMax, model.maxOutputTokens)
      : model.maxOutputTokens;

  const body: ChatRequestBody = {
    model: model.id,
    messages: toChatMessages(messages, model.capabilities.imageInput === true),
    stream: true,
    max_tokens: maxTokens,
    // DeepSeek's official API rejects an assistant turn sent back without its reasoning_content,
    // which VS Code's stable API cannot keep, so those models answer without reasoning.
    reasoning_effort: model.officialApi ? "none" : reasoningEffort,
  };
  const tools = options.tools ?? [];
  if (tools.length > 0) {
    body.tools = toTools(tools);
    if (options.toolMode === vscode.LanguageModelChatToolMode.Required) body.tool_choice = "required";
  }
  if (typeof modelOptions.temperature === "number") body.temperature = modelOptions.temperature;
  if (typeof modelOptions.top_p === "number") body.top_p = modelOptions.top_p;
  return body;
}

/** Characters / 4, the estimate other VS Code providers use; images count a flat amount. */
export function estimateTokens(input: string | vscode.LanguageModelChatRequestMessage): number {
  if (typeof input === "string") return Math.ceil(input.length / 4);
  let chars = 0;
  let images = 0;
  const count = (parts: readonly unknown[]): void => {
    for (const part of parts) {
      if (part instanceof vscode.LanguageModelTextPart) chars += part.value.length;
      else if (part instanceof vscode.LanguageModelToolCallPart) {
        chars += part.name.length + JSON.stringify(part.input ?? {}).length;
      } else if (part instanceof vscode.LanguageModelToolResultPart) count(part.content);
      else if (part instanceof vscode.LanguageModelPromptTsxPart) {
        chars += JSON.stringify(part.value).length;
      } else {
        const data = asDataPart(part);
        if (data === undefined) continue;
        if (data.mimeType.toLowerCase().startsWith("image/")) images += 1;
        else chars += dataText(data)?.length ?? 0;
      }
    }
  };
  count(input.content);
  return Math.ceil(chars / 4) + images * IMAGE_TOKEN_ESTIMATE;
}
