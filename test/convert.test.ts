import assert from "node:assert/strict";
import { test } from "node:test";
import type * as vscode from "vscode";
import { buildChatRequest, estimateTokens, toChatMessages } from "../src/convert.ts";
import type { AbliteratedModel } from "../src/models.ts";
import {
  LanguageModelDataPart,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
  LanguageModelToolResultPart,
} from "./vscode-stub.ts";

const USER = 1;
const ASSISTANT = 2;
const SYSTEM = 3;

const message = (role: number, ...content: unknown[]): vscode.LanguageModelChatRequestMessage =>
  ({ role, content, name: undefined }) as unknown as vscode.LanguageModelChatRequestMessage;

const text = (value: string) => new LanguageModelTextPart(value);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PNG_URL = "data:image/png;base64,iVBORw==";

const MODEL: AbliteratedModel = {
  id: "glm-5.3-flash-abliterated",
  name: "GLM-5.3 Flash Abliterated",
  family: "glm-5.3-flash-abliterated",
  version: "1",
  maxInputTokens: 1048576 - 8192,
  maxOutputTokens: 8192,
  capabilities: { imageInput: true, toolCalling: true },
  officialApi: false,
};

const options = (
  extra: Partial<vscode.ProvideLanguageModelChatResponseOptions> = {},
): vscode.ProvideLanguageModelChatResponseOptions =>
  ({ toolMode: 1, ...extra }) as vscode.ProvideLanguageModelChatResponseOptions;

test("maps system, user and assistant text", () => {
  const messages = toChatMessages(
    [
      message(SYSTEM, text("You are terse.")),
      message(USER, text("Hello "), text("there.")),
      message(ASSISTANT, text("Hi.")),
    ],
    true,
  );
  assert.deepEqual(messages, [
    { role: "system", content: "You are terse." },
    { role: "user", content: "Hello there." },
    { role: "assistant", content: "Hi." },
  ]);
});

test("maps a tool round trip: assistant tool_calls, then tool messages before the user's text", () => {
  const messages = toChatMessages(
    [
      message(USER, text("Read a.ts")),
      message(
        ASSISTANT,
        new LanguageModelToolCallPart("call_1", "read_file", { path: "a.ts" }),
        new LanguageModelToolCallPart("call_2", "list_dir", {}),
      ),
      message(
        USER,
        new LanguageModelToolResultPart("call_1", [text("export const a = 1;")]),
        new LanguageModelToolResultPart("call_2", [text("a.ts\nb.ts")]),
        text("Now summarize."),
      ),
    ],
    true,
  );
  assert.deepEqual(messages, [
    { role: "user", content: "Read a.ts" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } },
        { id: "call_2", type: "function", function: { name: "list_dir", arguments: "{}" } },
      ],
    },
    { role: "tool", tool_call_id: "call_1", content: "export const a = 1;" },
    { role: "tool", tool_call_id: "call_2", content: "a.ts\nb.ts" },
    { role: "user", content: "Now summarize." },
  ]);
});

test("keeps assistant text next to its tool calls", () => {
  const [assistant] = toChatMessages(
    [message(ASSISTANT, text("Let me look."), new LanguageModelToolCallPart("c", "f", { x: 1 }))],
    true,
  );
  assert.deepEqual(assistant, {
    role: "assistant",
    content: "Let me look.",
    tool_calls: [{ id: "c", type: "function", function: { name: "f", arguments: '{"x":1}' } }],
  });
});

test("sends images as data URLs to vision models and a note to the others", () => {
  const input = [message(USER, text("What is this?"), new LanguageModelDataPart(PNG, "image/png"))];
  assert.deepEqual(toChatMessages(input, true), [
    {
      role: "user",
      content: [
        { type: "text", text: "What is this?" },
        { type: "image_url", image_url: { url: PNG_URL } },
      ],
    },
  ]);
  assert.deepEqual(toChatMessages(input, false), [
    { role: "user", content: "What is this?[Image omitted: this model does not accept images.]" },
  ]);
});

