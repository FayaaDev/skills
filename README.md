# Souq

Souq is a skills collection for searching and comparing Saudi marketplace listings. The included `souq` skill routes generic real-estate requests to Haraj and Aqar, while non-real-estate requests use Haraj.

## Install

```bash
npx skills add https://github.com/FayaaDev/skills --skill souq
```

The bundled runners require Node.js 18+ and network access to the marketplaces. They do not require global CLI links or an npm install.

## Development

Development requires Bun 1.4+. Install dependencies and run the complete verification suite with:

```bash
bun install
bun run verify
```

## Update

```bash
npx skills update souq
```

Listings and normalized fields are marketplace-provided data, not independently verified facts. Haraj and Aqar can change their APIs or response schemas, which can require a skill update.
