import os
import base64
import io
import chromadb
from openai import OpenAI
from dotenv import load_dotenv
from PIL import Image
from pillow_heif import register_heif_opener

# 1. Setup & API Key Check
register_heif_opener()
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
    img = Image.open(image_path)
    buffer = io.BytesIO()
    img.convert("RGB").save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

def process_medical_report(image_path):
    if not os.path.exists(image_path):
        print(f"❌ ERROR: File '{image_path}' not found!")
        return

    print(f"🔍 Step 1: Reading {image_path}...")
    base64_image = encode_image(image_path)

    print("🤖 Step 2: Extracting medical text via OpenAI Vision...")
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract all medical data. Explicitly include the Patient Name, Date, and all medications. Format as a comprehensive medical summary"},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                ],
            }
        ],
    )
    extracted_text = response.choices[0].message.content
    print(f"📝 Text Extracted: {extracted_text[:100]}...")

    print("🔢 Step 3: Generating Embeddings...")
    emb_response = client.embeddings.create(
        input=extracted_text,
        model="text-embedding-3-small"
    )
    embedding = emb_response.data[0].embedding

    print("💾 Step 4: Storing in local Vector DB...")
    collection.add(
        ids=[os.path.basename(image_path)],
        embeddings=[embedding],
        documents=[extracted_text],
        metadatas=[{"file_path": image_path}]
    )
    print("✅ DONE! Your report is now in the database.")

if __name__ == "__main__":
    # CHANGE THIS to your actual filename
    process_medical_report("test.png")