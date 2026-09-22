"""資料だけのPRではアプリのCIを省き、不明な変更は全チェックへ回す。"""

import sys
from collections.abc import Iterable

DOCUMENT_FILES = {
    "README.md",
    "CONTRIBUTING.md",
    "AGENTS.md",
    "task.md",
    "progress.md",
}


def requires_checks(paths: Iterable[str]) -> bool:
    changed = list(paths)
    return not changed or any(
        not (path.startswith("docs/") or path in DOCUMENT_FILES) for path in changed
    )


if __name__ == "__main__":
    paths = [
        path.decode("utf-8", errors="replace")
        for path in sys.stdin.buffer.read().split(b"\0")
        if path
    ]
    print(f"run_checks={str(requires_checks(paths)).lower()}")
