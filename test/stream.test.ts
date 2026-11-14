import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../src/api.ts";
import { ChatStreamParser, type StreamEvent } from "../src/stream.ts";

const data = (chunk: object): string => `data: ${JSON.stringify(chunk)}\n\n`;
const delta = (value: object, finish: string | null = null): string =>
  data({ object: "chat.completion.chunk", choices: [{ index: 0, delta: value, finish_reason: finish }] });
const USAGE = data({ choices: [], usage: { prompt_tokens: 31, completion_tokens: 212, total_tokens: 243 } });

/** Feeds `body` to a parser in pieces of `size` characters and collects every event. */
function parse(body: string, size = body.length, events: StreamEvent[] = []): StreamEvent[] {
  const parser = new ChatStreamParser();
  const emit = (event: StreamEvent) => events.push(event);
  for (let i = 0; i < body.length; i += size) parser.push(body.slice(i, i + size), emit);
  parser.end(emit);
  return events;
}

test("streams text, skipping pings, reasoning and the usage chunk", () => {
  const body =
    ": ping\n\n" +
    delta({ role: "assistant", reasoning_content: "Thinking about rain." }) +
    delta({ content: "Rain " }) +
    delta({ content: "falls." }) +
    delta({}, "stop") +
    USAGE +
    "data: [DONE]\n\n";
  for (const size of [body.length, 7, 1]) {
    const events = parse(body, size);
    assert.deepEqual(events, [
      { type: "text", text: "Rain " },
      { type: "text", text: "falls." },
    ]);
  }
});

test("accepts CRLF line endings", () => {
  const body = (delta({ content: "Hi" }) + delta({}, "stop")).replaceAll("\n", "\r\n");
  assert.deepEqual(parse(body, 3), [{ type: "text", text: "Hi" }]);
});

test("assembles parallel tool calls and emits them when the choice finishes", () => {
  const body =
    delta({ content: "Checking." }) +
    delta({
      tool_calls: [
        { index: 0, id: "call_a", type: "function", function: { name: "read_file", arguments: "" } },
      ],
    }) +
    delta({ tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] }) +
    delta({
      tool_calls: [
        { index: 1, id: "call_b", type: "function", function: { name: "list_dir", arguments: "" } },
      ],
    }) +
    delta({ tool_calls: [{ index: 0, function: { arguments: '"src/a.ts"}' } }] }) +
    delta({}, "tool_calls") +
    USAGE;
  assert.deepEqual(parse(body, 11), [
    { type: "text", text: "Checking." },
    { type: "toolCall", callId: "call_a", name: "read_file", input: { path: "src/a.ts" } },
    { type: "toolCall", callId: "call_b", name: "list_dir", input: {} },
  ]);
});

test("gives a tool call without an id a generated one", () => {
  const body =
    delta({ tool_calls: [{ index: 0, function: { name: "now", arguments: "{}" } }] }) +
    delta({}, "tool_calls");
  const [event] = parse(body);
  assert.equal(event?.type, "toolCall");
  assert.ok(event?.type === "toolCall" && event.callId.startsWith("call_"));
});

test("rejects tool arguments that are not a JSON object", () => {
  const body =
    delta({ tool_calls: [{ index: 0, id: "c", function: { name: "f", arguments: '{"a":' } }] }) +
    delta({}, "tool_calls");
  assert.throws(() => parse(body), /arguments for tool "f" that are not a JSON object/);
});

test("throws the error object a stream carries after the 200 status", () => {
  const body =
    delta({ content: "Partial" }) +
    data({ error: { type: "api_error", code: "upstream_error", message: "The model backend failed." } });
  const events: StreamEvent[] = [];
  assert.throws(
    () => parse(body, body.length, events),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "upstream_error" &&
      error.message.includes("The model backend failed."),
  );
  // The text before the error, in the same network chunk, still reached the caller.
  assert.deepEqual(events, [{ type: "text", text: "Partial" }]);
});

test("throws a plain JSON error body that is not SSE", () => {
  assert.throws(
    () => parse('\n\n{"error":{"type":"api_error","code":"upstream_error","message":"Time limit reached."}}\n'),
    (error: unknown) => error instanceof ApiError && error.code === "upstream_error",
  );
});

test("explains a response cut at the output budget, after passing on the text before it", () => {
  for (const body of [
    delta({ content: "The answer is" }) + delta({}, "length"),
    // Text and the finish reason in one chunk, with no trailing newline.
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "The answer is" }, finish_reason: "length" }] })}`,
  ]) {
    const events: StreamEvent[] = [];
    assert.throws(() => parse(body, body.length, events), /abliteratedllm\.maxOutputTokens/);
    assert.deepEqual(events, [{ type: "text", text: "The answer is" }]);
  }
});

test("throws when the stream ends before the model finished", () => {
  assert.throws(() => parse(delta({ content: "Half" })), /ended before the model finished/);
});
