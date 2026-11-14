/**
 * Parses a streaming `POST /v1/chat/completions` response (server-sent events) into text and
 * complete tool calls. No `vscode` import, so the unit tests can load this file directly.
 */

import { apiError, errorObjectOf, isRecord, parseJson } from "./api.ts";

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "toolCall"; callId: string; name: string; input: object };

interface PendingToolCall {
  id: string;
  name: string;
  args: string;
}

/**
 * Feed it the body text as it arrives (`push`), then call `end` once the body is done. Both hand
 * each event to `emit` as soon as it is complete, so an error later in the same chunk does not
 * lose output that came before it. Text is passed on as it streams; a tool call is passed on once
 * its arguments are complete, when the choice finishes. Reasoning (`reasoning_content`) is not
 * passed on: VS Code's stable API has no part for it.
 *
 * Throws an ApiError when the stream carries an `error` object, and an Error when the response
 * stops at the output budget or ends before the model finished.
 */
export class ChatStreamParser {
  private buffer = "";
  private readonly toolCalls = new Map<number, PendingToolCall>();
  private finishReason: string | undefined;

  push(chunk: string, emit: (event: StreamEvent) => void): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      this.parseLine(line, emit);
      newline = this.buffer.indexOf("\n");
    }
  }

  end(emit: (event: StreamEvent) => void): void {
    if (this.buffer !== "") {
      const line = this.buffer.replace(/\r$/, "");
      this.buffer = "";
      this.parseLine(line, emit);
    }
    if (this.finishReason === undefined) {
      throw new Error("AbliteratedLLM: the response ended before the model finished. Try again.");
    }
  }

  private parseLine(line: string, emit: (event: StreamEvent) => void): void {
    // Blank lines end an event, ": ping" is a keep-alive comment, and event/id/retry fields carry
    // nothing this parser needs.
    if (line === "" || line.startsWith(":")) return;
    if (!line.startsWith("data:")) {
      // Not SSE: an error object sent as plain JSON.
      this.throwIfError(parseJson(line));
      return;
    }
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    const chunk = parseJson(data);
    this.throwIfError(chunk);
    if (!isRecord(chunk) || !Array.isArray(chunk.choices)) return;
    // The final usage chunk has an empty `choices`. The API always returns one choice (n = 1).
    const choice: unknown = chunk.choices[0];
    if (!isRecord(choice)) return;
    const delta = isRecord(choice.delta) ? choice.delta : {};

    if (typeof delta.content === "string" && delta.content !== "") {
      emit({ type: "text", text: delta.content });
    }
    if (Array.isArray(delta.tool_calls)) {
      delta.tool_calls.forEach((call: unknown, position: number) => this.addToolCallDelta(call, position));
    }
    if (typeof choice.finish_reason === "string") {
      this.finish(choice.finish_reason, emit);
    }
  }

  /** Tool calls stream in pieces keyed by `index`: the id and name first, then the arguments. */
  private addToolCallDelta(call: unknown, position: number): void {
    if (!isRecord(call)) return;
    const index = typeof call.index === "number" ? call.index : position;
    const fn = isRecord(call.function) ? call.function : {};
    let pending = this.toolCalls.get(index);
    if (pending === undefined) {
      pending = { id: "", name: "", args: "" };
      this.toolCalls.set(index, pending);
    }
    if (typeof call.id === "string" && call.id !== "") pending.id = call.id;
    if (typeof fn.name === "string" && fn.name !== "") pending.name = fn.name;
    if (typeof fn.arguments === "string") pending.args += fn.arguments;
  }

  private finish(reason: string, emit: (event: StreamEvent) => void): void {
    this.finishReason = reason;
    if (reason === "length") {
      throw new Error(
        "AbliteratedLLM: the response reached its output budget before the model finished. " +
          'Reasoning counts toward the budget: raise "abliteratedllm.maxOutputTokens" or lower ' +
          '"abliteratedllm.reasoningEffort". Trial accounts are capped at 4096 output tokens.',
      );
    }
    const calls = [...this.toolCalls.entries()].sort(([a], [b]) => a - b);
    this.toolCalls.clear();
    for (const [index, call] of calls) {
      if (call.name === "") {
        throw new Error("AbliteratedLLM: the model sent a tool call without a tool name.");
      }
      const input = call.args.trim() === "" ? {} : parseJson(call.args);
      if (!isRecord(input)) {
        throw new Error(
          `AbliteratedLLM: the model sent arguments for tool "${call.name}" that are not a JSON object.`,
        );
      }
      emit({
        type: "toolCall",
        callId: call.id !== "" ? call.id : `call_${Date.now().toString(36)}_${index}`,
        name: call.name,
        input,
      });
    }
  }

  private throwIfError(body: unknown): void {
    const error = errorObjectOf(body);
    // Errors inside a stream arrive after the 200 status, so there is no Retry-After header.
    if (error) throw apiError(200, error);
  }
}
