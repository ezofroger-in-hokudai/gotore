.PHONY: frontend backend install install-frontend install-backend check test-backend build-frontend lint-backend lint-frontend lint db-start db-stop db-reset db-lint db-new

frontend:
	cd frontend && bun run dev

backend:
	cd backend && uv run --locked uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

install: install-backend install-frontend

install-frontend:
	cd frontend && bun install --frozen-lockfile

install-backend:
	cd backend && uv sync --locked --extra dev

test-backend:
	cd backend && uv sync --locked --extra dev && uv run --locked pytest

build-frontend:
	cd frontend && bun run build

lint-backend:
	cd backend && uv sync --locked --extra dev && uv run --locked ruff check .

lint-frontend:
	cd frontend && bun run lint

lint: lint-backend lint-frontend

check: lint test-backend build-frontend

db-start:
	bunx supabase start

db-stop:
	bunx supabase stop

db-reset:
	bunx supabase db reset

db-lint:
	bunx supabase db lint --local --fail-on error

db-new:
	test -n "$(name)" || (echo "usage: make db-new name=your_migration_name" && exit 1)
	bunx supabase migration new $(name)
