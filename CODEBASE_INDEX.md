# MedSync Codebase Index

## Backend (Python)

- `main.py`: FastAPI API layer. Exposes endpoints for upload, chat, file listing, and vault clearing.
- `medsync_rag.py`: Core LangChain pipeline logic (ingestion, retrieval, conversational routing, and data clearing).

## Frontend (Next.js)

- `frontend/app/page.tsx`: Main MedSync dashboard UI (upload panel, vault gallery, insights widgets, and chat panel).
- `frontend/app/layout.tsx`: Root app shell and global metadata/fonts setup.
- `frontend/app/globals.css`: Shared global styles and theme variables.

## Frontend Config

- `frontend/next.config.ts`: Next.js runtime/build configuration.
- `frontend/eslint.config.mjs`: Lint rules and ignore patterns.
- `frontend/postcss.config.mjs`: PostCSS plugin setup (Tailwind integration).

## Notes

- `requirements.txt` and `frontend/package.json` declare dependencies.
- Generated/artifact files (e.g., `.next`, `node_modules`, `venv`, lockfiles) are intentionally not documented in detail here.
