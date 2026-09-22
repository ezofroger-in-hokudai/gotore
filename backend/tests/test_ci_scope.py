import runpy
from pathlib import Path

import pytest

requires_checks = runpy.run_path(str(Path(__file__).parents[2] / "scripts/ci_scope.py"))[
    "requires_checks"
]


@pytest.mark.parametrize(
    ("paths", "expected"),
    [
        (["docs/styles/index.html", "docs/images/example.png", "progress.md"], False),
        (["README.md", "AGENTS.md", "CONTRIBUTING.md", "task.md"], False),
        (["docs/spec.md", "frontend/src/app/page.tsx"], True),
        ([".github/workflows/ci.yml"], True),
        (["supabase/migrations/new.sql"], True),
        (["new-unknown-file", "frontend/README.md"], True),
        ([], True),
        (["docs-lookalike/source.py"], True),
        (["frontend/src/old.ts", "docs/moved.ts"], True),
    ],
)
def test_ci_scope_preserves_checks_for_code_and_unknown_paths(paths, expected):
    assert requires_checks(paths) is expected