test("moves images from a tool result into the user message after the tool messages", () => {
  const messages = toChatMessages(
    [
      message(ASSISTANT, new LanguageModelToolCallPart("shot", "screenshot", {})),
      message(
        USER,
        new LanguageModelToolResultPart("shot", [text("Captured."), new LanguageModelDataPart(PNG, "image/png")]),
      ),
    ],
    true,
  );
  assert.deepEqual(messages.slice(1), [
    { role: "tool", tool_call_id: "shot", content: "Captured." },
    { role: "user", content: [{ type: "image_url", image_url: { url: PNG_URL } }] },
  ]);
});

test("decodes JSON and text data parts and drops markers such as cache_control", () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const messages = toChatMessages(
    [
      message(
        USER,
        text("Context: "),
        new LanguageModelDataPart(encode('{"a":1}'), "application/json"),
        new LanguageModelDataPart(encode("ephemeral"), "cache_control"),
      ),
    ],
    true,
  );
  assert.deepEqual(messages, [{ role: "user", content: 'Context: {"a":1}' }]);
});

test("drops messages and parts it cannot send", () => {
  const thinking = { value: "hidden reasoning", id: "t1" };
  const messages = toChatMessages(
    [message(ASSISTANT, thinking), message(USER, thinking), message(SYSTEM, text(""))],
    true,
  );
  assert.deepEqual(messages, []);
});

test("builds a request with an explicit max_tokens and low reasoning effort", () => {
  const body = buildChatRequest(MODEL, [message(USER, text("Hi"))], options(), "low");
  assert.deepEqual(body, {
    model: "glm-5.3-flash-abliterated",
    messages: [{ role: "user", content: "Hi" }],
    stream: true,
    max_tokens: 8192,
    reasoning_effort: "low",
  });
});

test("turns reasoning off for DeepSeek official API models", () => {
  const body = buildChatRequest({ ...MODEL, officialApi: true }, [], options(), "high");
  assert.equal(body.reasoning_effort, "none");
});

test("maps tools, and tool mode Required to tool_choice required", () => {
  const tools = [
    {
      name: "read_file",
      description: "Read a file.",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    { name: "now", description: "Current time." },
  ];
  const auto = buildChatRequest(MODEL, [], options({ tools }), "medium");
  assert.deepEqual(auto.tools, [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a file.",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    },
    {
      type: "function",
      function: { name: "now", description: "Current time.", parameters: { type: "object", properties: {} } },
    },
  ]);
  assert.equal(auto.tool_choice, undefined);
  assert.equal(auto.reasoning_effort, "medium");

  const required = buildChatRequest(MODEL, [], options({ tools, toolMode: 2 }), "low");
  assert.equal(required.tool_choice, "required");

  const none = buildChatRequest(MODEL, [], options({ tools: [], toolMode: 2 }), "low");
  assert.equal("tools" in none, false);
  assert.equal("tool_choice" in none, false);
});

test("takes temperature, top_p and a lower max_tokens from modelOptions", () => {
  const lower = buildChatRequest(
    MODEL,
    [],
    options({ modelOptions: { temperature: 0.2, top_p: 0.9, max_tokens: 1024, seed: 7 } }),
    "low",
  );
  assert.equal(lower.temperature, 0.2);
  assert.equal(lower.top_p, 0.9);
  assert.equal(lower.max_tokens, 1024);
  assert.equal("seed" in lower, false);

  const higher = buildChatRequest(MODEL, [], options({ modelOptions: { max_tokens: 100_000 } }), "low");
  assert.equal(higher.max_tokens, 8192);
});

test("estimates tokens at four characters each, plus a flat amount per image", () => {
  assert.equal(estimateTokens("12345678"), 2);
  assert.equal(estimateTokens("123456789"), 3);
  const withImage = message(USER, text("12345678"), new LanguageModelDataPart(PNG, "image/png"));
  assert.equal(estimateTokens(withImage), 2 + 1000);
  const toolCall = message(ASSISTANT, new LanguageModelToolCallPart("c", "abcd", {}));
  assert.equal(estimateTokens(toolCall), Math.ceil(("abcd".length + "{}".length) / 4));
});
