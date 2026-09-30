# MedSync Codebase Index

Setup and deployment: [SETUP.md](SETUP.md). Work plan and status: [TASKS.md](TASKS.md).

## Backend (Python, FastAPI) — repo root, deployed as a Vercel function

| File | Responsibility |
|---|---|
| `main.py` | HTTP layer: routes, auth dependency, request validation, status codes, SSE streaming |
| `medsync_auth.py` | Validates the caller's Supabase JWT (`get_current_user`); shared service-role client |
| `medsync_store.py` | All Supabase data access: Storage objects, `reports` rows, `report_chunks` (pgvector) search, deletions |
| `medsync_rag.py` | Extraction (PyMuPDF text / OpenAI vision), chunking + embeddings, intent routing, HyDE retrieval, answer + faithfulness check |
| `api/index.py` | Vercel entrypoint (`vercel.json` rewrites every path here) |
| `supabase/migrations/` | SQL to run in the Supabase SQL editor (tables, pgvector search function, storage bucket + policies) |
| `tests/` | pytest suite; external services are faked, run with `./venv/bin/pytest -q` |

## Frontend (Next.js) — `frontend/`, deployed as a separate Vercel project

| Path | Responsibility |
|---|---|
| `src/app/*/page.tsx` | Pages: home, chat, vault, analytics (latest report), medications, vitals, profile, settings, login, signup |
| `src/app/api/**/route.ts` | Thin proxies to the FastAPI backend (forward the user's `Authorization` header) |
| `src/lib/api.ts` | `apiFetch` — browser fetch that attaches the Supabase access token |
| `src/lib/backend.ts` | `proxyToBackend` — server-side forwarding used by every API route |
| `src/lib/uploadReport.ts` | Browser → Supabase Storage upload, then triggers ingestion |
| `src/lib/supabase.ts` | Browser Supabase client |
| `src/components/layout/` | App shell (auth gate, sidebar, footer) and the Quick Scan widget |

## Data flow

1. Browser uploads a file to Storage at `<user_id>/<file>`; `POST /reports/ingest` extracts, embeds and stores chunks tagged with `user_id`.
2. Chat classifies the question; report questions retrieve only that user's chunks via `match_report_chunks`, then stream an answer with sources and a faithfulness check.
