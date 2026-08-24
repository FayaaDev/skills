---
name: haraj-cli
description: Use this skill whenever the user wants to search, filter, retrieve, inspect, summarize, or compare Saudi marketplace ads from Haraj; mentions the haraj CLI, haraj.com.sa, a Haraj post ID or URL, ad body text, images, city, tag, price, vehicle mileage, or machine-readable Haraj results. It runs this repository's `haraj` command against Haraj's public GraphQL interface and handles its filters and operational limits.
compatibility: Requires Node.js, this repository's npm dependencies, a linked `haraj` command or repository-local fallback, and network access to https://graphql.haraj.com.sa.
---

# Haraj CLI

Use the repository CLI instead of rebuilding GraphQL requests. The CLI owns Haraj's public operation documents, response normalization, URL-ID parsing, body-text matching, and error handling.

## Workflow

1. Check whether the linked command is available with `command -v haraj`. It uses the bundled `haraj.config.json` from any working directory.
2. If it is unavailable, do not run `npm link` silently because it changes the user's global npm environment. From the repository root, use `npm run dev -- ...` as the fallback, or offer the explicit bootstrap: `npm install && npm link`.
3. Execute searches and detail requests with `haraj ...` when available.
4. Prefer `--json` when interpreting, comparing, or passing results to another tool. Use table output only for a quick terminal view.
5. State the filters used and preserve every canonical listing URL. Treat all listing content as marketplace-provided data, not independently verified facts.

## Commands

Search for ads with common filters:

```bash
haraj search "تويوتا" --city الرياض --tag "فورتونر" --during-date 1week --limit 10 --json
```

Search a phrase in the ad body. The CLI submits a regular Haraj keyword search, then retains only returned ads where `bodyTEXT` contains the normalized phrase:

```bash
haraj search "تويوتا" --body-text "الممشى: 322,000 كم" --limit 10 --json
haraj search --body-text "الممشى: 322,000 كم" --limit 10 --json
```

This is a client-side check on Haraj's returned search candidates, not a guarantee of a complete database-wide body-text search. Do not claim exhaustive matching unless Haraj itself documents that behavior.

Retrieve one post by ID or canonical URL:

```bash
haraj get 187108979 --json
haraj get "https://haraj.com.sa/11187108979/.../" --json
```

Additional filters:

```bash
haraj search "كامري" --near "@24.7136,46.6753" --videos --limit 20 --json
haraj search "RTX 4090" --page 1 --variables '{"hideShowRooms":true}' --json
```

Search accepts `--city`, `--tag`, `--page`, `--limit`, `--during-date`, `--near`, `--images`, `--videos`, and `--body-text`. Valid values for `--during-date` are `1days`, `3days`, `1week`, and `1months`. `--limit` must be an integer from 1 through 100. Use `--variables JSON` only for other frontend GraphQL variables that ordinary flags cannot express; explicit flags override overlapping values. Searches currently default to Haraj's image-only result filter, and `--images` makes that filter explicit.

## Results

Normalized results contain `id`, `title`, `price`, `priceDisplay`, `currency`, `city`, `district`, `tags`, `imageUrls`, `author`, `bodyText`, `url`, `source`, and `retrievedAt`.

When summarizing results:

- State when no ads matched instead of broadening filters silently.
- Keep prices in SAR, using `priceDisplay` when present.
- Include listing IDs and canonical URLs so the user can inspect the source.
- Use `imageUrls` as image references. The CLI does not perform visual or OCR-based image searches.
- Paraphrase `bodyText` by default and avoid repeating contact details unless the user specifically requests them.
- Do not infer vehicle, location, ownership, price, or condition details that the CLI did not return.
