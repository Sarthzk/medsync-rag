# MedSync — Setup & Deployment

MedSync is two apps in one repo, deployed as **two Vercel projects** on the free (Hobby) plan:

| Part | Directory | Vercel project | Runtime |
|---|---|---|---|
| API (FastAPI + RAG) | `/` (entry `main.py`, FastAPI preset) | `medsync-api` | Python function |
| Web (Next.js) | `frontend/` | `medsync-web` | Next.js |

All state lives in **Supabase**: Auth, Postgres + pgvector (report chunks), and a private
Storage bucket (`reports`) for uploaded files. The API keeps nothing on local disk.

```
Browser ──(Supabase JWT)──▶ Next.js /api/* proxy ──▶ FastAPI (Vercel function)
   │                                                     │
   └──── uploads file directly ──▶ Supabase Storage ◀────┤ downloads, extracts, embeds
                                   Supabase Postgres ◀───┘ reports, report_chunks (pgvector), vitals
```

## 1. Supabase (once)

1. Create a project at https://supabase.com (free tier is enough).
2. SQL Editor → run the files in `supabase/migrations/` in order (`001` → `003`):
   schema + storage, cascading user deletes, and tightened Row Level Security.
3. Also run the table setups in `frontend/SUPABASE_SETUP.md` (`medication_reminders`)
   and `frontend/SETTINGS_SETUP.md` (`user_settings`) if you haven't.
4. Project Settings → API: note the **Project URL**, **anon key**, and **service_role key**.

## 2. Local development

Prerequisites: Python 3.12+, Node.js 20+, an OpenAI API key.

```bash
# API
python3 -m venv venv
./venv/bin/pip install -r requirements-dev.txt
cp .env.example .env          # fill in OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
./venv/bin/uvicorn main:app --reload --port 8000

# Web (second terminal)
cd frontend
npm install
cat > .env.local <<'ENV'
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
BACKEND_API_BASE_URL=http://localhost:8000
ENV
npm run dev                   # http://localhost:3000
```

Tests: `./venv/bin/pytest -q`

## 3. Deploy to Vercel

### API project (`medsync-api`)
1. Vercel → Add New → Project → import this repo.
2. **Root Directory:** `/` (repo root). **Framework Preset:** Other.
3. Environment Variables: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `CORS_ALLOW_ORIGINS` (your web URL), optional `COHERE_API_KEY`, `LOG_LEVEL`.
4. Deploy, then check `https://<api>.vercel.app/` returns `{"status": ...}` and
   `https://<api>.vercel.app/reports` returns **401**.

### Web project (`medsync-web`)
1. Import the same repo again as a second project.
2. **Root Directory:** `frontend`. **Framework Preset:** Next.js.
3. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `BACKEND_API_BASE_URL=https://<api>.vercel.app`.
4. Supabase → Authentication → URL Configuration: set Site URL / redirect URLs to the web URL.

### Free-tier limits to keep in mind
- Function request bodies are capped at 4.5 MB — that's why files go straight to Supabase Storage
  (bucket limit: 20 MB per file).
- Functions run for at most 300 s; very long scanned PDFs (many pages of vision extraction) can hit it.
- Supabase free projects pause after a week of inactivity; open the dashboard to resume.

## API reference

All routes except `GET /` need `Authorization: Bearer <supabase access token>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Health check |
| POST | `/reports/ingest` | `{storage_path, filename}` → extract, embed, index an uploaded file |
| GET | `/reports` | List the user's reports (with signed preview URLs) |
| GET | `/reports/latest` | Structured data of the newest processed report |
| DELETE | `/reports/{id}` / `/reports` | Delete one / all of the user's reports |
| POST | `/chat` | `{question, history}` → `{answer, sources}` |
| POST | `/chat/stream` | Same, as SSE: `{t}`, `{sources}`, `{faithfulness}`, `{error}`, `[DONE]` |
| GET/POST/DELETE | `/vitals`, `/vitals/{id}` | The user's vitals log |
| DELETE | `/account` | Permanently delete the user and all of their data |
