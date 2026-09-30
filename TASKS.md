# MedSync → Vercel (free tier) Migration & Hardening Plan

> Work through tasks in order. Tick checkboxes as you go. Each task ends with a
> verification step and a commit on the `vercel-migration` branch.

**Goal:** Run both the FastAPI backend and the Next.js frontend on Vercel's free (Hobby)
plan, retire Railway, and fix the security/functional bugs found in the project review.

**Architecture:** Two Vercel projects from one repo — `medsync-web` (root dir `frontend/`)
and `medsync-api` (root dir `/`, FastAPI exposed through `api/index.py`). Vercel functions
are stateless with a read-only filesystem, so all state moves to Supabase (free tier):
Postgres + **pgvector** replaces Chroma, **Supabase Storage** replaces `uploads/`, and a
`reports` table replaces `.medsync_cache/`. Every backend request carries the user's
Supabase JWT and all data is scoped by `user_id`.

**Tech stack:** FastAPI, LangChain (OpenAI only), Supabase (Auth, Postgres/pgvector,
Storage), Next.js 16, Vercel Hobby.

## Global constraints

- **Vercel Hobby limits:** request/response body ≤ **4.5 MB** per function call (so files
  are uploaded browser → Supabase Storage directly, never through a function); function
  duration ≤ **300 s** with Fluid Compute (default on); read-only filesystem except `/tmp`,
  which is wiped between invocations; bundle size limit (Chroma's deps alone are about 190 MB, so they must go).
- **No local disk state** in the backend. Nothing may be written outside `/tmp`, and
  nothing in `/tmp` may be relied on across requests.
- **Every data row carries `user_id`.** The backend uses the service-role key and so
  bypasses RLS, so it must filter by the authenticated user's id itself.
- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` live only in the
  `medsync-api` project. The frontend only gets `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BACKEND_API_BASE_URL`.
- Embedding model `text-embedding-3-small` → vectors are **1536** dims.
- Python runtime on Vercel: 3.12. Don't use syntax/features newer than 3.12.

## Target file map

| File | Responsibility |
|---|---|
| `supabase/migrations/001_vercel_backend.sql` | New tables, pgvector, match RPC, storage bucket + policies, `vitals.user_id` |
| `medsync_auth.py` (new) | Verify Supabase JWT → `AuthUser(id, email)` FastAPI dependency |
| `medsync_store.py` (new) | All Supabase data access: storage download/signed URLs, `reports` rows, chunk insert/search/delete |
| `medsync_rag.py` | Extraction + RAG logic; Chroma/disk code removed, calls `medsync_store` |
| `main.py` | HTTP layer only: routes, auth dependency, status codes |
| `api/index.py`, `vercel.json`, `.vercelignore`, `requirements.txt` | Vercel backend packaging |
| `tests/` (new) | pytest unit tests for pure logic (auth header parsing, path checks, chunking, filters) |
| `frontend/src/lib/backend.ts` | Proxy helper: forwards `Authorization`, no localhost fallback in prod |
| `frontend/src/lib/api.ts` (new) | Browser helper `apiFetch()` that attaches the Supabase access token |
| `frontend/src/lib/uploadReport.ts` (new) | Browser → Supabase Storage upload, then `POST /api/reports/ingest` |

---

## Phase 0 — Setup

### Task 0: Branch + test harness
- [x] Deal with the stray `frontend/package-lock.json` change (commit or `git checkout` it).
- [x] `git checkout -b vercel-migration`
- [x] Add `pytest` to a new `requirements-dev.txt` (`-r requirements.txt` + `pytest`), install into `venv`.
- [x] Create `tests/__init__.py` (empty) and `tests/conftest.py` that sets dummy env vars
      (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) so imports never need real secrets.
- [x] Verify: `./venv/bin/pytest -q` runs (0 tests collected is fine).
- [x] Commit: `chore: add pytest harness`

---

## Phase 1 — Supabase as the single source of state

### Task 1: Database schema migration
**Files:** Create `supabase/migrations/001_vercel_backend.sql`

Contents (run once in Supabase Dashboard → SQL Editor):
- `create extension if not exists vector;`
- `public.reports` — `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users on delete cascade`,
  `filename text not null`, `storage_path text not null unique`, `sha256 text not null`,
  `structured_report jsonb`, `status text not null default 'pending'` (`pending|ready|failed`),
  `error text`, `created_at timestamptz default now()`, `unique(user_id, filename)`.
- `public.report_chunks` — `id bigserial pk`, `report_id uuid references reports on delete cascade`,
  `user_id uuid not null`, `chunk_index int`, `content text`, `metadata jsonb`, `embedding vector(1536)`;
  HNSW index on `embedding vector_cosine_ops`; btree index on `user_id`.
- RPC `match_report_chunks(query_embedding vector(1536), match_count int, p_user_id uuid, p_filter jsonb default '{}')`
  returning `(id, report_id, content, metadata, similarity)` with `where user_id = p_user_id and metadata @> p_filter`
  ordered by cosine distance.
- `alter table public.vitals add column if not exists user_id uuid references auth.users on delete cascade;` + index.
- RLS enabled on `reports`, `report_chunks`, `vitals` with `auth.uid() = user_id` select policies (defence in depth;
  backend uses service role).
- Storage: private bucket `reports`; policies letting an authenticated user `insert/select/delete` objects only where
  `(storage.foldername(name))[1] = auth.uid()::text`.

- [x] Write the SQL file.
- [x] **(You)** Run it in the Supabase SQL editor; confirm tables, the `reports` bucket and the function exist.
- [x] Commit: `feat(db): pgvector + storage schema for serverless backend`

### Task 2: Backend auth dependency
**Files:** Create `medsync_auth.py`, `tests/test_auth.py`

**Produces:**
- `@dataclass(frozen=True) class AuthUser: id: str; email: str | None`
- `def parse_bearer_token(header: str | None) -> str` — raises `HTTPException(401)` if missing/malformed.
- `async def get_current_user(authorization: str | None = Header(default=None)) -> AuthUser` — FastAPI
  dependency; validates the token with `supabase.auth.get_user(token)` (works with both legacy HS256 and new
  asymmetric Supabase keys, no JWT secret needed); raises 401 on failure.
- `def get_supabase() -> Client` — cached service-role client (moved out of `main.py`).

- [x] Tests first (`parse_bearer_token`: missing → 401, `"Basic x"` → 401, `"Bearer "` → 401, `"Bearer abc"` → `"abc"`,
      case-insensitive scheme; `get_current_user` with a monkeypatched client: valid → `AuthUser`, error → 401).
- [x] Run → fail. Implement. Run → pass.
- [x] Commit: `feat(api): Supabase JWT auth dependency`

### Task 3: Supabase data-access layer (`medsync_store.py`)
**Files:** Create `medsync_store.py`, `tests/test_store.py`

**Produces (all take `user_id: str` first, all sync — callers wrap in `run_in_threadpool`):**
- `assert_owned_path(user_id, storage_path) -> str` — normalises and rejects anything not under `f"{user_id}/"` or containing `..` (ValueError).
- `download_report(storage_path) -> bytes`
- `signed_url(storage_path, expires_in=3600) -> str`
- `upsert_report(user_id, filename, storage_path, sha256) -> dict` (status `pending`)
- `get_report_by_sha(user_id, sha256) -> dict | None` — replaces the disk extraction cache
- `set_report_result(report_id, *, structured_report=None, status, error=None) -> None`
- `list_reports(user_id) -> list[dict]` / `get_report(user_id, report_id) -> dict | None` / `latest_report(user_id) -> dict | None`
- `replace_chunks(user_id, report_id, chunks: list[tuple[str, dict]], embeddings: list[list[float]]) -> int` — delete old rows for the report, insert new
- `match_chunks(user_id, query_embedding, k, metadata_filter: dict | None) -> list[Document]`
- `delete_report(user_id, report_id) -> dict` — removes storage object, report row (chunks cascade), and the user's `medication_reminders` rows for that filename
- `delete_all_for_user(user_id) -> dict`

- [x] Tests first for the pure pieces: `assert_owned_path` (own path ok; other user's path, `../`, absolute path → ValueError),
      and `match_chunks` row→`Document` mapping using a fake client.
- [x] Implement; tests pass.
- [x] Commit: `feat(api): Supabase storage + pgvector data layer`

### Task 4: Rewire `medsync_rag.py` onto the store
**Files:** Modify `medsync_rag.py`, `tests/test_rag_pure.py`

- [x] Remove: Chroma imports, `get_vectorstore`, `_reset_vectorstore_directory`, `_ensure_persist_directory`,
      `_set_path_writable`, `_cache_path`, disk cache reads/writes, `purge_report_cache`, `clear_all_data`,
      `delete_document_by_filename`, `get_latest_structured_report`, `persist_dir/uploads_dir/cache_dir` config fields.
- [x] Extraction functions take `(cfg, data: bytes, filename: str)` instead of a path (PyMuPDF: `fitz.open(stream=data, filetype="pdf")`; PIL: `Image.open(io.BytesIO(data))`).
- [x] New `ingest_report(cfg, user_id, *, filename, storage_path) -> dict`: download bytes → sha256 → `upsert_report` → reuse `structured_report` from
      `get_report_by_sha` if present → else extract → build markdown → split → embed with `OpenAIEmbeddings.embed_documents`
      → `replace_chunks` → `set_report_result(status="ready")`; on exception `status="failed"` + message.
- [x] `_retrieve_rag_documents(cfg, user_id, question, *, k, history)` embeds the HyDE query and calls `match_chunks`;
      if a metadata filter returns 0 docs, retry once **without** the filter.
- [x] `answer_question` / `iter_chat_stream_events` take `user_id`, retrieve **once**, and return/emit the `sources`
      themselves (stream: `{"event": "sources", ...}`), so `main.py` no longer retrieves separately.
- [x] `load_config()` no longer calls `load_dotenv(override=True)`; `.env` loaded once in `main.py` with `override=False`.
- [x] Tests: `_is_text_dense_pdf`, `_normalize_report_date`, `_structured_report_to_markdown`, `_extract_json_object`
      with fenced JSON, metadata-filter parsing uses `_extract_json_object`.
- [x] Commit: `refactor(rag): stateless pipeline on Supabase`

### Task 5: Rewrite `main.py` routes
**Files:** Modify `main.py`, `tests/test_routes.py` (FastAPI `TestClient` with auth + store monkeypatched)

New surface (all require `Depends(get_current_user)` except `GET /`):
| Method | Path | Notes |
|---|---|---|
| GET | `/` | health |
| POST | `/reports/ingest` | body `{storage_path, filename}` → `assert_owned_path` → sha → upsert → ingest; 400/500 with real status codes |
| GET | `/reports` | list with `id, filename, status, created_at, url` (signed URL) |
| GET | `/reports/latest` | latest `ready` report's structured JSON (no LLM call) |
| DELETE | `/reports/{report_id}` | `delete_report` |
| DELETE | `/reports` | delete everything for this user (replaces `/clear_db`) |
| POST | `/chat`, `/chat/stream` | pass `user.id`; stream forwards `sources`/`faithfulness`/`error` events |
| GET/POST/DELETE | `/vitals…` | filtered by / stamped with `user_id`; `timestamp` from UTC; pydantic bounds (HR 20–250, sleep 0–24, steps 0–200000) |

- [x] Remove: `/upload` multipart, `/files`, `/view-reports` static mount, `/clear_db`, `UPLOAD_DIR`, favicon routes.
- [x] CORS: `allow_origins` from `CORS_ALLOW_ORIGINS` env (comma-separated), `allow_credentials=False`.
- [x] Errors: log full exception, return generic `{"error": "..."}` with proper 4xx/5xx — never `str(e)` for 5xx.
- [x] Blocking work (`ingest`, `answer_question`) wrapped in `run_in_threadpool`.
- [x] Tests: unauthenticated → 401 on every protected route; ingest with another user's path → 400; vitals validation → 422.
- [x] Commit: `feat(api): user-scoped routes, proper status codes`

### Task 6: Vercel packaging for the backend
**Files:** `vercel.json`, `.vercelignore`, `requirements.txt`, `api/index.py`, `README.md`/`SETUP.md`

- [x] `requirements.txt`: drop `chromadb`, `langchain-chroma`, `numpy<2`, `uvicorn`, `python-multipart` (keep uvicorn in `requirements-dev.txt`); keep
      `fastapi, python-dotenv, supabase, langchain-core, langchain-openai, langchain-text-splitters, pymupdf, pillow, pillow-heif`; pin major versions.
- [x] `vercel.json`:
      ```json
      {
        "functions": { "api/index.py": { "maxDuration": 300 } },
        "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }]
      }
      ```
- [x] `.vercelignore` (not `frontend/` — keep the web project's root untouched): `venv/`, `tests/`, `__pycache__/`, `*.md`, `medsync_db/`, `uploads/`, `.medsync_cache/`, `vitals.json`.
- [x] Delete `vitals.json`, root `__pycache__/`; docs: local run is `uvicorn main:app --reload`.
- [x] Verify locally: `pytest -q` green; `uvicorn main:app` starts; `curl localhost:8000/` → 200; `curl localhost:8000/reports` → 401.
- [x] Linux/py3.12 bundle measured at ~199 MB; 71 tests pass on 3.12.
- [x] Commit: `build: package FastAPI backend for Vercel`

---

## Phase 2 — Frontend

### Task 7: Authenticated API calls + proxy
**Files:** Create `frontend/src/lib/api.ts`; modify `frontend/src/lib/backend.ts` and every `frontend/src/app/api/**/route.ts`

- [x] `apiFetch(path, init)` (browser): gets `session.access_token` from the Supabase client and sets `Authorization: Bearer …`.
- [x] `fetchFromBackend(pathname, init, timeoutMs, authHeader)`: forwards `Authorization`; uses only
      `BACKEND_API_BASE_URL` in production (localhost fallback only when `NODE_ENV !== "production"`), and never retries non-GET requests.
- [x] Routes: `files` → `reports` (GET list, DELETE `?id=`), new `reports/ingest`, keep `reports/latest`, `chat`, `chat/stream`, `vitals`.
      Delete `api/upload` and `api/signup`. Parse error bodies with `text()` + safe JSON parse.
- [x] `chat/stream`: timeout only on connecting (clear the timer once headers arrive), so long streams aren't cut off; set `export const maxDuration = 300`.
- [x] Replace every `fetch("/api/...")` in pages/components with `apiFetch`.
- [x] Verify: `npx tsc --noEmit` and `npx eslint src` clean.
- [x] Tasks 7 + 8 committed together (removing the old routes breaks Vault/QuickScan until the new upload flow exists).

### Task 8: Direct-to-Storage uploads + Vault
**Files:** Create `frontend/src/lib/uploadReport.ts`; modify `vault/page.tsx`, `components/layout/QuickScan.tsx`

- [x] `uploadReport(file)`: validate extension (`pdf/png/jpg/jpeg/heic`) and size (≤ 20 MB) → `supabase.storage.from("reports").upload(`${userId}/${Date.now()}-${safeName}`, file, { contentType })` — derive `contentType` from the extension (browsers often report HEIC as `""`, which the bucket's MIME allowlist rejects) → `apiFetch("/api/reports/ingest", {storage_path, filename})` → return `{report_id, ...}`.
- [x] Vault: list from `/api/reports` (uses signed URLs for preview), delete by id, show `pending/failed` status, add `accept=` and reset input value, drop the unused "custom name" or actually use it as `filename`.
- [x] QuickScan: use `uploadReport`, read `answer` (not `response`), and ask about the specific uploaded filename.
- [x] Verified via `next start` proxy with a live throwaway user: 19.5 MB scanned PDF → Storage → ingest (vision) → streamed chat with sources → vitals → delete.
- [ ] **(You)** Click through Vault upload/preview/delete in the browser once (`npm run dev`).
- [x] Commit: `feat(web): upload reports directly to Supabase Storage`

---

## Phase 3 — Deploy on Vercel

> ⏸️ **ON HOLD (since 2026-09-30) — waiting on you.** Nothing below can be done without your
> Vercel/GitHub access. Pending: (1) OK to `git push -u origin vercel-migration`,
> (2) create the `medsync-api` Vercel project, (3) point the existing frontend project's
> Preview `BACKEND_API_BASE_URL` at it, (4) browser click-through, then merge + retire Railway.
> Also pending from Task 8: one manual Vault click-through in the browser.

### Task 9: Deploy `medsync-api`
- [ ] **(You)** Vercel → New Project → import repo → name `medsync-api`, **Root Directory `/`**, Framework "Other".
- [ ] Env vars: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ALLOW_ORIGINS=https://<web-domain>`, optional `COHERE_API_KEY`, `LOG_LEVEL=INFO`.
- [ ] Verify: `curl https://<api>.vercel.app/` → 200; `/reports` → 401; Vercel function log shows no import errors; check bundle size in build output.

### Task 10: Deploy `medsync-web`
- [ ] **(You)** New Project from the same repo → `medsync-web`, **Root Directory `frontend`**, Framework Next.js.
- [ ] Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BACKEND_API_BASE_URL=https://<api>.vercel.app`.
- [ ] Supabase → Auth → URL Configuration: set Site URL + redirect URLs to the web domain.
- [ ] Update `CORS_ALLOW_ORIGINS` on the API project to the final web domain; redeploy API.
- [ ] End-to-end smoke test: sign up → log in → upload → chat (streaming) → vitals add/delete → medications → analytics → delete report → log out.
- [ ] Remove the root `vercel.json` `"framework": "nextjs"` leftovers if any; merge `vercel-migration` → `main`.

### Task 11: Retire Railway
- [ ] Run production on Vercel for a day; then delete the Railway service and remove Railway mentions from `main.py`/docs.

---

## Phase 4 — Remaining review fixes

### Task 12: Extraction quality
- [x] Text-path structuring: stop asking the model to echo `raw_text` (we already have it from PyMuPDF — set it locally), raise `max_tokens` to 2000.
- [x] Vision: `"detail": "high"`.
- [x] Intent classifier wrapped in try/except → default `RETRIEVAL`; new `router_model` setting (`MEDSYNC_ROUTER_MODEL`) replaces the hardcoded model in classifier, filter and HyDE.
- [x] Tests for the text path using a monkeypatched LLM. Live check: 24-lab text PDF now stays on the text path (previously fell back to vision). Commit.

### Task 13: Chat UX correctness
- [x] Cut time-to-first-token (~11 s measured): filter + HyDE now start concurrently with the intent classifier (measured serial prep ≈5.4 s warm → ≈ slowest single call). Dropped the "skip HyDE" idea: no reliable heuristic, and overlap already removes most of its latency.
- [x] Send history as paired `{user, assistant}` turns.
- [x] Handle `error`, `sources`, `faithfulness` SSE events; on failure keep the user message and mark the assistant bubble as failed instead of `slice(0,-1)`.
- [x] Hide the "Analyzing…" spinner once the first token arrives (now inside the reply bubble); show the faithfulness verdict under answers.
- [x] Verified in Chrome against local API + dev server: streamed answer with source check, and API-down error keeps the question and marks the reply failed. Commit.

### Task 14: Honest UI + small bugs
- [ ] Vitals: `!= null` checks instead of truthiness (0 values), separate steps vs bpm in the weekly chart, remove hardcoded "AI Health Suggestion" and "synced from your devices" copy, rename "Sleep Quality" → "Sleep (hours)".
- [ ] Profile: no default "O+" (show "Not set"), remove HIPAA/AES-256 claims, hide non-functional buttons; add negative blood types on signup.
- [ ] Settings: real account deletion via a backend `DELETE /account` (delete all user data + `auth.admin.delete_user`) or remove the button; make `ai_analysis_enabled` either enforced by the backend or removed.
- [ ] Chat page header (title + Download Summary) scrolls out of view: the page is `h-screen` inside a layout that also renders a footer, so the document overflows the viewport.
- [ ] Remove dead code: `components/Sidebar.tsx`, `UploadModal.tsx`, unused Python helpers (`stream_answer_question`, `get_structured_report`).
- [ ] Update README/SETUP to the new architecture. Commit.
