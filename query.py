import os
import chromadb
from openai import OpenAI
from dotenv import load_dotenv

# Load API Key
load_dotenv()
client = OpenAI()

# 1. Connect to your local brain (medsync_db)
chroma_client = chromadb.PersistentClient(path="./medsync_db")
collection = chroma_client.get_or_create_collection(name="medical_reports")

def ask_medsync(question):
    # --- COST SAVER: Local Greeting Filter ---
    # This avoids hitting the API (and spending money) for basic "Hello" messages.
    greetings = ["hi", "hello", "hey", "who are you", "good morning", "how are you"]
    if question.lower().strip() in greetings:
        return "Hello! I am MedSync-RAG, your medical assistant. Please upload a report or ask me a specific question about your health records."

    # --- RAG LOGIC ---
    if collection.count() == 0:
        return "Your medical vault is currently empty. Please upload a report first so I can assist you."

    # 2. Convert the question into a vector
    # We use text-embedding-3-small as it is the most affordable model
    response = client.embeddings.create(
        input=question,
        model="text-embedding-3-small"
    )
    query_embedding = response.data[0].embedding

    # 3. Search ChromaDB for the most relevant chunk
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=1  # Keeping this at 1 minimizes context tokens
    )

    context = results['documents'][0][0]

    # 4. Generate the Final Answer (Optimized for Tokens)
    ai_response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=300,  # Limits the length of the response to save credits
        temperature=0.5, # Keeps the AI focused and less "creative" (safer for medical info)
        messages=[
            {
                "role": "system", 
                "content": (
                    "You are MedSync-RAG, a concise and empathetic medical assistant. "
                    "Use the provided medical context to answer the user's question. "
                    "If the answer is not in the records, state that clearly. "
                    "Always use Markdown (bolding/bullet points) for readability. "
                    "Keep your responses brief and to the point to save tokens."
                )
            },
            {"role": "user", "content": f"Medical Context: {context}\n\nQuestion: {question}"}
        ]
    )

    answer = ai_response.choices[0].message.content
    print(f"🤖 Answer generated: {answer[:50]}...") # Log first 50 chars to terminal
    return answer

if __name__ == "__main__":
    # For local terminal testing
    query = input("\nAsk MedSync: ")
    print(ask_medsync(query))