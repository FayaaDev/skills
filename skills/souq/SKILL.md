---
name: souq
description: Use this skill whenever the user wants to search, filter, retrieve, inspect, summarize, or compare Saudi marketplace listings from Haraj or Aqar. This includes real estate, apartments, villas, land, offices, shops, warehouses, rent, sale, booking, neighborhoods, vehicles, electronics, jobs, Haraj or Aqar URLs and listing IDs, and machine-readable marketplace results. Generic real-estate searches query both Haraj and Aqar; other marketplace searches use Haraj only.
compatibility: Requires Node.js 18+, a POSIX shell, network access to https://graphql.haraj.com.sa and https://sa.aqar.fm/graphql, and the bundled files in this skill directory.
---

# Souq

Use the existing CLIs instead of reconstructing GraphQL requests. The CLIs own marketplace-specific queries, lookups, normalization, URL parsing, and errors; this skill owns source selection and presentation.

## Route the request

Use this routing order:

1. For a URL, a source recorded with an earlier result, or a request naming exactly one marketplace, use that source only. If the user explicitly requests both Haraj and Aqar, use both. Honor restrictions such as "Haraj only" or "Aqar only."
2. For a bare listing ID with no known source, ask which marketplace it belongs to. IDs are source-local and may collide.
3. For a generic real-estate search or comparison, query both Haraj and Aqar independently, preferably in parallel.
4. For a non-real-estate marketplace request, query Haraj only.
5. For a mixed request, query both sources for the real-estate portion and Haraj only for the remaining portion.

Real-estate intent includes properties such as apartments, villas, houses, land, buildings, offices, shops, warehouses, farms, chalets, and rooms, as well as property-specific rent, sale, booking, area, and neighborhood criteria. Arabic equivalents include `عقار`, `شقة`, `فيلا`, `أرض`, `عمارة`, `مكتب`, `محل`, `مستودع`, `إيجار`, `للبيع`, and `حي` when they refer to property. Transaction words such as sale, rent, or `للبيع` are not sufficient by themselves; for example, cars for sale remain Haraj-only. Do not classify a request as real estate merely because an unrelated ad is located in a neighborhood.

## Run the CLIs

Set `SKILL_DIR` to this installed skill's directory. Run the bundled scripts directly; they resolve their bundled configurations without regard to the current working directory:

```bash
node "$SKILL_DIR/scripts/haraj.mjs" search ... --json
node "$SKILL_DIR/scripts/haraj.mjs" get <id-or-url> --json
node "$SKILL_DIR/scripts/aqar.mjs" search ... --json
node "$SKILL_DIR/scripts/aqar.mjs" get <id-or-url> --json
```

Do not install npm dependencies or use linked commands. Prefer `--json` whenever results will be interpreted, compared, or transformed.

### Haraj

```bash
node "$SKILL_DIR/scripts/haraj.mjs" search "تويوتا" --city الرياض --tag "فورتونر" --during-date 1week --limit 10 --json
node "$SKILL_DIR/scripts/haraj.mjs" search --body-text "الممشى: 322,000 كم" --limit 10 --json
node "$SKILL_DIR/scripts/haraj.mjs" get 187108979 --json
```

Search accepts `--city`, `--tag`, `--page`, `--limit`, `--during-date`, `--near`, `--images`, `--videos`, `--body-text`, and a positional keyword. Valid `--during-date` values are `1days`, `3days`, `1week`, and `1months`. Limits must be integers from 1 through 100. Explicit flags override overlapping `--variables` values.

Haraj's bundled configuration defaults to image-only search results even when `--images` is omitted. Report that default when it materially limits the search.

### Aqar

```bash
node "$SKILL_DIR/scripts/aqar.mjs" search --city riyadh --district "النرجس" --purpose rent --type apartment --max-price 60000 --limit 10 --json
node "$SKILL_DIR/scripts/aqar.mjs" search --city 21 --type 1 --variables '{"from":20}' --json
node "$SKILL_DIR/scripts/aqar.mjs" get 6736135 --json
```

Named districts require `--city`. Valid purposes are `sale`, `rent`, and `booking`. Search defaults to 20 results and caps `--limit` at 100. Explicit flags override overlapping values in `--variables`.

## Translate real-estate filters

Apply requested filters only where the CLI has an equivalent capability:

- Aqar supports structured city, district, purpose, property type, minimum price, and maximum price filters. Its normalized results include area, but the CLI has no structured area filter; when area is material, filter returned numeric areas client-side and describe the candidate-window limitation.
- Haraj supports keyword, city, tag, date, proximity, media, and body-text filters. It has no equivalent structured district, property-purpose, property-type, or price-range flags.
- Build a focused Haraj property keyword from the user's criteria, such as `شقق للإيجار حي النرجس`, and use supported Haraj flags separately.
- If price filtering is material, client-side filtering of returned Haraj candidates is allowed when prices are numeric. Describe it as filtering a limited candidate set, not an exhaustive Haraj-wide result. Haraj does not normalize property area, so do not claim to enforce an area constraint there.
- Record filters that a source could not enforce. Do not imply that mentioning a constraint in a keyword is equivalent to a structured filter.
- Aqar's live responses may ignore requested price sorting. Do not claim sorted results unless the returned values verify it.
- Haraj `--body-text` checks only returned search candidates. Do not claim an exhaustive database-wide body search.

Use the requested limit independently for each marketplace. "5 results" means up to five Haraj results and up to five Aqar results unless the user explicitly requests a combined total.

## Present results

For a human-readable dual-source real-estate response, always use these sections in this order, even when a source fails or returns no matches:

```markdown
## Haraj

[Haraj results, no-match message, or source error]

## Aqar

[Aqar results, no-match message, or source error]
```

Include marketplace, listing ID, title, price, city or district when available, and canonical URL. Add source-specific fields only when useful: Haraj may include tags, images, author, and a body summary; Aqar may include area and its property category code. Do not merge incompatible schemas or deduplicate across marketplaces. If one source fails, retain the successful section and clearly label the response as partial.

For non-real-estate requests, present only Haraj results. For source-specific detail requests, present only the requested source.

When the user requests combined machine-readable output, return an attributed envelope instead of Markdown:

```json
{
  "queryKind": "real-estate",
  "limitPerMarketplace": 5,
  "sourcesRequested": ["haraj", "aqar"],
  "sections": {
    "haraj": { "status": "ok", "results": [], "limitations": [] },
    "aqar": { "status": "ok", "results": [], "limitations": [] }
  }
}
```

Use `status: "error"` plus an `error` string for a failed source. The CLIs' `source: "graphql"` field identifies transport, not marketplace; the containing `haraj` or `aqar` section provides marketplace attribution. For single-source JSON, return the CLI's normalized result directly unless the user asks for an envelope.

## Reporting rules

- State the filters applied by each source and any material filter-fidelity limitation.
- State when no listings matched instead of broadening filters silently.
- Preserve listing IDs and canonical URLs.
- Keep prices in SAR and Aqar areas in square meters.
- Treat all listing content as marketplace-provided data, not independently verified facts.
- Do not infer missing price, location, property, vehicle, ownership, or condition details.
- Paraphrase Haraj `bodyText` by default and avoid repeating contact details unless specifically requested.
- Use Haraj `imageUrls` as references only; the CLI does not perform visual or OCR-based image search.
