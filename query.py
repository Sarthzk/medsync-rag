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
    # 1. Safety Check
    if collection.count() == 0:
        return "Your medical vault is empty. Please upload a report first."

    try:
        # 2. Embedding the Question
        response = client.embeddings.create(input=question, model="text-embedding-3-small")
        query_embedding = response.data[0].embedding

        # 3. Multi-Result Retrieval (Increased to 2 for better context)
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=2 
        )

        # Debug: Check results structure
        print(f"DEBUG - Query results: {results}")

        # 4. Combine Context with Source Info
        # This tells the AI exactly which files it is looking at
        context_list = []
        if results.get('documents') and len(results['documents']) > 0:
            for i, doc in enumerate(results['documents'][0]):
                meta = results.get('metadatas', [[]])[0][i] if results.get('metadatas') else {}
                source = meta.get('source', 'Unknown Source')
                context_list.append(f"[Source: {source}]\n{doc}")
        
        if not context_list:
            return "No relevant documents found. Please try uploading a medical report first."
        
        full_context = "\n\n---\n\n".join(context_list)
        print(f"DEBUG - Full context built: {full_context[:200]}...")

        # 5. The "Bulletproof" System Prompt
        ai_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system", 
                    "content": (
                        "You are MedSync-RAG. You have access to the user's uploaded medical reports. "
                        "Use the provided context to answer. Always mention the source filename. "
                        "If the user asks for their name or date, look specifically at the [Source] headers. "
                        "If you don't know, suggest they check with a doctor."
                    )
                },
                {"role": "user", "content": f"Context From Vault:\n{full_context}\n\nQuestion: {question}"}
            ],
            max_tokens=400
        )

        return ai_response.choices[0].message.content
    except Exception as e:
        print(f"❌ ask_medsync Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return f"Error processing your question: {str(e)}"

if __name__ == "__main__":
    # For local terminal testing
    query = input("\nAsk MedSync: ")
    print(ask_medsync(query))