import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const skillDirectory = resolve("skills/souq");
const packagedFiles = [
  "scripts/haraj.mjs",
  "scripts/aqar.mjs",
  "haraj.config.json",
  "aqar.config.json"
];

test("packaged runners exist and show help outside the repository", async () => {
  await Promise.all(packagedFiles.map((file) => access(join(skillDirectory, file))));

  for (const runner of ["haraj.mjs", "aqar.mjs"]) {
    const result = spawnSync(process.execPath, [join(skillDirectory, "scripts", runner), "--help"], {
      cwd: tmpdir(),
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
  }
});

test("packaged runners load bundled configs outside the repository", () => {
  const cases = [
    ["haraj.mjs", "Post must be a numeric ID or a canonical Haraj URL."],
    ["aqar.mjs", "Listing must be a numeric ID or an Aqar URL ending in a listing ID."]
  ];

  for (const [runner, expectedError] of cases) {
    const result = spawnSync(process.execPath, [join(skillDirectory, "scripts", runner), "get", "invalid"], {
      cwd: tmpdir(),
      encoding: "utf8"
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(expectedError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(result.stderr, /Could not read configuration/);
  }
});
