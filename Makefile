.PHONY: frontend backend install install-frontend install-backend env-local check test-backend test-frontend test-e2e build-frontend lint-backend lint-frontend lint db-start db-stop db-reset db-lint db-new

SUPABASE_CLI ?= bunx supabase@2.107.0

frontend:
	cd frontend && bun run dev

backend:
	cd backend && uv run --locked uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

install: install-backend install-frontend

env-local:
	python3 scripts/configure_local.py --cli $(SUPABASE_CLI)

install-frontend:
	cd frontend && bun install --frozen-lockfile

install-backend:
	cd backend && uv sync --locked --extra dev

test-backend:
	cd backend && uv sync --locked --extra dev && uv run --locked pytest

test-frontend:
	cd frontend && bun run test

test-e2e:
	cd frontend && bun run test:e2e

build-frontend:
	cd frontend && bun run build

lint-backend:
	cd backend && uv sync --locked --extra dev && uv run --locked ruff check . ../scripts

lint-frontend:
	cd frontend && bun run lint

lint: lint-backend lint-frontend

check: lint test-backend test-frontend build-frontend

db-start:
	$(SUPABASE_CLI) start

db-stop:
	$(SUPABASE_CLI) stop

db-reset:
	$(SUPABASE_CLI) db reset --local

db-lint:
	$(SUPABASE_CLI) db lint --local --fail-on error

db-new:
	test -n "$(name)" || (echo "usage: make db-new name=your_migration_name" && exit 1)
	$(SUPABASE_CLI) migration new $(name)
