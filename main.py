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
from datetime import datetime
from collections import defaultdict, deque
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from langchain_core.documents import Document

from medsync_rag import (
    answer_question,
    clear_all_data,
    delete_document_by_filename,
    faithfulness_footer_for_history,
    ingest_medical_report,
    iter_chat_stream_events,
    load_config,
    _retrieve_rag_documents,
)

logging.basicConfig(
    level=(os.getenv("LOG_LEVEL", "INFO") or "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("medsync.api")
SESSION_MEMORY_WINDOW_TURNS = 5
SESSION_HISTORY: dict[str, deque[dict[str, str]]] = defaultdict(
    lambda: deque(maxlen=SESSION_MEMORY_WINDOW_TURNS)
)

app = FastAPI()

# --- DIRECTORY SETUP ---
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Mount the uploads folder so the frontend can display images
app.mount("/view-reports", StaticFiles(directory=UPLOAD_DIR), name="reports")

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.post("/upload")
async def upload_report(file: UploadFile = File(...)):
    """Stores uploaded file and triggers report ingestion."""
    if not file.filename:
        return {"error": "Missing filename."}

    allowed = (".png", ".jpg", ".jpeg", ".heic", ".pdf")
    if not file.filename.lower().endswith(allowed):
        return {"error": f"Unsupported file type. Allowed: {', '.join(allowed)}"}

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        cfg = load_config()
        result = ingest_medical_report(cfg, file_path)
        return {"message": f"Successfully ingested {file.filename}", "details": result}
    except Exception as e:
        logger.exception("Upload error")
        return {"error": str(e)}

@app.post("/chat")
async def chat_with_report(request: ChatRequest):
    """Answers user questions via retrieval + conversational routing pipeline."""
    try:
        logger.info("Received question")
        cfg = load_config()
        session_id = (request.session_id or "default").strip() or "default"
        history = request.history if request.history is not None else list(SESSION_HISTORY[session_id])
        
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
        SESSION_HISTORY[session_id].append({"user": request.question, "assistant": answer})
        return {"answer": answer, "sources": sources, "session_id": session_id}
    except Exception as e:
        logger.exception("Chat error")
        return {"error": str(e)}


@app.post("/chat/stream")
async def chat_with_report_stream(request: ChatRequest):
    """Same routing as /chat; streams token deltas as Server-Sent Events (SSE)."""
    cfg = load_config()
    session_id = (request.session_id or "default").strip() or "default"
    history = request.history if request.history is not None else list(SESSION_HISTORY[session_id])
    
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
            SESSION_HISTORY[session_id].append(
                {"user": request.question, "assistant": full + footer}
            )
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


@app.delete("/files/{filename}")
async def delete_file(filename: str):
    """Deletes a file from the uploads directory and removes its vectors from the database."""
    try:
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        # Security: prevent directory traversal
        if not os.path.abspath(file_path).startswith(os.path.abspath(UPLOAD_DIR)):
            return {"error": "Invalid filename"}
        
        if not os.path.exists(file_path):
            return {"error": "File not found"}
        
        # Delete from filesystem
        os.remove(file_path)
        logger.info(f"Deleted file: {filename}")
        
        # Delete from vector database
        cfg = load_config()
        vector_result = delete_document_by_filename(cfg, filename)
        
        if "error" in vector_result:
            logger.warning(f"File deleted but vector deletion failed: {vector_result['error']}")
        
        return {"message": f"Successfully deleted {filename}", "vector_deleted": "error" not in vector_result}
    except Exception as e:
        logger.exception("File deletion error")
        return {"error": str(e)}


# --- VITALS ENDPOINTS ---
VITALS_FILE = "vitals.json"

def load_vitals() -> list[dict]:
    """Load vital logs from JSON file."""
    if not os.path.exists(VITALS_FILE):
        return []
    try:
        with open(VITALS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_vitals(vitals: list[dict]):
    """Save vital logs to JSON file."""
    with open(VITALS_FILE, "w") as f:
        json.dump(vitals, f, indent=2)

class VitalLogRequest(BaseModel):
    heart_rate: int | None = None
    sleep_quality: float | None = None
    daily_steps: int | None = None

@app.get("/vitals")
async def get_vitals():
    """Returns all logged vitals in reverse chronological order."""
    vitals = load_vitals()
    # Sort by timestamp descending
    vitals.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return {"logs": vitals}

@app.post("/vitals")
async def log_vital(request: VitalLogRequest):
    """Logs a new vital entry."""
    vitals = load_vitals()
    
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
    
    vitals.append(new_log)
    save_vitals(vitals)
    
    return new_log

@app.delete("/vitals/{vital_id}")
async def delete_vital(vital_id: str):
    """Deletes a vital log entry."""
    vitals = load_vitals()
    vitals = [v for v in vitals if v.get("id") != vital_id]
    save_vitals(vitals)
    return {"message": "Vital log deleted"}

@app.post("/clear_db")
async def clear_database():
    """Clears vector data and uploaded files for a full reset."""
    try:
        cfg = load_config()
        return clear_all_data(cfg)
    except Exception as e:
        return {"error": str(e)}