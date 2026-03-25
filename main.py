import os
import shutil
import chromadb
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles

# Ensure these files exist in your directory
from ingest import process_medical_report
from query import ask_medsync

app = FastAPI()

# --- DIRECTORY SETUP ---
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Mount the uploads folder so the frontend can display images
app.mount("/view-reports", StaticFiles(directory=UPLOAD_DIR), name="reports")

# --- DATABASE SETUP ---
chroma_client = chromadb.PersistentClient(path="./medsync_db")
collection = chroma_client.get_or_create_collection(name="medical_reports")

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    question: str

# --- ENDPOINTS ---

@app.get("/")
def read_root():
    return {"status": "MedSync-RAG API is Online"}

@app.post("/upload")
async def upload_report(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        result = process_medical_report(file_path)
        return {"message": f"Successfully ingested {file.filename}", "details": result}
    except Exception as e:
        print(f"❌ Upload Error: {e}")
        return {"error": str(e)}

@app.post("/chat")
async def chat_with_report(request: ChatRequest):
    try:
        print(f"📩 Received Question: {request.question}")
        answer = ask_medsync(request.question)
        print(f"🤖 AI Answer: {answer}")
        return {"answer": answer}
    except Exception as e:
        print(f"❌ Chat Error: {e}")
        return {"error": str(e)}

@app.get("/files")
async def list_files():
    if not os.path.exists(UPLOAD_DIR):
        return {"files": []}
    files = os.listdir(UPLOAD_DIR)
    # Filter for valid images
    valid_images = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.heic'))]
    return {"files": valid_images}

@app.post("/clear_db")
async def clear_database():
    try:
        ids = collection.get()['ids']
        if ids:
            collection.delete(ids=ids)
        for filename in os.listdir(UPLOAD_DIR):
            file_path = os.path.join(UPLOAD_DIR, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)
        return {"message": "Clear successful"}
    except Exception as e:
        return {"error": str(e)}