import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import { AqarError } from "../src/errors.js";

const fixture = fileURLToPath(new URL("./fixtures/config.json", import.meta.url));

test("loads configuration and expands header environment variables", async () => {
  process.env.AQAR_TEST_TOKEN = "test-token";
  const config = await loadConfig(fixture);
  assert.equal(config.endpoint, "https://api.example.test/graphql");
  assert.deepEqual(config.headers, { "x-api-key": "test-token" });
  assert.deepEqual(config.operations.search.variables, { page: 1, filters: { active: true } });
});

test("fails clearly for a missing header environment variable", async () => {
  const original = process.env.AQAR_TEST_TOKEN;
  delete process.env.AQAR_TEST_TOKEN;
  await assert.rejects(loadConfig(fixture), (error: unknown) => error instanceof AqarError && error.message.includes("AQAR_TEST_TOKEN"));
  process.env.AQAR_TEST_TOKEN = original;
});
