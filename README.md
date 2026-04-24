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
- Backend: FastAPI, Python
- AI / RAG: LangChain, OpenAI, ChromaDB
- Storage: Local uploads and local vector database
- Auth: Supabase

## How it works

1. A user uploads a report through the Vault.
2. The backend extracts the report into structured content.
3. The report is split into chunks and embedded into ChromaDB.
4. The chat system retrieves the most relevant chunks.
5. The model answers using the retrieved report context.

## Notes

- The project is designed for personal health records and report-based Q&A.
- The backend and frontend are separated, with the frontend proxying API calls to FastAPI.
- For local development, use the setup instructions in the repository files.
