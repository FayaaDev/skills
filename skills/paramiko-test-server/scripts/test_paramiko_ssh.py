import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import paramiko_ssh


class ConfigurationTest(unittest.TestCase):
    def test_credentials_and_alias_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / ".ssh"
            config.touch(mode=0o600)
            for content in ("name=oracle", "User=test\nPass=\nIP=\nNAME=oracle"):
                config.write_text(content)
                with patch("sys.argv", ["helper", "--env-file", str(config), "whoami"]), patch(
                    "paramiko_ssh.subprocess.run"
                ) as run:
                    run.return_value.returncode = 7
                    self.assertEqual(paramiko_ssh.main(), 7)
                    run.assert_called_once_with(
                        ["ssh", "-o", "StrictHostKeyChecking=yes", "oracle", "whoami"],
                        check=False,
                    )

            config.write_text("User=test\nPass=secret\nIP=127.0.0.1\nName=oracle")
            self.assertEqual(paramiko_ssh.read_credentials(config)["pass"], "secret")
            paramiko = MagicMock()
            stdin, stdout, stderr = MagicMock(), MagicMock(), MagicMock()
            stdout.read.return_value = b""
            stdout.channel.recv_exit_status.return_value = 0
            paramiko.SSHClient.return_value.exec_command.return_value = (stdin, stdout, stderr)
            with patch("sys.argv", ["helper", "--env-file", str(config), "whoami"]), patch.dict(
                "sys.modules", {"paramiko": paramiko}
            ), patch("paramiko_ssh.subprocess.run") as run:
                self.assertEqual(paramiko_ssh.main(), 0)
                run.assert_not_called()
                paramiko.SSHClient.return_value.connect.assert_called_once_with(
                    "127.0.0.1", port=22, username="test", password="secret", timeout=10,
                    auth_timeout=10, banner_timeout=10, allow_agent=False, look_for_keys=False,
                )

            for content in ("User=test", "Name=-oProxyCommand=bad", "Name=oracle extra"):
                config.write_text(content)
                with self.assertRaises(ValueError):
                    paramiko_ssh.read_credentials(config)

            config.write_text("Name=oracle")
            with patch("sys.argv", ["helper", "--env-file", str(config), "--upload", "file",
                                    "--upload-to", "/tmp/file", "whoami"]), patch(
                "paramiko_ssh.subprocess.run"
            ) as run:
                self.assertEqual(paramiko_ssh.main(), 2)
                run.assert_not_called()
            config.chmod(0o644)
            with self.assertRaises(ValueError):
                paramiko_ssh.read_credentials(config)


if __name__ == "__main__":
    unittest.main()
