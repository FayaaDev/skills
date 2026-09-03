# Repository Guide

## Verification

- Install with `npm install`; the CLI uses Node's built-in `fetch` and ESM runtime.
- Before finishing changes, run `npm run check && npm test && npm run build`.
- Run one test file with `npx tsx --test test/source.test.ts`.
- Run one named test with `npx tsx --test --test-name-pattern="resolves category" test/source.test.ts`.
- Unit tests inject a fake `fetch`; they must not depend on the live Aqar service. After `npm link`, a minimal live smoke check, only when needed, is `aqar search --limit 1 --json`.

## Wiring

- `src/cli.ts` parses commands and produces table/JSON output; `src/source.ts` owns Aqar-specific lookup and filter behavior; `src/graphql.ts` is only the transport layer.
- Runtime search/detail documents, result paths, and normalized field mappings live in `aqar.config.json`. The linked command uses its bundled config by default; use `--config` to override it.
- Category, city, and district lookup documents are embedded in `src/source.ts`, not in `aqar.config.json`. Schema changes may require updating both places and their mocked responses in `test/source.test.ts`.
- Named filters trigger public GraphQL lookup requests; numeric category/city/district IDs skip those lookups. District-name resolution requires a city.
- `--variables` supplies low-level GraphQL variables such as `where`, `sort`, and `from`; explicit CLI filters override overlapping `where` values. Search defaults to 20 results and caps `--limit` at 100. `Web.find` has been observed ignoring price sort even though the schema accepts it, so verify ordering before claiming sorted results.
- TypeScript uses `moduleResolution: NodeNext`; keep `.js` extensions in relative imports even though source files are `.ts`.
