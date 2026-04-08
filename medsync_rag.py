"""Core MedSync RAG pipeline module.

This file implements:
- config loading and environment handling
- report ingestion (vision extraction -> chunking -> vector storage)
- chat answering with conversational vs medical routing
- full data clearing helpers
"""

import base64
import hashlib
import io
import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv
from PIL import Image
from pillow_heif import register_heif_opener

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda
from langchain_core.runnables.base import Runnable
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger("medsync")


@dataclass(frozen=True)
class MedSyncConfig:
    """Central runtime configuration for backend pipeline behavior."""

    persist_dir: str = "./medsync_db"
    collection_name: str = "medical_reports"
    uploads_dir: str = "./uploads"
    cache_dir: str = "./.medsync_cache"

    chat_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"

    # If enabled, /chat can answer without using the chat model (retrieval-only).
    llm_disabled: bool = False

    # Conservative defaults for predictable output in testing.
    temperature: float = 0.0
    max_answer_tokens: int = 400


def _truthy_env(name: str, default: str = "false") -> bool:
    """Parses boolean-like env values such as true/1/yes/on."""
    val = (os.getenv(name, default) or "").strip().lower()
    return val in {"1", "true", "yes", "y", "on"}


def load_config() -> MedSyncConfig:
    """Loads runtime config from environment and `.env` file."""
    register_heif_opener()
    # Ensure .env settings take precedence over stale exported shell vars.
    load_dotenv(override=True)

    return MedSyncConfig(
        persist_dir=os.getenv("MEDSYNC_CHROMA_DIR", "./medsync_db"),
        collection_name=os.getenv("MEDSYNC_COLLECTION", "medical_reports"),
        uploads_dir=os.getenv("MEDSYNC_UPLOAD_DIR", "./uploads"),
        cache_dir=os.getenv("MEDSYNC_CACHE_DIR", "./.medsync_cache"),
        chat_model=os.getenv("MEDSYNC_CHAT_MODEL", "gpt-4o-mini"),
        embedding_model=os.getenv("MEDSYNC_EMBED_MODEL", "text-embedding-3-small"),
        llm_disabled=_truthy_env("MEDSYNC_LLM_DISABLED", "false"),
        temperature=float(os.getenv("MEDSYNC_TEMPERATURE", "0") or 0),
        max_answer_tokens=int(os.getenv("MEDSYNC_MAX_TOKENS", "400") or 400),
    )


def require_openai_key() -> None:
    """Raises a clear error if OPENAI_API_KEY is missing."""
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Create a .env with OPENAI_API_KEY=... "
            "or export it in your shell."
        )


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: str) -> str:
    """Returns SHA256 hash for idempotent processing and caching."""
    p = Path(path)
    data = p.read_bytes()
    return _sha256_bytes(data)


