import assert from "node:assert/strict";
import { test } from "node:test";
import { KEY_PATTERN, KEYS_URL, apiError, describeBalance, parseRetryAfter } from "../src/api.ts";

test("key pattern: sk- and 48 letters and digits", () => {
  assert.ok(KEY_PATTERN.test(`sk-${"aB3".repeat(16)}`));
  assert.ok(!KEY_PATTERN.test(`sk-${"a".repeat(47)}`));
  assert.ok(!KEY_PATTERN.test(`sk-${"a".repeat(49)}`));
  assert.ok(!KEY_PATTERN.test(`sk-${"a".repeat(47)}-`));
  assert.ok(!KEY_PATTERN.test(`pk-${"a".repeat(48)}`));
});

test("an invalid key error says where to set and create keys", () => {
  const error = apiError(
    401,
    { type: "authentication_error", code: "invalid_api_key", message: "Missing or invalid API key." },
    undefined,
    "req_123",
  );
  assert.equal(error.status, 401);
  assert.equal(error.code, "invalid_api_key");
  assert.ok(error.message.startsWith("AbliteratedLLM: Missing or invalid API key."));
  assert.ok(error.message.includes('"Manage AbliteratedLLM"'));
  assert.ok(error.message.includes(KEYS_URL));
  assert.ok(error.message.endsWith("(request id req_123)"));
});

test("a spend cap error points at the output budget setting", () => {
  const error = apiError(402, { code: "key_spend_cap_reached", message: "Spend cap reached." });
  assert.match(error.message, /abliteratedllm\.maxOutputTokens/);
});

test("a rate limit error gives the wait and the trial limit", () => {
  const error = apiError(429, { code: "rate_limit_exceeded", message: "Too many requests." }, 12);
  assert.equal(error.retryAfterSeconds, 12);
  assert.match(error.message, /1 request at a time/);
  assert.match(error.message, /Retry in 12 s\./);
});

test("an error without a body still says what happened", () => {
  assert.equal(apiError(502, undefined).message, "AbliteratedLLM: The request failed with HTTP 502.");
});

test("parses Retry-After seconds only", () => {
  assert.equal(parseRetryAfter("15"), 15);
  assert.equal(parseRetryAfter(" 3 "), 3);
  assert.equal(parseRetryAfter(null), undefined);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"), undefined);
});

test("describes a balance with key caps and the trial note", () => {
  assert.equal(
    describeBalance({
      balance_usd: "12.345678",
      held_usd: "0.010000",
      trial: true,
      available_usd: "12.345678",
      key_daily_remaining_usd: "4.500000",
      key_monthly_remaining_usd: null,
      key_lifetime_remaining_usd: "40.000000",
    }),
    "AbliteratedLLM Available: $12.345678; held by running requests: $0.010000; " +
      "key daily cap left: $4.500000; key lifetime cap left: $40.000000; " +
      "trial account (1 request at a time, 4096 output tokens).",
  );
  assert.equal(
    describeBalance({ balance_usd: "1.000000", held_usd: "0.000000", available_usd: "1.000000", trial: false }),
    "AbliteratedLLM Available: $1.000000.",
  );
});
