---
name: paramiko-test-server
description: Run commands on the configured test server over SSH. Use whenever a user asks to inspect, test, diagnose, deploy, configure, or change the test/staging server, including "the server" or "the VPS." Use the bundled Paramiko helper, a protected local .ssh credentials file, and host-key verification.
compatibility: Requires Python 3, Paramiko or uv, network access to the configured test server, and a local .ssh credentials file.
---

# Paramiko Test Server

Use the bundled `scripts/paramiko_ssh.py` for every command on the configured
test server. It reads credentials locally and rejects unknown host keys, so do
not replace it with `ssh`, inline credentials, or another remote-execution
mechanism.

## Run a remote command

1. Set `HELPER` to the absolute path of this skill's
   `scripts/paramiko_ssh.py`. Keep the working directory at the project that
   contains `.ssh`, because that is the helper's default credential location.
2. Check whether Paramiko is importable with Python 3. If it is unavailable,
   use uv to provide it without changing project dependencies:

   ```sh
   uv run --with paramiko python3 "$HELPER" '<command>'
   ```

   If Paramiko is already installed, invoke `python3 "$HELPER" '<command>'`.
3. Select and secure the credential file as described below.
4. Run the requested command through the helper. Its interface applies
   `sudo` by default, so all remote commands use the configured account's sudo
   authorization. Do not bypass the helper to avoid sudo; update the helper's
   interface separately if least-privilege remote execution is required.

Examples:

```sh
python3 "$HELPER" 'systemctl status my-service --no-pager'
python3 "$HELPER" 'docker compose ps'
uv run --with paramiko python3 "$HELPER" 'apt-get update'
```

Pass the complete remote shell command as one quoted argument. Report command
output and exit status, but never report credentials or copy their values into
commands, logs, commits, patches, or chat.

## Credentials and local setup

The helper accepts case-insensitive `User`, `Pass`, and `IP` keys, and an
optional `Port` key. Its credential files must be private (mode `0600`).

1. Use `.ssh` in the current project directory. If it does not exist, create
   it without overwriting an existing file, using this template:

   ```dotenv
   User=
   Pass=
   IP=
   # Port=22
   ```

   If the required values are unavailable, ask the user to populate the file;
   never guess an address or credentials.
2. Restrict it immediately with `chmod 600 .ssh`. The helper refuses to read a
   credential file that group or other users can access.
3. Ensure `.ssh` is ignored before adding credentials. Never read its values
   into chat, commands, logs, commits, or patches.

Some execution environments block commands that explicitly name a credentials
file. Invoking the bundled helper without `--env-file` uses its `.ssh` default
without putting that filename in the command invocation.

## Safety

- Use a harmless read-only command first when establishing a new connection.
- Preserve host-key verification; do not weaken the helper's `RejectPolicy`.
- State the remote command before executing any destructive or service-impacting
  operation, get explicit user approval, and provide a recovery path.
- Do not use this skill for production servers unless the user explicitly
  identifies the target as the configured test server.
