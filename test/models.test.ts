import assert from "node:assert/strict";
import { test } from "node:test";
import { outputBudget, toChatModel, toChatModels } from "../src/models.ts";

// Entries as `GET /v1/models` returned them on 2026-11-14.
const FLAGSHIP = {
  id: "glm-5.3-flash-abliterated",
  object: "model",
  created: 1793664000,
  owned_by: "AbliteratedLLM",
  name: "GLM-5.3 Flash Abliterated",
  context_length: 1048576,
  max_output_tokens: 131072,
  pricing: { input: "0.0977", output: "0.3421", cached_input: "0.0098", priority: null },
  provider_label: null,
  variant: "abliterated",
  input_modalities: ["text", "image"],
  capabilities: { reasoning: true, vision: true, priority_tier: false },
  precision: "FP8",
};

const GLM_STOCK = {
  id: "glm-5.3",
  name: "GLM-5.3",
  created: 1793664000,
  context_length: 1048576,
  max_output_tokens: 1048576,
  pricing: { input: "1.26", output: "3.96", cached_input: "0.234", priority: null },
  provider_label: "Stock model",
  variant: "stock",
  input_modalities: ["text"],
  capabilities: { reasoning: true, vision: false, priority_tier: true },
};

const QWEN = {
  ...GLM_STOCK,
  id: "qwen3.8-max",
  name: "Qwen3.8 Max",
  context_length: 262144,
  max_output_tokens: 262144,
  input_modalities: ["text", "image"],
};

test("maps the abliterated flagship", () => {
  const model = toChatModel(FLAGSHIP, 8192);
  assert.ok(model);
  assert.equal(model.id, "glm-5.3-flash-abliterated");
  assert.equal(model.name, "GLM-5.3 Flash Abliterated");
  assert.equal(model.family, "glm-5.3-flash-abliterated");
  assert.equal(model.version, "1793664000");
  assert.equal(model.maxOutputTokens, 8192);
  assert.equal(model.maxInputTokens, 1048576 - 8192);
  assert.deepEqual(model.capabilities, { imageInput: true, toolCalling: true });
  assert.equal(model.detail, "Abliterated · $0.0977 in / $0.3421 out per 1M");
  assert.match(model.tooltip ?? "", /refusal behavior was removed/);
  assert.match(model.tooltip ?? "", /0\.0098 cached input/);
  assert.equal(model.officialApi, false);
});

test("labels stock models and leaves images off text-only models", () => {
  const model = toChatModel(GLM_STOCK, 8192);
  assert.ok(model);
  assert.equal(model.detail, "Stock model · $1.26 in / $3.96 out per 1M");
  assert.match(model.tooltip ?? "", /the vendor's original weights/);
  assert.equal(model.capabilities.imageInput, false);
  assert.equal(model.capabilities.toolCalling, true);
});

test("input plus output budget fits the context window", () => {
  for (const setting of [256, 8192, 32768, 10_000_000]) {
    for (const entry of [FLAGSHIP, GLM_STOCK, QWEN]) {
      const model = toChatModel(entry, setting);
      assert.ok(model);
      assert.equal(model.maxInputTokens + model.maxOutputTokens, entry.context_length);
      assert.ok(model.maxInputTokens > 0);
    }
  }
});

test("output budget: the setting, lowered to the model limit and half the context", () => {
  assert.equal(outputBudget(1048576, 131072, 8192), 8192);
  assert.equal(outputBudget(1048576, 131072, 500_000), 131072);
  assert.equal(outputBudget(262144, 262144, 500_000), 131072);
  assert.equal(outputBudget(4096, 4096, 8192), 2048);
});

test("marks DeepSeek official API models", () => {
  const model = toChatModel(
    { ...GLM_STOCK, id: "deepseek-official", variant: "official_api", provider_label: "Official DeepSeek API" },
    8192,
  );
  assert.ok(model);
  assert.equal(model.officialApi, true);
  assert.match(model.detail ?? "", /^Official DeepSeek API · /);
});

test("skips entries without an id or token limits, and tolerates missing prices", () => {
  assert.equal(toChatModel({ ...FLAGSHIP, id: "" }, 8192), undefined);
  assert.equal(toChatModel({ ...FLAGSHIP, context_length: 0 }, 8192), undefined);
  assert.equal(toChatModel({ ...FLAGSHIP, max_output_tokens: "131072" }, 8192), undefined);
  assert.equal(toChatModel(null, 8192), undefined);
  const unpriced = toChatModel({ ...FLAGSHIP, pricing: undefined, name: undefined }, 8192);
  assert.ok(unpriced);
  assert.equal(unpriced.name, "glm-5.3-flash-abliterated");
  assert.equal(unpriced.detail, "Abliterated");
});

test("lists the flagship first and keeps catalog order otherwise", () => {
  const models = toChatModels([GLM_STOCK, { id: 42 }, QWEN, FLAGSHIP], 8192);
  assert.deepEqual(
    models.map((model) => model.id),
    ["glm-5.3-flash-abliterated", "glm-5.3", "qwen3.8-max"],
  );
});
