#!/usr/bin/env python3
"""Run a command over SSH using credentials from a local environment file."""

import argparse
import shlex
import stat
import sys
from pathlib import Path

import paramiko


def read_credentials(path):
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError(f"{path} must not be accessible by group or other users")

    values = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key.strip().lower()] = value

    missing = [key for key in ("user", "pass", "ip") if not values.get(key)]
    if missing:
        raise ValueError("credential file must define User, Pass, and IP")
    return values


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(".ssh"))
    parser.add_argument("--sudo", action="store_true", default=True, help="run the command as root (default)")
    parser.add_argument("--upload", type=Path, help="upload a private local file before executing the command")
    parser.add_argument("--upload-to", help="new absolute remote pathname for the upload")
    parser.add_argument("command", help="remote shell command to execute")
    args = parser.parse_args()
    if bool(args.upload) != bool(args.upload_to):
        parser.error("--upload and --upload-to must be supplied together")
    if args.upload_to and not args.upload_to.startswith("/"):
        parser.error("--upload-to must be an absolute path")
    return args


def main():
    args = parse_args()
    try:
        credentials = read_credentials(args.env_file)
    except (OSError, ValueError) as error:
        print(f"Configuration error: {error}", file=sys.stderr)
        return 2

    command = args.command
    if args.sudo:
        command = f"sudo -S -p '' -- sh -c {shlex.quote(command)}"

    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())

    try:
        client.connect(
            credentials["ip"],
            port=int(credentials.get("port", "22")),
            username=credentials["user"],
            password=credentials["pass"],
            timeout=10,
            auth_timeout=10,
            banner_timeout=10,
            allow_agent=False,
            look_for_keys=False,
        )
        if args.upload:
            with client.open_sftp() as sftp:
                with sftp.open(args.upload_to, "wx") as destination:
                    destination.chmod(0o600)
                    destination.set_pipelined(True)
                    with args.upload.open("rb") as source:
                        while chunk := source.read(1024 * 1024):
                            destination.write(chunk)
        stdin, stdout, _ = client.exec_command(command)
        stdout.channel.set_combine_stderr(True)
        if args.sudo:
            stdin.write(credentials["pass"] + "\n")
            stdin.flush()
        stdin.channel.shutdown_write()

        output = stdout.read()
        exit_code = stdout.channel.recv_exit_status()
        sys.stdout.buffer.write(output)
        sys.stdout.buffer.flush()
        return exit_code
    except (OSError, ValueError, paramiko.SSHException) as error:
        print(f"SSH failed: {type(error).__name__}", file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
