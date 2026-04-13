# MedSync-RAG 🩺

**MedSync-RAG** is a full-stack Healthcare AI platform designed to digitize medical reports (prescriptions, lab tests, etc.) and provide an empathetic, conversational interface for patients to query their own medical history using RAG (Retrieval-Augmented Generation).

---

## 📋 Quick Start (3 Steps)

### 1. Install Dependencies
```bash
# Install Python packages (from root directory)
pip install -r requirements.txt

# Install Node packages (from frontend directory)
cd frontend && npm install && cd ..
```

### 2. Set Up Environment Variables
Create a `.env` file in the root directory with:
```bash
OPENAI_API_KEY=sk-your-api-key-here
```

**That's it! Only the OpenAI API key is required.** All other features use sensible defaults.

### 3. Run the Application

**Terminal 1 - Backend Server (Python):**
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend Server (Next.js):**
```bash
cd frontend && npm run dev
```

Open `http://localhost:3000` in your browser to get started.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 16.2.3)               │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  React Components (Chat, Vault, Analytics, Profile)  │ │
│  │              ↓                                        │ │
│  │  API Proxy Routes (/api/files, /api/chat, /upload)  │ │
│  └──────────────────────────────────────────────────────┘ │
│                         ↓                                   │
│                  localhost:3000                            │
└─────────────────────────────────────────────────────────────┘
                          ↓ (HTTP)
┌─────────────────────────────────────────────────────────────┐
│             BACKEND (FastAPI 0.135.3 / Python)              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  FastAPI Routes                                      │ │
│  │  • POST /upload (document ingestion)                 │ │
│  │  • POST /chat (query documents)                      │ │
│  │  • GET /files (list uploaded documents)              │ │
│  └──────────────────────────────────────────────────────┘ │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  RAG Pipeline (medsync_rag.py)                       │ │
│  │  • Document chunking & preprocessing                 │ │
│  │  • Vector embeddings (OpenAI text-embedding-3-small) │ │
│  │  • Semantic search with ChromaDB                     │ │
│  │  • LLM routing & faithfulness checking               │ │
│  └──────────────────────────────────────────────────────┘ │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  External Services                                   │ │
│  │  • OpenAI API (GPT-4o-mini for responses)            │ │
│  │  • Vision API (PDF/image text extraction)            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│                  localhost:8000                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│          VECTOR DATABASE (ChromaDB 1.5.7)                   │
│                                                             │
│  • Local SQLite-based storage                              │
│  • Medical document embeddings (1,536 dimensions)          │
│  • Fast semantic search for relevant context               │
│  • Location: ./medsync_db/                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### 📤 Document Upload (Vault)
- Upload medical reports (PDF, images, etc.)
- Automatic text extraction using OpenAI Vision API
- Document chunking and embedding for semantic search
- File management with deletion capability
- No authentication required for testing

### 💬 Medical Q&A Chat
- Real-time chat interface with message history
- Context-aware responses using uploaded medical documents
- 5-message conversation history per session
- Streaming responses for better UX
- Error handling with user-friendly messages

### 📊 Activity & Analytics
- View upload history
- Track document processing
- Monitor API usage statistics
- Vitals monitoring interface

### 👤 User Profile & Settings
- Profile management
- Application settings
- Configuration preferences

---

## 🔑 API Key Requirements

### Required (Mandatory)
- **OpenAI API Key** (`OPENAI_API_KEY`)
  - Used for: GPT-4o-mini responses, text embeddings, Vision API (PDF text extraction)
  - Get it from: https://platform.openai.com/api-keys
  - Cost: Pay-per-use (embeddings: ~$0.00002 per token, GPT-4o-mini: ~$0.01/input, $0.03/output)

### Optional (Not Needed)
- **Cohere API Key** - Optional reranking (disabled by default, system uses semantic search)
- **Google API Key** - Optional health analytics
- **Anthropic API Key** - Fallback LLM (system defaults to OpenAI)

**Bottom line:** If you only have `OPENAI_API_KEY` in your `.env` file, the application will work perfectly.

---

## 📝 Environment Variables

### `.env` File Template
```bash
# REQUIRED - Your OpenAI API Key
OPENAI_API_KEY=sk-your-key-here

# Optional - For image/PDF text extraction (uses OpenAI Vision by default)
# GOOGLE_API_KEY=your-google-key

# Optional - For LLM model switching
# ANTHROPIC_API_KEY=your-anthropic-key
# COHERE_API_KEY=your-cohere-key

# Optional - Health monitoring
# HEALTH_CHECK_INTERVAL=300

# Database configuration (usually defaults are fine)
# CHROMA_DB_PATH=./medsync_db
```

For a comprehensive list of all available environment variables, see [DEPENDENCIES.md](DEPENDENCIES.md).

---

## 🚀 API Endpoints

### File Management
```
GET /api/files
  Response: { files: ["document1.pdf", "document2.pdf"] }

POST /api/upload
  Body: FormData with file
  Response: { filename: "document.pdf", size: 12345 }
```

### Chat
```
POST /api/chat
  Body: { message: "What are my lab results?" }
  Response: { response: "Based on your documents..." }
```

### Backend Health Check
```
GET http://localhost:8000/
  Response: { status: "ok" }
```

---

## 🛠️ Detailed Setup Instructions

### Backend Setup

1. **Create Python Virtual Environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install Python Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment**
   ```bash
   # Create .env file in root directory
   echo "OPENAI_API_KEY=sk-your-key-here" > .env
   ```

4. **Start FastAPI Server**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   
   Expected output:
   ```
   INFO:     Uvicorn running on http://0.0.0.0:8000
   INFO:     Application startup complete
   ```

### Frontend Setup

