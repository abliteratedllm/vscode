# AbliteratedLLM for VS Code

Adds the [AbliteratedLLM](https://abliteratedllm.dev) models to the model picker of VS Code chat, including agent mode. You use your own AbliteratedLLM API key, and requests are billed to your prepaid AbliteratedLLM credit.

AbliteratedLLM is a pay-per-token API for open-weight models. Its flagship, GLM-5.3 Flash Abliterated, is abliterated: its refusal behavior was removed from the weights. The other models are labelled **Stock model**: they are the vendors' original weights and keep the vendors' own refusals.

The extension uses only VS Code's stable Language Model Chat Provider API.

## Requirements

- VS Code 1.104 or later, with chat available.
- An AbliteratedLLM API key from [abliteratedllm.dev/dashboard/keys](https://abliteratedllm.dev/dashboard/keys). Keys start with `sk-`. A key with a daily spend cap is a good idea for agent work.
- Copilot Business and Enterprise administrators can turn off models from extensions with the **Bring Your Own Language Model Key** policy. If AbliteratedLLM never appears under **Add Models**, ask your administrator.

## Set up

1. Install the extension.
2. Open the model picker in chat and select **Manage Models** (or run **Chat: Manage Language Models**).
3. Select **Add Models** → **AbliteratedLLM** and paste your key. The extension checks it with `GET /v1/balance`, which costs nothing, and saves it in VS Code's secret storage.
4. Pick an AbliteratedLLM model in the chat model picker.

You can also run **Manage AbliteratedLLM** from the Command Palette at any time, or set the `ABLITERATEDLLM_API_KEY` environment variable before starting VS Code. A key saved in VS Code takes precedence over the environment variable.

## Commands

| Command | What it does |
| --- | --- |
| **Manage AbliteratedLLM** | Set or replace the key, show the balance, refresh the model list, or remove the saved key. The gear next to AbliteratedLLM in the Language Models editor opens it too. |
| **AbliteratedLLM: Set API Key** | Asks for a key, checks it and saves it. |
| **AbliteratedLLM: Remove API Key** | Deletes the key saved in VS Code. |
| **AbliteratedLLM: Show Balance** | Shows your available credit, credit held by running requests, what is left of the key's spend caps, and whether the account is a trial. |
| **AbliteratedLLM: Refresh Models** | Reads the model list again. |

## Models

The list comes from the public `GET https://api.abliteratedllm.dev/v1/models` (no key is sent) and is reused for 10 minutes. GLM-5.3 Flash Abliterated is listed first.

- Each model's detail line shows whether it is abliterated or a stock model, and its price in USD per 1M input and output tokens. Hover a model for the context window, the cached-input price and its input types. See [pricing](https://abliteratedllm.dev/pricing).
- Tool calling is on for every model, so every model is available in agent mode.
- Image attachments are sent only to models that accept images.
- Every model reasons before it answers. VS Code's stable API has no way to show reasoning, so you see only the answer; reasoning tokens are still billed as output tokens.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `abliteratedllm.reasoningEffort` | `low` | Sent as `reasoning_effort`: `low`, `medium` or `high`. More reasoning is slower and costs more output tokens. |
| `abliteratedllm.maxOutputTokens` | `8192` | Output budget per request, sent as `max_tokens` and lowered to each model's own limit. It covers reasoning and the answer. |

Every request sends an explicit `max_tokens`. The API holds that budget against your balance and the key's spend caps while the request runs, so a large value can make a capped key refuse expensive models. If a reply stops with an "output budget" error, raise `abliteratedllm.maxOutputTokens` or lower the reasoning effort.

## Trial accounts

Trial accounts allow 1 request at a time and cap output at 4096 tokens per request, which is tight for agent mode. See [Rate limits and trial](https://abliteratedllm.dev/docs/rate-limits).

## Data and privacy

This section describes what the extension sends, when, where it goes, and how long it is kept.

**When data is sent**

- When you send a chat message to an AbliteratedLLM model, or another extension sends a request to one through VS Code's language model API.
- When VS Code lists models: the public model list is read without your key or any prompt.
- When you set a key or run **Show Balance**: `GET /v1/balance` with your key.

Apart from these, the extension sends nothing. It has no telemetry or analytics.

**What is sent**

With each chat request: the conversation as VS Code passes it to the extension. That includes your messages, the system prompt, any files, code or other context that VS Code or your tools attach, tool definitions, tool calls and tool results, and images when the model accepts them. The request also carries your API key, the model id and the settings above.

**Where it goes**

- Everything goes to `https://api.abliteratedllm.dev` over HTTPS. Traffic passes through Cloudflare in transit, which terminates TLS.
- The abliterated and stock models run on GPUs operated by Fireworks AI in the United States, under a zero-data-retention configuration.
- Models labelled **Official DeepSeek API** run on DeepSeek's servers in the People's Republic of China, and DeepSeek stores what you send them under its own privacy policy. The catalog lists no such model today; if one is added, its label appears in the model picker. Requests to those models are sent with reasoning turned off.

**Use, storage and retention**

- AbliteratedLLM does not store prompts or model outputs. The one exception: text that its automated check flags as child sexual abuse material is kept in a sealed incident record and reported as the law requires.
- An automated check scans prompt text before it reaches a model and output text after it completes. It blocks child sexual abuse material and actionable instructions for mass-casualty weapons. It reads text only, not images.
- Request metadata (time, key, model, token counts, cost, status, latency) is kept for 30 days, then rolled up into daily totals.
- Your API key stays on your machine in VS Code's secret storage, which uses the operating system's credential store.

**Anonymization**

Requests are not anonymous to AbliteratedLLM: each one is tied to your account through the API key. Accounts need no name, email or ID documents.

The full policy is at [abliteratedllm.dev/privacy](https://abliteratedllm.dev/privacy). Use of the API is covered by the [acceptable use policy](https://abliteratedllm.dev/acceptable-use). AbliteratedLLM is for adults (18+).

## Reporting problems

- Harmful or illegal output, or abuse: [abliteratedllm.dev/report](https://abliteratedllm.dev/report).
- Bugs in this extension: [GitHub issues](https://github.com/abliteratedllm/vscode/issues).
- Account or billing questions: support@abliteratedllm.dev. Include the request id from the error message if there is one.

## Errors

| Message | What to do |
| --- | --- |
| Missing or invalid API key | Run **Manage AbliteratedLLM** and set a key from the [keys page](https://abliteratedllm.dev/dashboard/keys). |
| Insufficient balance | Top up in [Billing](https://abliteratedllm.dev/dashboard/billing). |
| Key spend cap reached | Lower `abliteratedllm.maxOutputTokens`, pick a cheaper model, or raise the key's cap. |
| Rate limit or capacity | Wait for the time in the message. Trial accounts allow 1 request at a time. |
| Output budget reached | Raise `abliteratedllm.maxOutputTokens` or lower `abliteratedllm.reasoningEffort`. |

All error codes are listed in the [API errors reference](https://abliteratedllm.dev/docs/errors).

## Without this extension

VS Code's built-in **Custom Endpoint** provider can also reach the AbliteratedLLM API, if you write each model into `chatLanguageModels.json` yourself. See [docs/custom-endpoint.md](docs/custom-endpoint.md).

## Development

```bash
npm install
npm test           # unit tests (Node.js 22.18 or later)
npm run compile    # type-check and bundle to dist/
npx @vscode/vsce package
```

To try it, open this folder in VS Code and press F5 (**Run Extension**), which compiles and starts a development window with the extension loaded.

## License

[MIT](LICENSE)
