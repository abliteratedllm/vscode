/**
 * HTTP calls to the AbliteratedLLM API and the error messages shown for its failures. No `vscode`
 * import, so the unit tests can load this file directly.
 */

export const API_BASE_URL = "https://api.abliteratedllm.dev/v1";
export const KEYS_URL = "https://abliteratedllm.dev/dashboard/keys";
export const BILLING_URL = "https://abliteratedllm.dev/dashboard/billing";
export const RATE_LIMITS_URL = "https://abliteratedllm.dev/docs/rate-limits";
/** The format of every AbliteratedLLM API key. */
export const KEY_PATTERN = /^sk-[0-9A-Za-z]{48}$/;
/** Used when no key is saved in VS Code. */
export const API_KEY_ENV = "ABLITERATEDLLM_API_KEY";

/** An error from the API, with a message written for the person using VS Code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    message: string,
    status: number,
    code: string | undefined,
    retryAfterSeconds: number | undefined,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The `{"error": {...}}` object the API sends, in an HTTP error body or in a 200 body or stream. */
export interface ErrorObject {
  type?: unknown;
  code?: unknown;
  message?: unknown;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The `error` member of a parsed response body, if it has one. */
export function errorObjectOf(body: unknown): ErrorObject | undefined {
  return isRecord(body) && isRecord(body.error) ? body.error : undefined;
}

/** Seconds from a `Retry-After` header; undefined when absent or not a number of seconds. */
export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (header == null || !/^\d+$/.test(header.trim())) return undefined;
  return Number(header.trim());
}

/**
 * The ApiError for an API error: the server's own message plus what to do about it.
 * `requestId` is the `x-request-id` header, which support asks for.
 */
export function apiError(
  status: number,
  error: ErrorObject | undefined,
  retryAfterSeconds?: number,
  requestId?: string | null,
): ApiError {
  const code = typeof error?.code === "string" ? error.code : undefined;
  const serverMessage =
    typeof error?.message === "string" && error.message !== ""
      ? error.message
      : `The request failed with HTTP ${status}.`;
  let hint = "";
  if (code === "invalid_api_key" || status === 401) {
    hint = ` Set a valid key with the "Manage AbliteratedLLM" command. Keys are at ${KEYS_URL}.`;
  } else if (code === "insufficient_balance") {
    hint = ` Top up at ${BILLING_URL}.`;
  } else if (code === "key_spend_cap_reached") {
    hint =
      ` Each request holds its output budget against the key's caps, so lowering` +
      ` "abliteratedllm.maxOutputTokens" can help; caps are set at ${KEYS_URL}.`;
  } else if (code === "rate_limit_exceeded") {
    hint = ` Trial accounts allow 1 request at a time; see ${RATE_LIMITS_URL}.`;
  }
  const retry = retryAfterSeconds !== undefined ? ` Retry in ${retryAfterSeconds} s.` : "";
  const reference = requestId ? ` (request id ${requestId})` : "";
  return new ApiError(
    `AbliteratedLLM: ${serverMessage}${hint}${retry}${reference}`,
    status,
    code,
    retryAfterSeconds,
  );
}

/** Parses a JSON body that may start with the newlines a long-running request is sent with. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The ApiError for a non-2xx response. */
async function errorFromResponse(response: Response): Promise<ApiError> {
  const body = parseJson(await response.text().catch(() => ""));
  return apiError(
    response.status,
    errorObjectOf(body),
    parseRetryAfter(response.headers.get("retry-after")),
    response.headers.get("x-request-id"),
  );
}

/**
 * The JSON body of a successful non-streaming response. Throws the body's `error` even on
 * HTTP 200, which is how the API reports an error that happens after it sent the status.
 */
async function okJson(response: Response): Promise<unknown> {
  if (!response.ok) throw await errorFromResponse(response);
  const text = await response.text();
  const body = parseJson(text);
  const error = errorObjectOf(body);
  if (error) throw apiError(response.status, error, undefined, response.headers.get("x-request-id"));
  if (body === undefined) {
    throw new ApiError(
      `AbliteratedLLM: ${response.url || API_BASE_URL} returned a body that is not JSON.`,
      response.status,
      undefined,
      undefined,
    );
  }
  return body;
}

/** `data` of the public `GET /v1/models` (no key is sent). */
export async function fetchCatalog(signal?: AbortSignal): Promise<unknown[]> {
  const body = await okJson(await fetch(`${API_BASE_URL}/models`, { signal }));
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new Error(`AbliteratedLLM: ${API_BASE_URL}/models returned no model list.`);
  }
  return body.data;
}

/** `GET /v1/balance` for a key. Costs nothing, so it is also how a key is checked. */
export interface Balance {
  balance_usd?: string;
  held_usd?: string;
  available_usd?: string;
  trial?: boolean;
  key_daily_remaining_usd?: string | null;
  key_monthly_remaining_usd?: string | null;
  key_lifetime_remaining_usd?: string | null;
}

export async function fetchBalance(apiKey: string, signal?: AbortSignal): Promise<Balance> {
  const body = await okJson(
    await fetch(`${API_BASE_URL}/balance`, { headers: { Authorization: `Bearer ${apiKey}` }, signal }),
  );
  return isRecord(body) ? (body as Balance) : {};
}

/** One line per balance figure, for a notification. Amounts stay the API's decimal strings. */
export function describeBalance(balance: Balance): string {
  const parts = [`Available: $${balance.available_usd ?? balance.balance_usd ?? "?"}`];
  if (balance.held_usd && Number(balance.held_usd) !== 0) {
    parts.push(`held by running requests: $${balance.held_usd}`);
  }
  const caps: [string, string | null | undefined][] = [
    ["daily", balance.key_daily_remaining_usd],
    ["monthly", balance.key_monthly_remaining_usd],
    ["lifetime", balance.key_lifetime_remaining_usd],
  ];
  for (const [period, remaining] of caps) {
    if (typeof remaining === "string") parts.push(`key ${period} cap left: $${remaining}`);
  }
  if (balance.trial) parts.push("trial account (1 request at a time, 4096 output tokens)");
  return `AbliteratedLLM ${parts.join("; ")}.`;
}

/**
 * Starts a streaming `POST /v1/chat/completions` and returns the response once its status is in.
 * Throws an ApiError for a non-2xx status.
 */
export async function postChatCompletion(
  apiKey: string,
  body: object,
  signal: AbortSignal,
): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await errorFromResponse(response);
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    // Not a stream: an error in a 200 body, or something this extension cannot read.
    await okJson(response);
    throw new ApiError(
      "AbliteratedLLM: the API answered without a stream. Try again.",
      response.status,
      undefined,
      undefined,
    );
  }
  return response;
}
