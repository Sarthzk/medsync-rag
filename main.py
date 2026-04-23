"""FastAPI backend entrypoint for the MedSync application.

Responsibilities:
- Receives file uploads and delegates ingestion to the RAG pipeline.
- Receives chat requests and delegates response generation.
- Exposes helper endpoints for file listing and full vault clearing.
"""

import json
import os
import shutil
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.responses import Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from langchain_core.documents import Document
from starlette.concurrency import run_in_threadpool
from supabase import Client, create_client

from medsync_rag import (
    answer_question,
    clear_all_data,
    delete_document_by_filename,
    faithfulness_footer_for_history,
    get_latest_structured_report,
    ingest_medical_report,
    iter_chat_stream_events,
    load_config,
    _retrieve_rag_documents,
    file_sha256,
    purge_report_cache,
)

logging.basicConfig(
    level=(os.getenv("LOG_LEVEL", "INFO") or "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("medsync.api")

# Load root .env before any startup validation or env-dependent config reads.
load_dotenv(override=False)

# --- DIRECTORY SETUP ---
def _default_upload_dir() -> str:
    # Vercel serverless has a read-only filesystem except for /tmp
    if (os.getenv("VERCEL") or "").strip():
        return "/tmp/uploads"
    return "uploads"


UPLOAD_DIR = (os.getenv("MEDSYNC_UPLOAD_DIR") or "").strip() or _default_upload_dir()


def _validate_required_env_vars() -> None:
    """Validates that all required environment variables are set at startup.
    
    Exits with a clear error message if any are missing, preventing silent crashes
    during request handling.
    """
    required_vars = {
        "OPENAI_API_KEY": "OpenAI API key for LLM completions",
        "SUPABASE_URL": "Supabase project URL for vitals storage",
        "SUPABASE_SERVICE_ROLE_KEY": "Supabase service role key for admin access",
    }
    
    missing_vars = []
    for var_name, description in required_vars.items():
        value = (os.getenv(var_name) or "").strip()
        if not value:
            missing_vars.append(f"  • {var_name}: {description}")
    
    if missing_vars:
        error_msg = (
            "\n❌ STARTUP FAILED: Missing required environment variables.\n"
            "Please set the following in your deployment environment:\n"
            + "\n".join(missing_vars) +
            "\n\nFor Railway, add these in your project's Variables section.\n"
            "For local development, add them to .env"
        )
        logger.critical(error_msg)
        raise RuntimeError(error_msg)
    
    logger.info("✓ All required environment variables are set")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate critical environment variables first.
    load_dotenv(override=False)
    _validate_required_env_vars()

    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
    except OSError:
        # Best-effort: uploads are optional in serverless; /upload will surface errors if unwritable.
        logger.exception("Could not create upload directory: %s", UPLOAD_DIR)

    yield


app = FastAPI(lifespan=lifespan)

# Mount the uploads folder so the frontend can display images.
# `check_dir=False` avoids import-time crashes on platforms where the directory
# doesn't exist yet (e.g., serverless cold start).
app.mount(
    "/view-reports",
    StaticFiles(directory=UPLOAD_DIR, check_dir=False),
    name="reports",
)
# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-app.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_TABLE_VITALS = "vitals"
_SUPABASE_CLIENT: Client | None = None


def _get_supabase() -> Client:
    """Create/reuse a Supabase client from environment variables."""
    global _SUPABASE_CLIENT
    if _SUPABASE_CLIENT is not None:
        return _SUPABASE_CLIENT

    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError(
            "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )
    _SUPABASE_CLIENT = create_client(url, key)
    return _SUPABASE_CLIENT

class ChatRequest(BaseModel):
    """Request payload schema for the chat endpoint."""

    question: str
    session_id: str | None = None
    history: list[dict[str, str]] | None = None
    skip_faithfulness: bool = False


def _extract_sources(docs: list[Document]) -> list[str]:
    """Extract unique source filenames from retrieved documents."""
    sources = set()
    for doc in docs:
        if hasattr(doc, 'metadata') and isinstance(doc.metadata, dict):
            source = doc.metadata.get('source')
            if source:
                sources.add(source)
    return sorted(list(sources))

# --- ENDPOINTS ---

@app.get("/")
def read_root():
    """Simple API health/status endpoint."""
    return {"status": "MedSync-RAG API is Online"}


@app.get("/favicon.ico")
def favicon_ico():
    # Avoid Vercel rewriting favicon requests into noisy errors/404s.
    return Response(status_code=204)


@app.get("/favicon.png")
def favicon_png():
    return Response(status_code=204)


@app.post("/upload")
async def upload_report(file: UploadFile = File(...)):
    """Stores uploaded file and triggers report ingestion."""
    if not file.filename:
        return {"error": "Missing filename."}

    # Sanitize any client-supplied path components.
    filename = os.path.basename(file.filename).replace("..", "").strip()
    if not filename:
        return {"error": "Invalid filename."}

    allowed = (".png", ".jpg", ".jpeg", ".heic", ".pdf")
    if not filename.lower().endswith(allowed):
        return {"error": f"Unsupported file type. Allowed: {', '.join(allowed)}"}

    upload_root = os.path.abspath(UPLOAD_DIR)
    file_path = os.path.abspath(os.path.join(upload_root, filename))
    if os.path.commonpath([upload_root, file_path]) != upload_root:
        return {"error": "Invalid file path."}

    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if os.path.getsize(file_path) == 0:
            try:
                os.remove(file_path)
            except OSError:
                logger.warning("Could not remove empty upload file: %s", file_path, exc_info=True)
            return JSONResponse({"error": "Uploaded file is empty."}, status_code=400)

        cfg = load_config()
        result = ingest_medical_report(cfg, file_path)
        return {"message": f"Successfully ingested {filename}", "details": result}
    except (ValueError, FileNotFoundError) as e:
        logger.warning("Upload rejected: %s", e)
        return JSONResponse({"error": str(e)}, status_code=400)
    except Exception as e:
        logger.exception("Upload error")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/chat")
async def chat_with_report(request: ChatRequest):
    """Answers user questions via retrieval + conversational routing pipeline.

    Conversation context is sourced from client-provided `history`.
    """
    try:
        logger.info("Received question")
        cfg = load_config()
        session_id = (request.session_id or "default").strip() or "default"
        history = request.history or []
        
        # Retrieve documents to extract sources
        docs = _retrieve_rag_documents(cfg, request.question, k=5, history=history)
        sources = _extract_sources(docs) if docs else []
        
        answer = answer_question(
            cfg,
            request.question,
            k=5,
            history=history,
            skip_faithfulness=request.skip_faithfulness,
        )
        return {"answer": answer, "sources": sources, "session_id": session_id}
    except Exception as e:
        logger.exception("Chat error")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/chat/stream")
async def chat_with_report_stream(request: ChatRequest):
    """Same routing as /chat; streams token deltas as Server-Sent Events (SSE)."""
    cfg = load_config()
    session_id = (request.session_id or "default").strip() or "default"
    history = request.history or []
    
    # Retrieve documents to extract sources
    docs = _retrieve_rag_documents(cfg, request.question, k=5, history=history)
    sources = _extract_sources(docs) if docs else []

    def event_stream():
        pieces: list[str] = []
        verdict: dict | None = None
        try:
            for evt in iter_chat_stream_events(
                cfg,
                request.question,
                k=5,
                history=history,
                skip_faithfulness=request.skip_faithfulness,
            ):
                if evt.get("event") == "token":
                    token = evt.get("text") or ""
                    pieces.append(token)
                    yield f"data: {json.dumps({'t': token})}\n\n"
                elif evt.get("event") == "faithfulness":
                    payload = evt.get("payload")
                    if isinstance(payload, dict):
                        verdict = payload
                        yield f"data: {json.dumps({'faithfulness': verdict})}\n\n"
            full = "".join(pieces)
            footer = faithfulness_footer_for_history(verdict)
            # Send sources before [DONE]
            if sources:
                yield f"data: {json.dumps({'sources': sources})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Stream chat error")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/files")
async def list_files():
    """Returns the list of uploaded medical report filenames with download URLs."""
    if not os.path.exists(UPLOAD_DIR):
        return {"files": []}
    files = os.listdir(UPLOAD_DIR)
    valid_reports = [f for f in files if f.lower().endswith((".png", ".jpg", ".jpeg", ".heic", ".pdf"))]
    # Return file objects with name and url
    return {"files": [{"name": f, "url": f"/view-reports/{f}"} for f in valid_reports]}


@app.get("/reports/latest")
async def latest_report():
    """Returns structured JSON for the most recently uploaded report (if any)."""
    try:
        cfg = load_config()
        return get_latest_structured_report(cfg)
    except Exception as e:
        logger.exception("Latest report error")
        return {"error": str(e), "structured_report": None}


@app.delete("/files/{filename}")
async def delete_file(filename: str):
    """Deletes a file from uploads, vectors, and extraction cache."""
    try:
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        # Security: prevent directory traversal
        if not os.path.abspath(file_path).startswith(os.path.abspath(UPLOAD_DIR)):
            return {"error": "Invalid filename"}
        
        if not os.path.exists(file_path):
            return {"error": "File not found"}

        cfg = load_config()
        sha256 = file_sha256(file_path)

        # Delete from filesystem
        os.remove(file_path)
        logger.info(f"Deleted file: {filename}")

        # Delete from vector database
        vector_result = delete_document_by_filename(cfg, filename)
        
        if "error" in vector_result:
            logger.warning(f"File deleted but vector deletion failed: {vector_result['error']}")

        cache_result = purge_report_cache(cfg, sha256=sha256)

        return {
            "message": f"Successfully deleted {filename}",
            "vector_deleted": "error" not in vector_result,
            "cache_deleted": cache_result,
        }
    except Exception as e:
        logger.exception("File deletion error")
        return {"error": str(e)}


# --- VITALS ENDPOINTS ---
async def _sb_list_vitals() -> list[dict]:
    sb = _get_supabase()

    def _run():
        res = (
            sb.table(SUPABASE_TABLE_VITALS)
            .select("*")
            .order("timestamp", desc=True)
            .execute()
        )
        return res.data or []

    return await run_in_threadpool(_run)


async def _sb_insert_vital(row: dict) -> dict:
    sb = _get_supabase()

    def _run():
        res = sb.table(SUPABASE_TABLE_VITALS).insert(row).execute()
        data = res.data or []
        return data[0] if data else row

    return await run_in_threadpool(_run)


async def _sb_delete_vital(vital_id: str) -> bool:
    sb = _get_supabase()

    def _run():
        res = sb.table(SUPABASE_TABLE_VITALS).delete().eq("id", vital_id).execute()
        data = res.data or []
        return len(data) > 0

    return await run_in_threadpool(_run)

class VitalLogRequest(BaseModel):
    heart_rate: int | None = None
    sleep_quality: float | None = None
    daily_steps: int | None = None

@app.get("/vitals")
async def get_vitals():
    """Returns all logged vitals in reverse chronological order."""
    try:
        vitals = await _sb_list_vitals()
        return {"logs": vitals}
    except Exception as e:
        logger.exception("Vitals list error")
        return {"error": str(e), "logs": []}

@app.post("/vitals")
async def log_vital(request: VitalLogRequest):
    """Logs a new vital entry."""
    timestamp = int(datetime.now().timestamp() * 1000)
    date = datetime.now().strftime("%Y-%m-%d")
    
    new_log = {
        "id": str(uuid.uuid4()),
        "heart_rate": request.heart_rate,
        "sleep_quality": request.sleep_quality,
        "daily_steps": request.daily_steps,
        "date": date,
        "timestamp": timestamp,
    }

    try:
        return await _sb_insert_vital(new_log)
    except Exception as e:
        logger.exception("Vitals insert error")
        return {"error": str(e)}

@app.delete("/vitals/{vital_id}")
async def delete_vital(vital_id: str):
    """Deletes a vital log entry."""
    try:
        deleted = await _sb_delete_vital(vital_id)
        if not deleted:
            return {"error": "Vital log not found"}
        return {"message": "Vital log deleted"}
    except Exception as e:
        logger.exception("Vitals delete error")
        return {"error": str(e)}

@app.post("/clear_db")
async def clear_database():
    """Clears vector data and uploaded files for a full reset."""
    try:
        cfg = load_config()
        return clear_all_data(cfg)
    except Exception as e:
        logger.exception("Clear DB error")
        return JSONResponse({"error": str(e)}, status_code=500)