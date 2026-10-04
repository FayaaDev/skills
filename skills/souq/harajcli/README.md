# haraj-cli

A TypeScript terminal client for Haraj's public GraphQL interface.

## Setup

```bash
npm install
npm link
```

`npm link` makes the local `haraj` command available from any directory. Remove it with `npm unlink --global haraj-cli`.

## Use

```bash
haraj search "تويوتا" --city الرياض --limit 10
haraj search "تويوتا" --body-text "الممشى: 322,000 كم" --json
haraj search "RTX 4090" --during-date 1week --json
haraj get 1194697687 --json
```

Search supports `--body-text`, `--city`, `--tag`, `--page`, `--limit`, `--during-date`, `--near`, `--images`, and `--videos`. `--body-text` retains only returned ads whose `bodyTEXT` contains the normalized phrase; it can be used without a positional keyword. Use `--variables JSON` for other documented frontend GraphQL variables. The default output is a compact table; `--json` includes normalized prices, location, tags, images, body text, and listing URL.

The bundled `haraj.config.json` contains the public endpoint and frontend query documents. Use `--config PATH` to override it. Haraj may change the endpoint version or reject automated requests; when that occurs, recapture the browser operation and update the configuration.

Run `npm run check`, `npm test`, and `npm run build` before publishing.
