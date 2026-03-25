import os
import base64
import io
import chromadb
from openai import OpenAI
from dotenv import load_dotenv
from PIL import Image
from pillow_heif import register_heif_opener

# 1. Setup & API Key Check
register_heif_opener() # Enables HEIC support for PIL
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    print("❌ ERROR: OpenAI API Key not found in .env file!")
    exit()

client = OpenAI(api_key=api_key)

# 2. Initialize ChromaDB
print("📦 Initializing ChromaDB...")
chroma_client = chromadb.PersistentClient(path="./medsync_db")
collection = chroma_client.get_or_create_collection(name="medical_reports")

def encode_image(image_path):
    """Converts any image (including HEIC) to a Base64 JPEG for OpenAI."""
    with Image.open(image_path) as img:
        buffer = io.BytesIO()
        # Convert to RGB to ensure compatibility (especially for HEIC/PNG)
        img.convert("RGB").save(buffer, format="JPEG")
        return base64.b64encode(buffer.getvalue()).decode('utf-8')

def process_medical_report(image_path):
    """Digitizes report, generates embeddings, and stores in ChromaDB with metadata."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Report not found at {image_path}")

    filename = os.path.basename(image_path)
    print(f"⚙️ Processing: {filename}...")

    try:
        # 1. Vision Extraction (Low detail = ~85 tokens = Cost Efficient)
        base64_image = encode_image(image_path)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract all medical data: Patient Name, Date, Diagnosis, and Medications. Format as a clean summary. If unreadable, say [Unreadable]."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}", "detail": "low"}}
                    ],
                }
            ],
        )
        extracted_text = response.choices[0].message.content

        # 2. Generate Embedding (Using the most affordable 'small' model)
        emb_response = client.embeddings.create(
            input=extracted_text,
            model="text-embedding-3-small"
        )
        embedding = emb_response.data[0].embedding

        # 3. Storage with Metadata
        # Using filename as ID prevents duplicate entries for the same file
        collection.upsert(
            ids=[filename], 
            embeddings=[embedding],
            documents=[extracted_text],
            metadatas=[{"source": filename, "type": "medical_report"}]
        )
        
        print(f"✅ Successfully ingested: {filename}")
        return {"status": "success", "file": filename, "text": extracted_text[:100]}

    except Exception as e:
        print(f"❌ Ingestion Error for {filename}: {e}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    # Test with a local file if needed
    test_file = "test.png"
    if os.path.exists(test_file):
        process_medical_report(test_file)
    else:
        print(f"Skipping test: {test_file} not found.")