def _cache_path(cfg: MedSyncConfig, key: str, suffix: str) -> Path:
    """Builds/creates cache path under local cache directory."""
    cache_dir = Path(cfg.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{key}{suffix}"


def _encode_image_to_base64_jpeg(image_path: str) -> str:
    """Converts image to base64 JPEG payload for vision model input."""
    with Image.open(image_path) as img:
        buffer = io.BytesIO()
        img.convert("RGB").save(buffer, format="JPEG")
        return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _extract_text_from_image_with_vision(cfg: MedSyncConfig, image_path: str) -> str:
    """
    Uses a low-detail image input to keep tokens/cost down.
    Cached by file hash so re-uploads don't re-bill.
    """
    require_openai_key()

    file_hash = file_sha256(image_path)
    cache_file = _cache_path(cfg, file_hash, ".vision.json")
    if cache_file.exists():
        try:
            payload = json.loads(cache_file.read_text(encoding="utf-8"))
            cached = payload.get("extracted_text")
            if isinstance(cached, str) and cached.strip():
                return cached
        except Exception:
            logger.warning("Vision cache read failed, regenerating.", exc_info=True)

    b64 = _encode_image_to_base64_jpeg(image_path)
    llm = ChatOpenAI(model=cfg.chat_model, temperature=0)

    # LangChain multimodal: send as a HumanMessage with list content.
    msg = HumanMessage(
        content=[
            {
                "type": "text",
                "text": (
                    "Extract all medical data: Patient Name, Date, Diagnosis, and Medications. "
                    "Format as a clean summary. If unreadable, say [Unreadable]."
                ),
            },
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"},
            },
        ]
    )

    extracted = llm.invoke([msg]).content
    if not isinstance(extracted, str):
        extracted = str(extracted)

    cache_file.write_text(
        json.dumps({"extracted_text": extracted}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return extracted


def get_vectorstore(cfg: MedSyncConfig) -> Chroma:
    """
    Single source of truth for Chroma config so ingest/query/main all agree.
    """
    embeddings = OpenAIEmbeddings(model=cfg.embedding_model)
    return Chroma(
        collection_name=cfg.collection_name,
        persist_directory=cfg.persist_dir,
        embedding_function=embeddings,
    )


def _split_documents(docs: Iterable[Document]) -> list[Document]:
    """Splits extracted text into retrieval-friendly chunks."""
    splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)
    return splitter.split_documents(list(docs))


def ingest_medical_report(cfg: MedSyncConfig, image_path: str) -> dict:
    """
    Idempotent ingestion:
    - content hash ensures same file doesn't create duplicates
    - chunk IDs are stable so re-ingest is safe
    """
    p = Path(image_path)
    if not p.exists():
        raise FileNotFoundError(f"Report not found at {image_path}")

    require_openai_key()

    file_hash = file_sha256(image_path)
    filename = p.name

    extracted_text = _extract_text_from_image_with_vision(cfg, image_path)
    if not extracted_text.strip():
        raise RuntimeError("Vision extraction returned empty text.")

    base_doc = Document(
        page_content=extracted_text,
        metadata={"source": filename, "sha256": file_hash, "type": "medical_report"},
    )
    split_docs = _split_documents([base_doc])

    # Stable IDs per chunk for safe upserts.
    ids = [f"{file_hash}:{i}" for i in range(len(split_docs))]
    vs = get_vectorstore(cfg)
    vs.add_documents(split_docs, ids=ids)

    return {
        "status": "success",
        "file": filename,
        "sha256": file_hash,
        "chunks": len(split_docs),
        "preview": extracted_text[:120],
    }


def _format_context(docs: list[Document]) -> str:
    """Formats retrieved chunks with source labels for prompting."""
    parts: list[str] = []
    for d in docs:
        src = (d.metadata or {}).get("source", "Unknown Source")
        parts.append(f"[Source: {src}]\n{d.page_content}")
    return "\n\n---\n\n".join(parts)


def _is_conversational_query(question: str) -> bool:
    """Heuristic router for casual chat vs medical/report-specific questions."""
    q = (question or "").strip().lower()
    if not q:
        return True

    # Short social phrases should not be forced through medical-RAG behavior.
    social_patterns = [
        r"^(hi|hello|hey|yo|hola|sup)\b",
        r"^(thanks|thank you|thx)\b",
        r"^(how are you|who are you|what can you do)\b",
        r"^(good morning|good afternoon|good evening)\b",
        r"^(ok|okay|cool|great|nice)\b",
        r"^(bye|goodbye|see you)\b",
    ]
    if any(re.search(pattern, q) for pattern in social_patterns):
        return True

    medical_hints = [
        "report",
        "diagnosis",
        "medication",
        "medicine",
        "prescription",
        "dose",
        "patient",
        "lab",
        "test",
        "result",
        "date",
        "doctor",
        "symptom",
        "injury",
        "treatment",
    ]
    return not any(token in q for token in medical_hints)


def build_medical_answer_chain(cfg: MedSyncConfig) -> Runnable:
    """
    Runnable that takes {"question": str, "docs": list[Document]} and returns str.
    """
    system = SystemMessage(
        content=(
            "You are MedSync-RAG, a medical report assistant.\n"
            "- Answer using only the provided report context.\n"
            "- When giving a medical answer, explicitly mention source filename(s).\n"
            "- If the context is insufficient for a medical question, clearly say you don't know based on uploaded reports and suggest consulting a doctor.\n"
            "- Do not invent facts not present in context."
        )
    )

    def to_messages(inp: dict) -> list:
        question = inp["question"]
        docs = inp["docs"]
        context = _format_context(docs)
        return [
            system,
            HumanMessage(
                content=f"Context From Vault:\n{context}\n\nQuestion: {question}"
            ),
        ]

    if cfg.llm_disabled:
        # Budget mode: no chat-completions call, deterministic.
        def retrieval_only(inp: dict) -> str:
            docs = inp["docs"]
            if not docs:
                return "No relevant documents found. Please upload a medical report first."
            context = _format_context(docs)
            return (
                "Budget mode is enabled (no AI generation).\n\n"
                f"Relevant context:\n{context}"
            )

        return RunnableLambda(retrieval_only)

    llm = ChatOpenAI(
        model=cfg.chat_model,
        temperature=cfg.temperature,
        max_tokens=cfg.max_answer_tokens,
    )

    return RunnableLambda(to_messages) | llm | StrOutputParser()


def build_conversational_chain(cfg: MedSyncConfig) -> Runnable:
    """
    Conversational mode for normal chat (non-medical/small talk).
    """
    if cfg.llm_disabled:
        return RunnableLambda(
            lambda inp: (
                "Hi! I can chat normally and also help with your uploaded medical reports. "
                "Ask me anything, or ask report-specific questions like medications, diagnosis, or dates."
            )
        )

    llm = ChatOpenAI(
        model=cfg.chat_model,
        temperature=cfg.temperature,
        max_tokens=cfg.max_answer_tokens,
    )

    system = SystemMessage(
        content=(
            "You are MedSync assistant. Be friendly, concise, and helpful for normal conversation.\n"
            "Do not give medical advice unless user asks about their uploaded reports."
        )
    )

    def to_messages(inp: dict) -> list:
        return [system, HumanMessage(content=inp["question"])]

    return RunnableLambda(to_messages) | llm | StrOutputParser()


def answer_question(cfg: MedSyncConfig, question: str, *, k: int = 2) -> str:
    """Routes question to conversational chain or medical RAG chain."""
    if not question or not question.strip():
        return "Please ask a question."

    if _is_conversational_query(question):
        conv_chain = build_conversational_chain(cfg)
        return conv_chain.invoke({"question": question})

    vs = get_vectorstore(cfg)
    retriever = vs.as_retriever(search_kwargs={"k": k})
    docs = retriever.invoke(question)

    chain = build_medical_answer_chain(cfg)
    return chain.invoke({"question": question, "docs": docs})


def clear_all_data(cfg: MedSyncConfig) -> dict:
    """
    Clears both vectorstore and uploaded files.
    """
    vs = get_vectorstore(cfg)

    # Best-effort wipe of the collection. Chroma supports delete with no filter in most builds;
    # fall back to removing the persisted directory if needed.
    try:
        vs._collection.delete(where={})
    except Exception:
        logger.warning("Vector collection delete failed; removing persisted directory.", exc_info=True)
        persist = Path(cfg.persist_dir)
        if persist.exists():
            for child in persist.iterdir():
                if child.is_file():
                    child.unlink()
                else:
                    import shutil

                    shutil.rmtree(child)

    upload_dir = Path(cfg.uploads_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    removed = 0
    for f in upload_dir.iterdir():
        if f.is_file():
            f.unlink()
            removed += 1

    return {"message": "Clear successful", "deleted_uploads": removed}

