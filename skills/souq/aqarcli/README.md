# aqar-cli

A TypeScript terminal client for Aqar's internal GraphQL interface.


## Setup

```bash
npm install
npm link
```

`aqar.config.json` contains the verified public endpoint and `Web.find` and `Web.listing` query documents.

`npm link` makes the local `aqar` command available from any directory. Remove it with `npm unlink --global aqar-cli`.


## Use

```bash
aqar search --city riyadh --district النرجس --purpose rent --type apartment --max-price 60000
aqar search --city 21 --type 1 --variables '{"from": 20}' --json
aqar get 6337769 --json
```

The CLI resolves named property types, cities, and districts through Aqar's public GraphQL lookups. Numeric category, city, and district IDs avoid lookup calls. `--district` requires `--city`.

`--variables` accepts additional GraphQL variables such as `from`, `sort`, and `where`. Explicit command filters take precedence. Results default to 20 and `--limit` is capped at 100. The schema accepts `sort`, but the current `Web.find` response has been observed ignoring price ordering; do not rely on it without checking the returned values.

## Configuration

The linked command uses the bundled `aqar.config.json` by default. Use `--config PATH` to override it.

- `endpoint`: GraphQL HTTP endpoint.
- `headers`: optional request headers. `${NAME}` expands `NAME` from the environment.
- `operations.search`: verified `Web.find` document, base variables, and the dot path to its listing array.
- `operations.get`: query document, name of its listing-ID variable, and dot path to one object in GraphQL `data`.
- `listing`: dot paths mapping source fields to stable CLI fields.

Run `npm run check`, `npm test`, and `npm run build` before publishing.
