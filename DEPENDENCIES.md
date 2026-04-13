# MedSync Dependencies

## ✅ Quick Answer: API Keys Required

**To run this project, you ONLY need:**
- **OpenAI API Key** - Required for AI features

That's it! Your `.env` file with just `OPENAI_API_KEY` is perfectly sufficient.

---

## 📦 Python Dependencies (Backend)

### Core Framework
- **fastapi==0.135.3** - Web framework for REST APIs
- **uvicorn==0.44.0** - ASGI server to run FastAPI
- **python-multipart==0.0.26** - File upload handling

### AI & LLM
- **openai==2.31.0** - OpenAI API client (GPT-4o-mini, embeddings)
- **langchain-core==1.2.28** - LLM framework core
- **langchain-openai==1.1.12** - OpenAI integration for LangChain
- **langchain-text-splitters==1.1.1** - Document chunking
- **langchain-chroma==1.1.0** - ChromaDB integration
- **chromadb==1.5.7** - Vector database (stores embeddings)

### Data & File Handling
- **pydantic==2.13.0** - Data validation
- **pydantic-settings==2.13.1** - Environment config management
- **pillow==12.2.0** - Image processing (JPG, PNG)
- **pillow-heif==1.3.0** - HEIC image support
- **python-dotenv==1.2.2** - Load .env files

### Supporting Libraries
- **numpy==2.4.4** - Numerical computing
- **requests==2.33.1** - HTTP client
- **tenacity==9.1.4** - Retry logic
- **tiktoken==0.12.0** - Token counting

### Optional Dependencies
- **cohere** - Cohere reranking (not installed, completely optional)

**Total: 56 Python packages**

---

## 📦 Node.js Dependencies (Frontend)

### Core Framework
- **next==16.2.3** - React framework with SSR
- **react==19.2.4** - UI library
- **react-dom==19.2.4** - React DOM bindings

### Styling & UI
- **tailwindcss==4.2.2** - Utility-first CSS
- **@tailwindcss/postcss==4.2.2** - Tailwind PostCSS
- **autoprefixer==10.4.27** - CSS vendor prefixes
- **postcss==8.5.8** - CSS processing

### Animation & Icons
- **framer-motion==12.38.0** - React animations
- **lucide-react==1.7.0** - Icon library (200+ icons)

### Development
- **typescript==5.x** - Type safety
- **eslint==9.x** - Code linting
- **eslint-config-next==16.2.1** - Next.js ESLint config

**Total: 368 packages (with dependencies)**

---

## 🛠️ Installation Commands

### Python Setup
```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
```

### Node.js Setup
```bash
cd frontend
npm install
```

---

## ✨ Optional Enhancements

If you want advanced features later, you can add:

### Reranking (better search results)
- **Cohere API Key** - Add `COHERE_API_KEY` to `.env`
- Cost: Free tier available, ~$1 per 1M tokens

### Hosting
- **Railway / Render / AWS** - For production deployment
- **Vercel** - For Next.js frontend
- **PostgreSQL** - For persistent data (currently uses SQLite via ChromaDB)

---

## 📋 What's Actually Required

| Component | Requirement | Status |
|-----------|-------------|--------|
| OPENAI_API_KEY | ✅ REQUIRED | Must have |
| COHERE_API_KEY | ❌ Optional | Works without it |
| Database | ✅ Included | ChromaDB (local) |
| Auth | ❌ Not needed | Skip for now |
| Vector Store | ✅ Included | ChromaDB built-in |

---

## 🚀 Minimal .env File

Create `.env` with just:
```
OPENAI_API_KEY=sk-your-key-here
```

That's all you need! Everything else uses defaults.

---

## 📊 Dependency Summary

| Category | Count | Examples |
|----------|-------|----------|
| Python Backend | 56 | FastAPI, LangChain, OpenAI |
| Node.js Frontend | 368 | Next.js, React, Tailwind |
| Total Packages | 424 | - |
| API Keys Required | 1 | OpenAI |
| Optional API Keys | 1 | Cohere |
| Databases | 1 | ChromaDB (local) |

---

*Last Updated: April 13, 2026*
