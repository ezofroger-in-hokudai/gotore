"""起動済みのローカルSupabaseから、未作成の環境ファイルだけを用意する。"""

import argparse
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli", nargs="+", default=["bunx", "supabase@2.107.0"])
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [*args.cli, "status", "-o", "json"], cwd=root, capture_output=True, text=True
    )
    if result.returncode:
        raise SystemExit(
            "Supabaseの接続情報を取得できません。先にmake db-startを実行してください。"
        )
    data = json.loads(result.stdout)
    for name in ["API_URL", "DB_URL"]:
        if urlparse(data[name]).hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise SystemExit("このコマンドはローカルSupabase専用です。")
    files = {
        "backend/.env": f"APP_NAME=GO TORE API\nDATABASE_URL={data['DB_URL']}\n"
        f"SUPABASE_URL={data['API_URL']}\nSUPABASE_ANON_KEY={data['ANON_KEY']}\n",
        "frontend/.env.local": "BACKEND_INTERNAL_URL=http://localhost:8000\n"
        f"NEXT_PUBLIC_SUPABASE_URL={data['API_URL']}\n"
        f"NEXT_PUBLIC_SUPABASE_ANON_KEY={data['ANON_KEY']}\n",
    }
    for relative, content in files.items():
        try:
            descriptor = os.open(root / relative, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            print(f"既存ファイルを保持: {relative}（接続先を変える場合は手動で更新）")
            continue
        with os.fdopen(descriptor, "w") as target:
            target.write(content)
        print(f"作成: {relative}（Git対象外）")


if __name__ == "__main__":
    main()
