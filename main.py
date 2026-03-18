import os
import shutil
import chromadb
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import your existing logic (make sure these files are in the same folder)
from ingest import process_medical_report
from query import ask_medsync

app = FastAPI()

chroma_client = chromadb.PersistentClient(path="./medsync_db")
collection = chroma_client.get_or_create_collection(name="medical_reports")

# 1. Enable CORS (Crucial for Rushikesh's Frontend to talk to your Backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, change this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Data Model for Chat
class ChatRequest(BaseModel):
    question: str

@app.get("/")
def read_root():
    return {"status": "MedSync-RAG API is Online"}

# 3. Endpoint: Upload a Report
@app.post("/upload")
async def upload_report(file: UploadFile = File(...)):
    # Save the file temporarily
    file_path = f"temp_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Run your Phase 1 Ingest Logic
    try:
        process_medical_report(file_path)
        return {"message": f"Successfully ingested {file.filename}"}
    except Exception as e:
        return {"error": str(e)}
    finally:
        # Clean up the temp file if you want, or move it to a 'reports' folder
        if os.path.exists(file_path):
            os.remove(file_path)

# 4. Endpoint: Ask a Question
@app.post("/chat")
async def chat_with_report(request: ChatRequest):
    try:
        # We modify ask_medsync slightly to 'return' text instead of just printing it
        answer = ask_medsync(request.question)
        return {"answer": answer}
    except Exception as e:
        return {"error": str(e)}

@app.post("/clear_db")
async def clear_database():
    try:
        # This deletes everything in the collection
        ids = collection.get()['ids']
        if ids:
            collection.delete(ids=ids)
        return {"message": "Database cleared successfully"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/count")
async def get_count():
    # This tells you how many reports are actually in the DB
    return {"count": collection.count()}