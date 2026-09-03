import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { run } from "../src/cli.js";

test("uses the bundled config outside the current working directory", async () => {
  const originalCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const directory = await mkdtemp(join(tmpdir(), "aqar-cli-"));
  let output = "";

  process.chdir(directory);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { Web: { find: { listings: [] } } } }));
  console.log = (value: string) => { output = value; };

  try {
    await run(["search", "--json"]);
    assert.equal(output, "[]");
  } finally {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});