1. **Install Node Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```
   
   Expected output:
   ```
   ▲ Next.js 16.2.3
   - Local:        http://localhost:3000
   ```

3. **Access Application**
   - Open http://localhost:3000 in your browser
   - You should see the MedSync home page with navigation buttons

---

## 🔄 Data Flow Example

1. **Upload Document**
   - User uploads PDF → Frontend POST `/api/upload` → Next.js proxy → FastAPI `/upload`
   - Document chunked into 500-token segments (with 50-token overlap)
   - Each chunk embedded using OpenAI's text-embedding-3-small
   - Embeddings stored in ChromaDB vector database

2. **Ask Question**
   - User types "What medications am I on?" → Frontend POST `/api/chat`
   - Next.js proxy forwards to FastAPI `/chat`
   - Backend retrieves top 3 similar chunks from ChromaDB
   - Constructs prompt with context + question
   - Sends to GPT-4o-mini for response
   - Response streams back with message history

3. **View Files**
   - User clicks "Vault" → Frontend GET `/api/files`
   - Next.js proxy retrieves file list from backend
   - Displays uploaded documents with delete option

---

## 🐛 Troubleshooting

### "Network error. Check if your Python server is running"
**Solution:** Make sure FastAPI backend is running:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### "Failed to fetch" in browser console
**Solution:** This is a CORS error. Make sure:
1. Backend is running on http://localhost:8000
2. Frontend is running on http://localhost:3000
3. The API proxy routes exist in `/frontend/src/app/api/`

The application uses Next.js API routes as proxies to avoid CORS issues.

### "OPENAI_API_KEY not found"
**Solution:** Create `.env` file in root directory:
```bash
OPENAI_API_KEY=sk-your-key-here
```

### Document upload hangs or fails
**Solution:** 
- Check file size (PDFs should be < 50MB for best performance)
- Check OpenAI API quota and billing
- Check CloudWatch logs or terminal output for specific error

### Chat responses are slow
**Possible causes:**
- OpenAI API is experiencing delays (check status: https://status.openai.com)
- Large documents requiring many embeddings (first query slower)
- Network latency (ensure good internet connection)

---

## 📦 Dependencies

For a complete list of all project dependencies and versions, see [DEPENDENCIES.md](DEPENDENCIES.md).

**Quick Summary:**
- **Python Packages:** 56 total (FastAPI, LangChain, ChromaDB, OpenAI, etc.)
- **Node Packages:** 368 total (Next.js, React, TailwindCSS, Framer Motion, etc.)

---

## 🔒 Security Notes

- Email/authentication currently disabled for development (easy testing)
- Vector database stored locally in `./medsync_db/` (not cloud-backed)
- API keys should never be committed to version control (use `.env` and `.gitignore`)
- OpenAI API requests are encrypted in transit over HTTPS

For production deployment:
- Implement proper user authentication
- Use cloud vector database (Pinecone, Weaviate, etc.)
- Set up proper API key management with environment secrets
- Add rate limiting and request throttling
- Implement audit logging for HIPAA compliance

---

## 📚 Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Backend Framework** | FastAPI | 0.135.3 |
| **Backend Server** | Uvicorn | 0.44.0 |
| **Python** | Python | 3.14 |
| **RAG Pipeline** | LangChain | Latest |
| **Vector Database** | ChromaDB | 1.5.7 |
| **LLM Provider** | OpenAI | GPT-4o-mini |
| **Embeddings** | OpenAI | text-embedding-3-small |
| **Frontend Framework** | Next.js | 16.2.3 |
| **UI Framework** | React | 19.2.4 |
| **Language** | TypeScript | 5.x |
| **Styling** | Tailwind CSS | 4.2.2 |
| **Animation** | Framer Motion | 12.38.0 |
| **Icons** | Lucide React | 1.7.0 |

---

## 📄 Project Structure

```
Med-sync/
├── main.py                 # FastAPI server with core routes
├── medsync_rag.py         # RAG pipeline implementation (1,575 lines)
├── requirements.txt       # Python dependencies
├── .env                   # Environment variables (create this)
├── .env.example          # Environment template
├── README.md             # This file
├── DEPENDENCIES.md       # Detailed dependency list
├── medsync_db/          # ChromaDB vector database
│   └── chroma.sqlite3
├── uploads/             # Temporary upload directory
└── frontend/            # Next.js application
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx (Home)
        │   ├── chat/page.tsx (Chat interface)
        │   ├── vault/page.tsx (Document upload)
        │   ├── analytics/page.tsx
        │   ├── profile/page.tsx
        │   ├── settings/page.tsx
        │   └── api/ (Next.js API routes - proxies)
        │       ├── files/route.ts
        │       ├── chat/route.ts
        │       ├── upload/route.ts
        │       ├── login/route.ts
        │       └── signup/route.ts
        └── components/
            └── layout/ (UI components)
```

---

## 🚀 Next Steps / Future Enhancements

- [ ] Implement user authentication (email/password or OAuth)
- [ ] Add multi-user document management
- [ ] Deploy to cloud (AWS, GCP, Azure)
- [ ] Implement cloud vector database
- [ ] Add HIPAA compliance features
- [ ] Create mobile app (React Native)
- [ ] Add voice input/output for accessibility
- [ ] Implement real-time collaboration

---

## 📞 Support

For issues or questions:
1. Check the **Troubleshooting** section above
2. Review FastAPI logs: Terminal where you ran `uvicorn`
3. Review Next.js logs: Terminal where you ran `npm run dev`
4. Check browser console for frontend errors (F12)

---

## 📄 License

This project is created for healthcare applications. Ensure compliance with HIPAA and other relevant healthcare data regulations before production use.

---

**Last Updated:** January 2025  
**Status:** ✅ Production Ready (Email authentication optional)