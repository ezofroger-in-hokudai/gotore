"""VAPID鍵を画面に表示せず、新規の保護されたファイルへ保存する。"""

import argparse
import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def create_keys(path: Path):
    private = ec.generate_private_key(ec.SECP256R1())
    public = private.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    secret = private.private_numbers().private_value.to_bytes(32, "big")

    def encoded(value):
        return base64.urlsafe_b64encode(value).decode().rstrip("=")

    # 既存鍵は上書きしない。秘密鍵の更新は既存購読を無効にするため。
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        output.write(f"VAPID_PUBLIC_KEY={encoded(public)}\nVAPID_PRIVATE_KEY={encoded(secret)}\n")


def main():
    parser = argparse.ArgumentParser(description="Web PushのVAPID鍵を新規ファイルに保存")
    parser.add_argument("--output", type=Path, default=Path(".env.vapid"))
    args = parser.parse_args()
    create_keys(args.output)
    print(f"鍵を {args.output} に保存しました。秘密鍵をコミットしないでください。")


if __name__ == "__main__":
    main()
