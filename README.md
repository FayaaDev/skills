# Souq

Souq is a skills collection for searching and comparing Saudi marketplace listings. The included `souq` skill routes generic real-estate requests to Haraj and Aqar, while non-real-estate requests use Haraj.

## Install

```bash
npx skills add https://github.com/FayaaDev/skills --skill souq
```

The bundled runners require Node.js 18+ and network access to the marketplaces. They do not require global CLI links or an npm install.

### Paramiko Test Server

Run commands on a configured test/staging server over SSH using a protected local `.ssh` file containing credentials or an SSH host alias.

```bash
npx skills add https://github.com/FayaaDev/skills --skill paramiko-test-server
```

Requires Python 3 and network access. Credential mode requires Paramiko (or `uv` to provide it); SSH alias mode uses native `ssh`. See [setup and usage](skills/paramiko-test-server/SKILL.md).

## Development

CLI source and tests live in `skills/souq/harajcli/` and `skills/souq/aqarcli/`.

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
