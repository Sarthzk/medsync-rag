# MedSync

MedSync is a full-stack healthcare AI app that helps users upload medical reports, organize their records, and ask questions about their own health data using retrieval-augmented generation.

Website: [Visit the live app](https://medsync-rag.vercel.app/)

## What it does

- Upload medical reports in PDF or image format
- Extract structured report data from documents
- Search uploaded reports with semantic retrieval
- Chat with the system about your own medical records
- View supporting sources and report summaries

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: FastAPI (Python), deployed as a Vercel serverless function
- AI / RAG: LangChain, OpenAI (vision extraction, HyDE retrieval, faithfulness check)
- Data: Supabase — Auth, Postgres + pgvector for report chunks, Storage for uploaded files

## How it works

1. A signed-in user uploads a report in the Vault; the browser stores it in their private Supabase Storage folder.
2. The API downloads it, extracts structured data (text PDFs directly, scans/images via vision), and caches the result.
3. The report is split into chunks, embedded, and stored in pgvector — tagged with the user's id.
4. Chat retrieves only that user's most relevant chunks and answers from them, citing sources.

See [SETUP.md](SETUP.md) for local development and deployment.

## Notes

- The project is designed for personal health records and report-based Q&A.
- The backend and frontend are separated, with the frontend proxying API calls to FastAPI.
- For local development, use the setup instructions in the repository files.
