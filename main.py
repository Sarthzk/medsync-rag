"""FastAPI backend entrypoint for the MedSync application.

Responsibilities:
- Receives file uploads and delegates ingestion to the RAG pipeline.
- Receives chat requests and delegates response generation.
- Exposes helper endpoints for file listing and full vault clearing.
"""

import os
import shutil
import logging
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles

from medsync_rag import (
    answer_question,
    clear_all_data,
    ingest_medical_report,
    load_config,
)

logging.basicConfig(
    level=(os.getenv("LOG_LEVEL", "INFO") or "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("medsync.api")

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

    allowed = (".png", ".jpg", ".jpeg", ".heic")
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
        answer = answer_question(cfg, request.question, k=2)
        return {"answer": answer}
    except Exception as e:
        logger.exception("Chat error")
        return {"error": str(e)}

@app.get("/files")
async def list_files():
    """Returns the list of uploaded medical report filenames."""
    if not os.path.exists(UPLOAD_DIR):
        return {"files": []}
    files = os.listdir(UPLOAD_DIR)
    # Filter for valid images
    valid_images = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.heic'))]
    return {"files": valid_images}

@app.post("/clear_db")
async def clear_database():
    """Clears vector data and uploaded files for a full reset."""
    try:
        cfg = load_config()
        return clear_all_data(cfg)
    except Exception as e:
        return {"error": str(e)}