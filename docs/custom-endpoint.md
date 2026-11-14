# AbliteratedLLM through VS Code's Custom Endpoint provider

VS Code chat has a built-in **Custom Endpoint** model provider for endpoints that speak the Chat Completions API. It can reach AbliteratedLLM without this extension. The trade-off: you write each model into `chatLanguageModels.json` yourself and update it when the catalog changes, and there is no key check, balance command or default reasoning effort.

This page follows VS Code's [Custom Endpoint documentation](https://github.com/microsoft/vscode-docs/blob/main/docs/agent-customization/language-models.md#add-a-custom-endpoint-model). The configuration below has not been tested end to end with a live key.

## Set up

1. Get an API key from [abliteratedllm.dev/dashboard/keys](https://abliteratedllm.dev/dashboard/keys). Keys start with `sk-`.
2. In chat, open the model picker and select **Manage Models**, or run **Chat: Manage Language Models** from the Command Palette.
3. Select **Add Models** → **Custom Endpoint**.
4. Enter `AbliteratedLLM` as the group name.
5. Enter a display name and paste your API key. VS Code keeps the key in its secret storage and writes an `"apiKey": "${input:...}"` reference into the file, not the key itself.
6. Select **Chat Completions** as the API type.
7. VS Code opens `chatLanguageModels.json`. In the AbliteratedLLM entry, keep the `apiKey` line VS Code wrote and replace the `models` array with one of the arrays below.
8. Save the file and pick the model in the chat model picker. If it does not appear, restart VS Code.

## The flagship model only

```json
"models": [
  {
    "id": "glm-5.3-flash-abliterated",
    "name": "GLM-5.3 Flash Abliterated",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  }
]
```

## Every model in the catalog

The catalog as of 2026-11-14. Models other than GLM-5.3 Flash Abliterated are the vendors' original weights, marked `(Stock model)` in their names.

<details>
<summary>Show the <code>models</code> array for all 15 models</summary>

```json
"models": [
  {
    "id": "glm-5.3-flash-abliterated",
    "name": "GLM-5.3 Flash Abliterated",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "deepseek-v4.1-flash-1017",
    "name": "DeepSeek V4.1 Flash 1017 (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "deepseek-v4.1-flash-1017-ultrafast",
    "name": "DeepSeek V4.1 Flash 1017 Ultrafast (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "deepseek-v4.1-flash-original",
    "name": "DeepSeek V4.1 Flash (original) (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "glm-5.3-flash",
    "name": "GLM-5.3 Flash (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "glm-5.3",
    "name": "GLM-5.3 (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": false,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "glm-5.3-fast",
    "name": "GLM-5.3 Fast (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": false,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "kimi-k3",
    "name": "Kimi K3 (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "kimi-k3.1-pro",
    "name": "Kimi K3.1 Pro (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "kimi-k3-fast",
    "name": "Kimi K3 Fast (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "ember-1",
    "name": "Ember-1 (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "muse-spark-open",
    "name": "Muse Spark Open (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 1048576,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "qwen3.8-max",
    "name": "Qwen3.8 Max (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 262144,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "qwen3.8-2.4t-a95b",
    "name": "Qwen3.8-2.4T-A95B (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 262144,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  },
  {
    "id": "minimax-m3",
    "name": "MiniMax M3 (Stock model)",
    "url": "https://api.abliteratedllm.dev/v1/chat/completions",
    "toolCalling": true,
    "vision": true,
    "contextWindow": 512000,
    "maxOutputTokens": 8192,
    "thinking": true,
    "supportsReasoningEffort": ["low", "medium", "high"],
    "reasoningEffortFormat": "chat-completions"
  }
]
```

</details>

With the flagship model only, the whole entry looks like this. The `apiKey` reference is the one VS Code wrote for you; its name may differ.

```json
[
  {
    "name": "AbliteratedLLM",
    "vendor": "customendpoint",
    "apiKey": "${input:abliteratedllmApiKey}",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "glm-5.3-flash-abliterated",
        "name": "GLM-5.3 Flash Abliterated",
        "url": "https://api.abliteratedllm.dev/v1/chat/completions",
        "toolCalling": true,
        "vision": true,
        "contextWindow": 1048576,
        "maxOutputTokens": 8192,
        "thinking": true,
        "supportsReasoningEffort": ["low", "medium", "high"],
        "reasoningEffortFormat": "chat-completions"
      }
    ]
  }
]
```

## What the values do

- `url`: the full Chat Completions endpoint, `https://api.abliteratedllm.dev/v1/chat/completions`, the same for every model.
- `contextWindow`: the model's `context_length` from the catalog. VS Code derives the input limit as `contextWindow` minus `maxOutputTokens`.
- `maxOutputTokens`: the output budget per request. The catalog lists a maximum output equal to the whole context window for most models, so pick a budget instead; 8192 leaves room for reasoning and an answer with file edits. With `thinking: true`, VS Code sends this value as `max_completion_tokens`, which the API accepts. Without `thinking: true`, VS Code sends no output budget and the API's default of 16384 tokens applies. Each request holds its budget against your balance and the key's spend caps while it runs.
- `thinking: true`: every AbliteratedLLM model reasons before it answers. Reasoning tokens are billed as output tokens and count toward the budget.
- `supportsReasoningEffort` with `reasoningEffortFormat: "chat-completions"`: shows a **Thinking Effort** picker in the model picker and sends the choice as a top-level `reasoning_effort`. Choose **Low** for the fastest and cheapest replies.
- `toolCalling: true`: the API takes function tools on every model, so the models are available in agent mode.
- `vision`: `true` for the models that accept images. GLM-5.3 Flash also accepts video, which Custom Endpoint has no setting for.

The behavior of `thinking` and `maxOutputTokens` described above comes from reading the Copilot Chat source in `microsoft/vscode`, not from a test run.

## Things to know

- **List the models explicitly.** Custom Endpoint also has a provider-level `url` for automatic model discovery. From the Copilot Chat source, discovery keeps only models VS Code already knows about, so it would list none of the AbliteratedLLM models.
- **Keep the list current.** When models are added or removed, compare your file with the public catalog at `https://api.abliteratedllm.dev/v1/models` (no key needed) or [abliteratedllm.dev/models.json](https://abliteratedllm.dev/models.json).
- **Trial accounts** allow 1 request at a time and cap output at 4096 tokens per request. See [Rate limits and trial](https://abliteratedllm.dev/docs/rate-limits).
- **Errors** are described in the [API errors reference](https://abliteratedllm.dev/docs/errors).

## Compared with the extension

| | Custom Endpoint | AbliteratedLLM extension |
| --- | --- | --- |
| Model list | Written by hand | Read from the public catalog |
| Prices in the model picker | No | Yes |
| Key check and balance | No | `GET /v1/balance` on setup; **Show Balance** command |
| Reasoning effort | Thinking Effort picker per model | `abliteratedllm.reasoningEffort` setting, `low` by default |
| Output budget | `maxOutputTokens` per model | `abliteratedllm.maxOutputTokens` setting, `8192` by default |

Either way, your requests go to the same API with the same data handling. See [Data and privacy](../README.md#data-and-privacy) and the [privacy policy](https://abliteratedllm.dev/privacy).
