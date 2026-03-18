# MedSync-RAG 🩺
**MedSync-RAG** is a full-stack Healthcare AI platform designed to digitize medical reports (prescriptions, lab tests, etc.) and provide an empathetic, conversational interface for patients to query their own medical history.

## 🚀 The Architecture
- **AI Brain:** OpenAI GPT-4o-mini (Vision + Chat)
- **Vector Memory:** ChromaDB using `text-embedding-3-small`
- **Backend Bridge:** FastAPI (Python)
- **Clinical Dashboard:** Next.js 14 + Tailwind CSS

## 🛠️ Setup Instructions

### 1. Prerequisites
- Python 3.9+
- Node.js 18+
- An OpenAI API Key

### 2. Backend Installation
1. Navigate to the root folder.
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate