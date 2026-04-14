"""Core MedSync RAG pipeline module.

This file implements:
- config loading and environment handling
- report ingestion (structured extraction + markdown for embeddings -> chunking -> vector storage)
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
import shutil
from datetime import UTC, datetime
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Literal

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

IntentLabel = Literal["RETRIEVAL", "GENERAL_MEDICAL", "CONVERSATIONAL"]
_INTENT_CACHE: dict[str, IntentLabel] = {}


def _history_to_text(history: list[dict] | None, *, max_turns: int = 5) -> str:
    """Formats recent conversation turns for routing and prompting."""
    if not history:
        return ""
    turns = history[-max_turns:]
    lines: list[str] = []
    for idx, turn in enumerate(turns, start=1):
        user_msg = str((turn or {}).get("user") or "").strip()
        assistant_msg = str((turn or {}).get("assistant") or "").strip()
        if user_msg:
            lines.append(f"Turn {idx} User: {user_msg}")
        if assistant_msg:
            lines.append(f"Turn {idx} Assistant: {assistant_msg}")
    return "\n".join(lines).strip()


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
    # Short replies for chitchat / general medical (not report-grounded RAG).
    max_conversational_tokens: int = 400
    # Report-grounded answers (medication plans, multiple diagnoses, lab discussion).
    max_medical_rag_tokens: int = 1200
    # Second-pass LLM check: answer claims vs retrieved context (set true to skip API call).
    faithfulness_disabled: bool = False


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
        max_conversational_tokens=int(os.getenv("MEDSYNC_MAX_TOKENS", "400") or 400),
        max_medical_rag_tokens=int(os.getenv("MEDSYNC_MAX_MEDICAL_TOKENS", "1200") or 1200),
        faithfulness_disabled=_truthy_env("MEDSYNC_FAITHFULNESS_DISABLED", "false"),
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


def _encode_pil_to_base64_jpeg(img: Image.Image) -> str:
    """Converts an in-memory PIL image to base64 JPEG payload."""
    buffer = io.BytesIO()
    img.convert("RGB").save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _extract_json_object(raw: str) -> dict:
    """Best-effort JSON object parse from model output."""
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _default_structured_report() -> dict:
    return {
        "patient_name": "",
        "report_date": "",
        "report_type": "",
        "diagnoses": [],
        "medications": [],
        "lab_results": [],
        "doctor_notes": "",
        "raw_text": "",
    }


def _sanitize_structured_report(parsed: dict) -> dict:
    base = _default_structured_report()
    if not isinstance(parsed, dict):
        return base

    patient_name = str(parsed.get("patient_name") or "").strip()
    report_date = _normalize_report_date(str(parsed.get("report_date") or "").strip())
    report_type = str(parsed.get("report_type") or "").strip()

    diagnoses_raw = parsed.get("diagnoses")
    diagnoses = (
        [str(x).strip() for x in diagnoses_raw if str(x).strip()]
        if isinstance(diagnoses_raw, list)
        else []
    )

    medications_raw = parsed.get("medications")
    medications = (
        [str(x).strip() for x in medications_raw if str(x).strip()]
        if isinstance(medications_raw, list)
        else []
    )

    labs_raw = parsed.get("lab_results")
    lab_results: list[dict] = []
    if isinstance(labs_raw, list):
        for item in labs_raw:
            if isinstance(item, dict):
                clean_item = {
                    "name": str(item.get("name") or "").strip(),
                    "value": str(item.get("value") or "").strip(),
                    "unit": str(item.get("unit") or "").strip(),
                    "reference_range": str(item.get("reference_range") or "").strip(),
                    "flag": str(item.get("flag") or "").strip(),
                }
                if any(clean_item.values()):
                    lab_results.append(clean_item)

    doctor_notes = str(parsed.get("doctor_notes") or "").strip()
    raw_text = str(parsed.get("raw_text") or "").strip()
    return {
        "patient_name": patient_name,
        "report_date": report_date,
        "report_type": report_type,
        "diagnoses": diagnoses,
        "medications": medications,
        "lab_results": lab_results,
        "doctor_notes": doctor_notes,
        "raw_text": raw_text,
    }


def _structured_report_metadata(structured_report: dict) -> dict:
    patient_name = (structured_report.get("patient_name") or "").strip()
    report_date = _normalize_report_date((structured_report.get("report_date") or "").strip())
    report_type = (structured_report.get("report_type") or "").strip()
    diagnoses = structured_report.get("diagnoses") or []
    medications = structured_report.get("medications") or []
    lab_results = structured_report.get("lab_results") or []
    doctor_notes = (structured_report.get("doctor_notes") or "").strip()

    return {
        "patient_name": patient_name,
        "patient_name_norm": _to_norm_token(patient_name),
        "report_date": report_date,
        "report_year_month": report_date[:7] if report_date else "",
        "report_type": report_type,
        "report_type_norm": _to_norm_token(report_type),
        "diagnoses_json": json.dumps(diagnoses, ensure_ascii=False),
        "medications_json": json.dumps(medications, ensure_ascii=False),
        "lab_results_json": json.dumps(lab_results, ensure_ascii=False),
        "doctor_notes": doctor_notes,
    }


def _extract_structured_report_from_text(cfg: MedSyncConfig, raw_text: str, *, source: str) -> dict:
    """
    Normalizes raw report text into fixed structured schema JSON.
    """
    text = (raw_text or "").strip()
    if not text:
        return _default_structured_report()

    if cfg.llm_disabled:
        return _default_structured_report()

    try:
        require_openai_key()
        llm = ChatOpenAI(model=cfg.chat_model, temperature=0, max_tokens=500)
        system = SystemMessage(
            content=(
                "Transform medical report text into strict JSON.\n"
                "Return ONLY a JSON object with this exact schema:\n"
                "{\n"
                '  "patient_name": string,\n'
                '  "report_date": string,\n'
                '  "report_type": string,\n'
                '  "diagnoses": string[],\n'
                '  "medications": string[],\n'
                '  "lab_results": [{"name": string, "value": string, "unit": string, "reference_range": string, "flag": string}],\n'
                '  "doctor_notes": string,\n'
                '  "raw_text": string\n'
                "}\n"
                "Rules:\n"
                "- Use empty string/empty array for unknown values.\n"
                "- report_date should be YYYY-MM-DD when possible.\n"
                "- raw_text should contain the full plain text content of the report when available, or empty string if unavailable.\n"
                "- Do not include extra keys."
            )
        )
        human = HumanMessage(content=f"Source: {source}\n\nReport text:\n{text[:12000]}")
        raw = llm.invoke([system, human]).content
        if not isinstance(raw, str):
            raw = str(raw)
        return _sanitize_structured_report(_extract_json_object(raw))
    except Exception:
        logger.warning("Structured extraction from text failed.", exc_info=True)
        return _default_structured_report()


def _is_text_dense_pdf(text: str, page_count: int) -> bool:
    """
    Heuristic for classifying PDF as text-based vs scanned image.
    """
    if page_count <= 0:
        return False
    non_ws_chars = len(re.sub(r"\s+", "", text or ""))
    chars_per_page = non_ws_chars / page_count
    return chars_per_page >= 120


def _extract_text_from_pdf(pdf_path: str) -> tuple[str, int]:
    """
    Extracts machine text from PDF pages using PyMuPDF.
    """
    fitz_module = __import__("fitz")
    with fitz_module.open(pdf_path) as doc:
        pages: list[str] = []
        for page in doc:
            page_text = page.get_text("text") or ""
            pages.append(page_text)
        return "\n\n".join(pages).strip(), len(doc)


def _rasterize_pdf_pages_to_images(pdf_path: str) -> list[Image.Image]:
    """
    Renders PDF pages to PIL images for vision-based extraction.
    """
    fitz_module = __import__("fitz")
    images: list[Image.Image] = []
    with fitz_module.open(pdf_path) as doc:
        for page in doc:
            pix = page.get_pixmap(matrix=fitz_module.Matrix(2, 2), alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
    return images


def _merge_structured_reports(reports: list[dict]) -> dict:
    """
    Merges per-page structured reports into one document-level structured report.
    """
    merged = _default_structured_report()
    if not reports:
        return merged

    for rep in reports:
        if not merged["patient_name"] and rep.get("patient_name"):
            merged["patient_name"] = rep.get("patient_name", "")
        if not merged["report_date"] and rep.get("report_date"):
            merged["report_date"] = _normalize_report_date(rep.get("report_date", ""))
        if not merged["report_type"] and rep.get("report_type"):
            merged["report_type"] = rep.get("report_type", "")
        for diag in rep.get("diagnoses", []):
            if diag and diag not in merged["diagnoses"]:
                merged["diagnoses"].append(diag)
        for med in rep.get("medications", []):
            if med and med not in merged["medications"]:
                merged["medications"].append(med)
        for lab in rep.get("lab_results", []):
            if isinstance(lab, dict) and lab not in merged["lab_results"]:
                merged["lab_results"].append(lab)
        notes = (rep.get("doctor_notes") or "").strip()
        if notes:
            if merged["doctor_notes"]:
                merged["doctor_notes"] += "\n\n" + notes
            else:
                merged["doctor_notes"] = notes
        raw_page_text = (rep.get("raw_text") or "").strip()
        if raw_page_text:
            if merged["raw_text"]:
                merged["raw_text"] += "\n\n" + raw_page_text
            else:
                merged["raw_text"] = raw_page_text
    return _sanitize_structured_report(merged)


def _extract_structured_report_from_image_b64_with_vision(
    cfg: MedSyncConfig, b64_image: str
) -> dict:
    """
    Extracts report content into a fixed JSON schema for consistent chunking/retrieval.
    Cached by file hash so re-uploads don't re-bill.
    """
    require_openai_key()

    llm = ChatOpenAI(model=cfg.chat_model, temperature=0)

    # LangChain multimodal: send as a HumanMessage with list content.
    msg = HumanMessage(
        content=[
            {
                "type": "text",
                "text": (
                    "Extract report details as strict JSON.\n"
                    "Return ONLY a JSON object with this exact schema:\n"
                    "{\n"
                    '  "patient_name": string,\n'
                    '  "report_date": string,  // YYYY-MM-DD when possible, else ""\n'
                    '  "report_type": string,\n'
                    '  "diagnoses": string[],\n'
                    '  "medications": string[],\n'
                    '  "lab_results": [{"name": string, "value": string, "unit": string, "reference_range": string, "flag": string}],\n'
                    '  "doctor_notes": string,\n'
                    '  "raw_text": string\n'
                    "}\n"
                    "Rules:\n"
                    "- Use empty string/empty array for missing fields.\n"
                    "- raw_text should contain the full plain text content of the report when available, or empty string if unavailable.\n"
                    "- Do not add extra keys.\n"
                    "- Keep values concise and faithful to the report."
                ),
            },
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64_image}", "detail": "low"},
            },
        ]
    )

    extracted = llm.invoke([msg]).content
    if not isinstance(extracted, str):
        extracted = str(extracted)
    structured_report = _sanitize_structured_report(_extract_json_object(extracted))

    return structured_report


def _extract_structured_report_from_image_with_vision(
    cfg: MedSyncConfig, image_path: str
) -> dict:
    """
    Extracts report content into a fixed JSON schema for consistent chunking/retrieval.
    Cached by file hash so re-uploads don't re-bill.
    """
    require_openai_key()

    file_hash = file_sha256(image_path)
    cache_file = _cache_path(cfg, file_hash, ".vision.structured.json")
    if cache_file.exists():
        try:
            payload = json.loads(cache_file.read_text(encoding="utf-8"))
            cached = payload.get("structured_report")
            if isinstance(cached, dict):
                return _sanitize_structured_report(cached)
        except Exception:
            logger.warning("Vision cache read failed, regenerating.", exc_info=True)

    b64 = _encode_image_to_base64_jpeg(image_path)
    structured_report = _extract_structured_report_from_image_b64_with_vision(cfg, b64)
    cache_file.write_text(
        json.dumps({"structured_report": structured_report}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return structured_report


def _extract_structured_report_from_document(
    cfg: MedSyncConfig, report_path: str
) -> dict:
    """
    Document extraction entrypoint:
    - Images: direct vision extraction
    - PDFs: text-density routed extraction
      * text-based PDFs -> direct text extraction + structuring
      * scanned PDFs -> page rasterization + vision extraction per page
    """
    ext = Path(report_path).suffix.lower()
    if ext in {".png", ".jpg", ".jpeg", ".heic"}:
        return _extract_structured_report_from_image_with_vision(cfg, report_path)

    if ext != ".pdf":
        raise RuntimeError(f"Unsupported report extension: {ext}")

    try:
        machine_text, page_count = _extract_text_from_pdf(report_path)
    except Exception as exc:
        raise RuntimeError(
            "PDF support requires PyMuPDF. Install dependency `pymupdf`."
        ) from exc

    file_hash = file_sha256(report_path)
    cache_file = _cache_path(cfg, file_hash, ".pdf.structured.json")
    if cache_file.exists():
        try:
            payload = json.loads(cache_file.read_text(encoding="utf-8"))
            cached = payload.get("structured_report")
            if isinstance(cached, dict):
                return _sanitize_structured_report(cached)
        except Exception:
            logger.warning("PDF structured cache read failed, regenerating.", exc_info=True)

    if _is_text_dense_pdf(machine_text, page_count):
        structured = _extract_structured_report_from_text(
            cfg, machine_text, source=Path(report_path).name
        )
    else:
        images = _rasterize_pdf_pages_to_images(report_path)
        page_reports: list[dict] = []
        for img in images:
            b64 = _encode_pil_to_base64_jpeg(img)
            page_reports.append(_extract_structured_report_from_image_b64_with_vision(cfg, b64))
            img.close()
        structured = _merge_structured_reports(page_reports)

    cache_file.write_text(
        json.dumps({"structured_report": structured}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return structured


def _structured_report_to_markdown(structured_report: dict, *, source: str) -> str:
    """
    Renders structured fields as readable markdown for embedding (images, scanned PDFs,
    or when raw PDF text is not used).
    """
    sr = structured_report or {}
    lines: list[str] = [f"# Medical report ({source})", ""]

    patient_name = (sr.get("patient_name") or "").strip()
    report_date = (sr.get("report_date") or "").strip()
    report_type = (sr.get("report_type") or "").strip()
    if patient_name or report_date or report_type:
        lines.append("## Patient & report")
        if patient_name:
            lines.append(f"- **Patient:** {patient_name}")
        if report_date:
            lines.append(f"- **Report date:** {report_date}")
        if report_type:
            lines.append(f"- **Report type:** {report_type}")
        lines.append("")

    diagnoses = sr.get("diagnoses") or []
    if isinstance(diagnoses, list) and diagnoses:
        lines.append("## Diagnoses")
        for item in diagnoses:
            if str(item).strip():
                lines.append(f"- {item}")
        lines.append("")

    medications = sr.get("medications") or []
    if isinstance(medications, list) and medications:
        lines.append("## Medications")
        for item in medications:
            if str(item).strip():
                lines.append(f"- {item}")
        lines.append("")

    labs = sr.get("lab_results") or []
    if isinstance(labs, list) and labs:
        lines.append("## Lab results")
        lines.append("| Test | Value | Unit | Reference | Flag |")
        lines.append("| --- | --- | --- | --- | --- |")
        for lab in labs:
            if isinstance(lab, dict):
                lines.append(
                    f"| {lab.get('name', '')} | {lab.get('value', '')} | {lab.get('unit', '')} | "
                    f"{lab.get('reference_range', '')} | {lab.get('flag', '')} |"
                )
        lines.append("")

    notes = (sr.get("doctor_notes") or "").strip()
    if notes:
        lines.append("## Clinical notes")
        lines.append(notes)
        lines.append("")

    raw_text = (sr.get("raw_text") or "").strip()
    if raw_text and len(raw_text) > 20:
        lines.append("## Raw extracted text")
        lines.append(raw_text)
        lines.append("")

    return "\n".join(lines).strip()


def _pdf_to_markdown_pages(pdf_path: str) -> str:
    """Turns extractable PDF page text into markdown sections for embedding."""
    fitz_module = __import__("fitz")
    name = Path(pdf_path).name
    parts: list[str] = [f"# Medical report ({name})", ""]
    with fitz_module.open(pdf_path) as doc:
        for i, page in enumerate(doc, start=1):
            page_text = (page.get_text("text") or "").strip()
            parts.append(f"## Page {i}")
            parts.append("")
            parts.append(page_text if page_text else "[No extractable text on this page.]")
            parts.append("")
    return "\n".join(parts).strip()


def _build_rag_markdown_for_ingest(report_path: str, structured_report: dict) -> str:
    """
    Markdown body for vector search: text-dense PDFs use PyMuPDF text; otherwise
    structured fields rendered as markdown (same schema as UI metadata).
    """
    path = Path(report_path)
    ext = path.suffix.lower()
    if ext != ".pdf":
        return _structured_report_to_markdown(structured_report, source=path.name)

    try:
        machine_text, page_count = _extract_text_from_pdf(report_path)
    except Exception:
        logger.warning("PDF markdown build failed; using structured markdown.", exc_info=True)
        return _structured_report_to_markdown(structured_report, source=path.name)

    if _is_text_dense_pdf(machine_text, page_count):
        return _pdf_to_markdown_pages(report_path)
    return _structured_report_to_markdown(structured_report, source=path.name)


def _set_path_writable(path: Path) -> None:
    """Makes a file or directory writable where possible."""
    try:
        mode = path.stat().st_mode
        path.chmod(mode | 0o222)
    except Exception:
        pass


def _ensure_persist_directory(cfg: MedSyncConfig) -> None:
    """Ensures the Chroma persist directory exists and is writable."""
    persist = Path(cfg.persist_dir)
    persist.mkdir(parents=True, exist_ok=True)
    _set_path_writable(persist)
    if not os.access(persist, os.W_OK):
        raise PermissionError(
            f"Chroma persist directory {persist} is not writable. "
            "Check that the directory exists and the current user has write permissions."
        )


def _is_readonly_db_error(exc: Exception) -> bool:
    return "readonly" in str(exc).lower()


def get_vectorstore(cfg: MedSyncConfig) -> Chroma:
    """
    Single source of truth for Chroma config so ingest/query/main all agree.
    """
    _ensure_persist_directory(cfg)
    embeddings = OpenAIEmbeddings(model=cfg.embedding_model)
    return Chroma(
        collection_name=cfg.collection_name,
        persist_directory=cfg.persist_dir,
        embedding_function=embeddings,
    )


def _reset_vectorstore_directory(cfg: MedSyncConfig) -> None:
    """
    Recreates the persisted Chroma directory when it becomes read-only/corrupted.
    """
    persist = Path(cfg.persist_dir)
    if persist.exists():
        _set_path_writable(persist)
        for item in persist.rglob("*"):
            _set_path_writable(item)
        shutil.rmtree(persist, ignore_errors=True)
    persist.mkdir(parents=True, exist_ok=True)


def _split_documents(docs: Iterable[Document]) -> list[Document]:
    """Splits extracted text into retrieval-friendly chunks."""
    splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)
    return splitter.split_documents(list(docs))


def ingest_medical_report(cfg: MedSyncConfig, image_path: str) -> dict:
    """
    Idempotent ingestion:
    - Structured JSON is extracted for metadata (widgets, filters) and kept on each chunk.
    - Markdown is built for embedding: text PDFs from PyMuPDF page text; images/scanned
      PDFs from structured fields rendered as markdown.
    - content hash ensures same file doesn't create duplicates; chunk IDs are stable.
    """
    p = Path(image_path)
    if not p.exists():
        raise FileNotFoundError(f"Report not found at {image_path}")

    require_openai_key()

    file_hash = file_sha256(image_path)
    filename = p.name

    structured_report = _extract_structured_report_from_document(cfg, image_path)
    extracted_metadata = _structured_report_metadata(structured_report)
    structured_json = json.dumps(
        structured_report, ensure_ascii=False, sort_keys=True, indent=2
    )
    if not structured_json.strip():
        raise RuntimeError("Vision extraction returned empty structured content.")

    markdown_body = _build_rag_markdown_for_ingest(image_path, structured_report)
    if not markdown_body.strip():
        raise RuntimeError("Could not build markdown content for indexing.")

    base_doc = Document(
        page_content=markdown_body,
        metadata={
            "source": filename,
            "sha256": file_hash,
            "type": "medical_report",
            **extracted_metadata,
        },
    )
    split_docs = _split_documents([base_doc])

    # Stable IDs per chunk for safe upserts.
    ids = [f"{file_hash}:{i}" for i in range(len(split_docs))]
    vs = get_vectorstore(cfg)
    try:
        vs.add_documents(split_docs, ids=ids)
    except Exception as exc:
        # Chroma can occasionally get into a readonly state on local sqlite.
        # Recover once by recreating the persist directory and retrying.
        if not _is_readonly_db_error(exc):
            raise
        logger.warning(
            "Vectorstore is readonly; rebuilding local index directory and retrying once."
        )
        _reset_vectorstore_directory(cfg)
        vs = get_vectorstore(cfg)
        vs.add_documents(split_docs, ids=ids)

    return {
        "status": "success",
        "file": filename,
        "sha256": file_hash,
        "chunks": len(split_docs),
        "metadata": extracted_metadata,
        "preview": markdown_body[:120],
    }


def _format_context(docs: list[Document]) -> str:
    """Formats retrieved chunks with source labels for prompting."""
    parts: list[str] = []
    for d in docs:
        src = (d.metadata or {}).get("source", "Unknown Source")
        parts.append(f"[Source: {src}]\n{d.page_content}")
    return "\n\n---\n\n".join(parts)


def _medical_rag_messages(inp: dict) -> list:
    """Chat messages for report-grounded answers (shared by invoke + stream)."""
    system = SystemMessage(
        content=(
            "You are MedSync-RAG, a medical report assistant.\n"
            "- Answer using only the provided report context.\n"
            "- When giving a medical answer, explicitly mention source filename(s).\n"
            "- If the user asks a broad question about their report (for example, 'how is my report?'), summarize the key findings, diagnoses, medications, lab values, and relevant details from the retrieved context.\n"
            "- Give complete answers (medications, diagnoses, labs) with important caveats and uncertainties when relevant; do not skip caveats to be shorter.\n"
            "- If the context is insufficient for a medical question, clearly say you don't know based on uploaded reports and suggest consulting a doctor.\n"
            "- Do not invent facts not present in context."
        )
    )
    question = inp["question"]
    docs = inp["docs"]
    history_text = _history_to_text(inp.get("history"), max_turns=5)
    context = _format_context(docs)
    return [
        system,
        HumanMessage(
            content=(
                f"Conversation History:\n{history_text or '[none]'}\n\n"
                f"Context From Vault:\n{context}\n\nQuestion: {question}"
            )
        ),
    ]


def _conversational_messages(inp: dict) -> list:
    system = SystemMessage(
        content=(
            "You are MedSync assistant. Be friendly, concise, and helpful for normal conversation.\n"
            "Do not give medical advice unless user asks about their uploaded reports."
        )
    )
    history_text = _history_to_text(inp.get("history"), max_turns=5)
    return [
        system,
        HumanMessage(
            content=(
                f"Conversation History:\n{history_text or '[none]'}\n\n"
                f"Question: {inp['question']}"
            )
        ),
    ]


def _general_medical_messages(inp: dict) -> list:
    system = SystemMessage(
        content=(
            "You are a general medical information assistant.\n"
            "Provide concise educational information, not diagnosis.\n"
            "Encourage consulting a qualified clinician for personal medical decisions."
        )
    )
    history_text = _history_to_text(inp.get("history"), max_turns=5)
    return [
        system,
        HumanMessage(
            content=(
                f"Conversation History:\n{history_text or '[none]'}\n\n"
                f"Question: {inp['question']}"
            )
        ),
    ]


def _iter_llm_stream_tokens(llm: ChatOpenAI, messages: list) -> Iterator[str]:
    """Yields text deltas from a streaming ChatOpenAI call."""
    for chunk in llm.stream(messages):
        content = getattr(chunk, "content", None)
        if not content:
            continue
        if isinstance(content, str):
            if content:
                yield content
        else:
            # Rare non-string content (e.g. structured parts); best-effort text only.
            yield str(content)


def _normalize_intent_label(raw: str) -> IntentLabel:
    token = (raw or "").strip().upper()
    if token in {"RETRIEVAL", "GENERAL_MEDICAL", "CONVERSATIONAL"}:
        return token  # type: ignore[return-value]
    if "RETRIEVAL" in token:
        return "RETRIEVAL"
    if "GENERAL_MEDICAL" in token:
        return "GENERAL_MEDICAL"
    return "CONVERSATIONAL"


def _classify_intent(
    cfg: MedSyncConfig, question: str, *, history: list[dict] | None = None
) -> IntentLabel:
    """
    Lightweight intent classification with per-session in-memory cache.
    Returns one of: RETRIEVAL, GENERAL_MEDICAL, CONVERSATIONAL.
    """
    normalized_question = (question or "").strip()
    if not normalized_question:
        return "CONVERSATIONAL"

    history_text = _history_to_text(history, max_turns=5)
    cache_key = f"{history_text}\n\n{normalized_question}".lower()
    cached = _INTENT_CACHE.get(cache_key)
    if cached:
        return cached

    # Quick heuristic: detect ONLY pure greetings (no substantive question)
    lower_q = normalized_question.lower()
    pure_greeting_patterns = [
        "^hello$", "^hi$", "^hey$", "^good morning$", "^good afternoon$", "^good evening$",
        "^how are you", "^how's it going", "^what's up", "^yo$", "^sup$",
        "^thanks$", "^thank you$", "^bye$", "^goodbye$", "^see you",
    ]
    import re
    is_pure_greeting = any(re.match(pattern, lower_q) for pattern in pure_greeting_patterns)
    
    if is_pure_greeting:
        intent: IntentLabel = "CONVERSATIONAL"
        _INTENT_CACHE[cache_key] = intent
        return intent

    if cfg.llm_disabled:
        # In budget mode, skip classifier API usage and prefer retrieval for safety.
        intent = "RETRIEVAL"
        _INTENT_CACHE[cache_key] = intent
        return intent

    require_openai_key()
    classifier = ChatOpenAI(model="gpt-4o-mini", temperature=0, max_tokens=8)
    system = SystemMessage(
        content=(
            "Classify the user query intent for a medical assistant.\n"
            "Return exactly one token from this set only:\n"
            "RETRIEVAL | GENERAL_MEDICAL | CONVERSATIONAL\n\n"
            "Definitions:\n"
            "- RETRIEVAL: user asks about uploaded reports, their personal diagnosis/results/medications, or asks to extract/compare/report-specific facts.\n"
            "- GENERAL_MEDICAL: general health/medical knowledge question not tied to uploaded reports.\n"
            "- CONVERSATIONAL: pure greetings, chitchat, non-medical/general assistant talk (with NO substantive question).\n"
            "Output only the label."
        )
    )
    human = HumanMessage(
        content=(
            f"Conversation history:\n{history_text or '[none]'}\n\n"
            f"Current user query:\n{normalized_question}"
        )
    )
    raw = classifier.invoke([system, human]).content
    if not isinstance(raw, str):
        raw = str(raw)
    intent = _normalize_intent_label(raw)
    _INTENT_CACHE[cache_key] = intent
    return intent


def _cohere_rerank_documents(
    question: str, docs: list[Document], *, top_n: int
) -> list[Document]:
    """
    Reranks candidate chunks with Cohere rerank endpoint when COHERE_API_KEY is set.
    Falls back to raising RuntimeError so caller can use a deterministic fallback.
    """
    api_key = (os.getenv("COHERE_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("COHERE_API_KEY not configured.")

    documents = [d.page_content for d in docs]
    payload = {
        "model": "rerank-english-v3.0",
        "query": question,
        "documents": documents,
        "top_n": min(top_n, len(documents)),
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.cohere.com/v1/rerank",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.URLError as exc:
        raise RuntimeError("Cohere rerank request failed.") from exc

    parsed = json.loads(raw)
    results = parsed.get("results", [])
    reranked: list[Document] = []
    for item in results:
        idx = item.get("index")
        if isinstance(idx, int) and 0 <= idx < len(docs):
            reranked.append(docs[idx])
    if not reranked:
        raise RuntimeError("Cohere rerank returned no usable results.")
    return reranked


def _rerank_documents(question: str, docs: list[Document], *, top_n: int) -> list[Document]:
    """
    Returns the best `top_n` documents using reranking when available.
    Current strategy: Cohere rerank (if configured), otherwise preserve retriever order.
    """
    if not docs:
        return docs

    limited_n = min(top_n, len(docs))
    try:
        return _cohere_rerank_documents(question, docs, top_n=limited_n)
    except Exception:
        logger.warning("Reranking unavailable; using vector similarity order.", exc_info=True)
        return docs[:limited_n]


def _to_norm_token(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _normalize_report_date(raw: str) -> str:
    """
    Converts common date formats to YYYY-MM-DD.
    Returns empty string when parsing fails.
    """
    if not raw:
        return ""
    candidate = raw.strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(candidate, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def _previous_month_ym(now_utc: datetime) -> str:
    year = now_utc.year
    month = now_utc.month - 1
    if month == 0:
        return f"{year - 1}-12"
    return f"{year:04d}-{month:02d}"


def _build_metadata_filter(
    cfg: MedSyncConfig, question: str, *, history: list[dict] | None = None
) -> dict | None:
    """
    Builds Chroma metadata filter from user query intent constraints.
    """
    if cfg.llm_disabled:
        return None

    try:
        require_openai_key()
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, max_tokens=120)
        system = SystemMessage(
            content=(
                "Extract optional retrieval filters from the query.\n"
                "Return strict JSON with keys: patient_name, report_type, date_scope, report_year_month, report_date.\n"
                "- date_scope must be one of: none | last_month | this_month | exact_date | exact_month.\n"
                "- report_year_month must be YYYY-MM for exact_month.\n"
                "- report_date must be YYYY-MM-DD for exact_date.\n"
                "Use empty strings when absent. Output JSON only."
            )
        )
        history_text = _history_to_text(history, max_turns=5)
        raw = llm.invoke(
            [
                system,
                HumanMessage(
                    content=(
                        f"Conversation history:\n{history_text or '[none]'}\n\n"
                        f"Current user query:\n{question}"
                    )
                ),
            ]
        ).content
        if not isinstance(raw, str):
            raw = str(raw)
        parsed = json.loads(raw)
    except Exception:
        logger.warning("Metadata filter extraction failed; skipping pre-filter.", exc_info=True)
        return None

    clauses: list[dict] = []
    patient_name = _to_norm_token((parsed.get("patient_name") or "").strip())
    if patient_name:
        clauses.append({"patient_name_norm": patient_name})

    report_type = _to_norm_token((parsed.get("report_type") or "").strip())
    if report_type:
        clauses.append({"report_type_norm": report_type})

    date_scope = (parsed.get("date_scope") or "none").strip().lower()
    now = datetime.now(UTC)
    if date_scope == "last_month":
        clauses.append({"report_year_month": _previous_month_ym(now)})
    elif date_scope == "this_month":
        clauses.append({"report_year_month": now.strftime("%Y-%m")})
    elif date_scope == "exact_month":
        ym = (parsed.get("report_year_month") or "").strip()
        if re.fullmatch(r"\d{4}-\d{2}", ym):
            clauses.append({"report_year_month": ym})
    elif date_scope == "exact_date":
        rd = _normalize_report_date((parsed.get("report_date") or "").strip())
        if rd:
            clauses.append({"report_date": rd})

    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


def _build_hybrid_retriever(
    vs: Chroma, *, candidate_k: int, metadata_filter: dict | None = None
):
    """
    Builds a hybrid retriever:
    - BM25 keyword retriever over all indexed chunks
    - semantic vector retriever from Chroma
    Combined with EnsembleRetriever weights [0.4, 0.6] (BM25, semantic).
    """
    search_kwargs = {"k": candidate_k}
    if metadata_filter:
        search_kwargs["filter"] = metadata_filter
    semantic_retriever = vs.as_retriever(search_kwargs=search_kwargs)

    try:
        # Dynamic import avoids hard failure/linter issues when optional extras are missing.
        ensemble_module = __import__("langchain.retrievers", fromlist=["EnsembleRetriever"])
        bm25_module = __import__(
            "langchain_community.retrievers", fromlist=["BM25Retriever"]
        )
        EnsembleRetriever = getattr(ensemble_module, "EnsembleRetriever")
        BM25Retriever = getattr(bm25_module, "BM25Retriever")

        payload = vs.get(include=["documents", "metadatas"])
        raw_docs = payload.get("documents") or []
        raw_metas = payload.get("metadatas") or []

        bm25_docs: list[Document] = []
        for idx, page_content in enumerate(raw_docs):
            if not isinstance(page_content, str) or not page_content.strip():
                continue
            metadata = raw_metas[idx] if idx < len(raw_metas) and isinstance(raw_metas[idx], dict) else {}
            bm25_docs.append(Document(page_content=page_content, metadata=metadata))

        if not bm25_docs:
            return semantic_retriever

        bm25_retriever = BM25Retriever.from_documents(bm25_docs)
        bm25_retriever.k = candidate_k
        return EnsembleRetriever(
            retrievers=[bm25_retriever, semantic_retriever],
            weights=[0.4, 0.6],
        )
    except Exception:
        logger.warning("Hybrid retrieval unavailable; using semantic retrieval only.", exc_info=True)
        return semantic_retriever


def _build_hyde_query(
    cfg: MedSyncConfig, question: str, *, history: list[dict] | None = None
) -> str:
    """
    HyDE (Hypothetical Document Embeddings):
    generate a plausible report-grounded answer and retrieve using that text.
    """
    base_question = (question or "").strip()
    if not base_question:
        return question

    if cfg.llm_disabled:
        return base_question

    try:
        require_openai_key()
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, max_tokens=220)
        system = SystemMessage(
            content=(
                "Write a concise hypothetical medical report excerpt that would answer the user query.\n"
                "Do not mention uncertainty or missing context.\n"
                "Use clinically meaningful terms likely to appear in lab reports, diagnoses, medications, and assessments.\n"
                "Return plain text only."
            )
        )
        history_text = _history_to_text(history, max_turns=5)
        human = HumanMessage(
            content=(
                f"Conversation history:\n{history_text or '[none]'}\n\n"
                f"User query: {base_question}"
            )
        )
        raw = llm.invoke([system, human]).content
        if not isinstance(raw, str):
            raw = str(raw)
        hyde_text = raw.strip()
        if not hyde_text:
            return base_question
        return hyde_text
    except Exception:
        logger.warning("HyDE generation failed; falling back to raw query.", exc_info=True)
        return base_question


def _clean_response_formatting(text: str) -> str:
    """
    Clean up markdown formatting to make responses look more professional.
    Converts markdown to plain text with proper formatting.
    """
    import re
    
    # Remove markdown headers (###, ##, #) and replace with bold text
    text = re.sub(r'^###\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^##\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^#\s+', '', text, flags=re.MULTILINE)
    
    # Convert **text** to just text (remove bold markdown)
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    
    # Clean up bullet points with markdown (•• becomes •)
    text = re.sub(r'•+', '•', text)
    
    # Remove excessive whitespace between sections
    text = re.sub(r'\n\n\n+', '\n\n', text)
    
    # Clean up leading/trailing whitespace
    text = text.strip()
    
    return text


def build_medical_answer_chain(cfg: MedSyncConfig) -> Runnable:
    """
    Runnable that takes {"question": str, "docs": list[Document]} and returns str.
    """
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
        max_tokens=cfg.max_medical_rag_tokens,
    )

    return RunnableLambda(_medical_rag_messages) | llm | StrOutputParser()


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
        max_tokens=cfg.max_conversational_tokens,
    )

    return RunnableLambda(_conversational_messages) | llm | StrOutputParser()


def build_general_medical_chain(cfg: MedSyncConfig) -> Runnable:
    """
    General medical Q&A mode (not report-grounded retrieval).
    """
    if cfg.llm_disabled:
        return RunnableLambda(
            lambda inp: (
                "General medical mode is unavailable while budget mode is enabled. "
                "Ask about uploaded reports, or disable MEDSYNC_LLM_DISABLED."
            )
        )

    llm = ChatOpenAI(
        model=cfg.chat_model,
        temperature=cfg.temperature,
        max_tokens=cfg.max_conversational_tokens,
    )

    return RunnableLambda(_general_medical_messages) | llm | StrOutputParser()


def _retrieve_rag_documents(
    cfg: MedSyncConfig,
    question: str,
    *,
    k: int = 5,
    history: list[dict] | None = None,
) -> list[Document]:
    """Hybrid retrieve + rerank for report-grounded answers."""
    final_k = max(5, k)
    candidate_k = max(20, final_k)
    vs = get_vectorstore(cfg)
    metadata_filter = _build_metadata_filter(cfg, question, history=history)
    retriever = _build_hybrid_retriever(
        vs, candidate_k=candidate_k, metadata_filter=metadata_filter
    )
    retrieval_query = _build_hyde_query(cfg, question, history=history)
    candidates = retriever.invoke(retrieval_query)
    return _rerank_documents(question, candidates, top_n=final_k)


def _sanitize_faithfulness_verdict(parsed: dict) -> dict:
    """Normalizes verifier JSON into a stable shape for API/UI."""
    unsupported_raw = parsed.get("unsupported_claims")
    unsupported: list[str] = []
    if isinstance(unsupported_raw, list):
        unsupported = [str(x).strip() for x in unsupported_raw if str(x).strip()]

    conf = parsed.get("confidence")
    confidence: float | None = None
    if isinstance(conf, (int, float)):
        confidence = max(0.0, min(1.0, float(conf)))

    all_supported = parsed.get("all_supported")
    if not isinstance(all_supported, bool):
        all_supported = len(unsupported) == 0

    return {
        "confidence": confidence,
        "unsupported_claims": unsupported,
        "all_supported": all_supported,
        "notes": str(parsed.get("notes") or "").strip(),
        "verification_failed": False,
    }


def _verify_answer_faithfulness(
    cfg: MedSyncConfig,
    question: str,
    context: str,
    answer: str,
) -> dict | None:
    """
    Second-pass LLM: compare assistant answer to retrieved context only.
    For batch/offline metrics, consider RAGAS faithfulness scores on logged (q, ctx, answer) tuples.
    """
    if cfg.faithfulness_disabled or cfg.llm_disabled:
        return None
    try:
        require_openai_key()
    except RuntimeError:
        return {
            "verification_failed": True,
            "confidence": None,
            "unsupported_claims": [],
            "all_supported": False,
            "notes": "OPENAI_API_KEY missing",
        }

    ctx = (context or "")[:14000]
    ans = (answer or "").strip()
    if not ans:
        return None
    q = (question or "").strip()[:4000]

    try:
        verifier = ChatOpenAI(model=cfg.chat_model, temperature=0, max_tokens=900)
        system = SystemMessage(
            content=(
                "You verify assistant answers against ONLY the RETRIEVED CONTEXT. "
                "No outside medical knowledge.\n"
                "Tasks:\n"
                "1. List factual claims in the ASSISTANT ANSWER about this patient "
                "(diagnoses, medications, doses, lab values, dates, names, instructions).\n"
                "2. A claim is supported only if the context states it or is a direct paraphrase "
                "without new numbers or details.\n"
                "3. Educational generalities not framed as this patient's facts are not claims.\n"
                "4. If the answer refuses or says context is insufficient, unsupported_claims may be empty.\n"
                "Return ONLY JSON: "
                '{"confidence": number 0-1, "all_supported": boolean, '
                '"unsupported_claims": string[], "notes": string}'
            )
        )
        human = HumanMessage(
            content=(
                f"USER QUESTION:\n{q}\n\nRETRIEVED CONTEXT:\n{ctx}\n\nASSISTANT ANSWER:\n{ans}"
            )
        )
        raw = verifier.invoke([system, human]).content
        if not isinstance(raw, str):
            raw = str(raw)
        parsed = _extract_json_object(raw)
        if not parsed:
            return {
                "verification_failed": True,
                "confidence": None,
                "unsupported_claims": [],
                "all_supported": False,
                "notes": "Verifier returned non-JSON",
            }
        return _sanitize_faithfulness_verdict(parsed)
    except Exception:
        logger.warning("Faithfulness verification failed.", exc_info=True)
        return {
            "verification_failed": True,
            "confidence": None,
            "unsupported_claims": [],
            "all_supported": False,
            "notes": "Verifier error",
        }


def faithfulness_footer_for_history(verdict: dict | None) -> str:
    """Short markdown block appended to assistant text for session logs (optional)."""
    if verdict is None:
        return ""
    if verdict.get("verification_failed"):
        return (
            "\n\n---\n**Source check:** Verification did not complete; confirm facts against originals."
        )
    lines = [
        "\n\n---\n**Source check** (automated; not a substitute for clinical review)",
    ]
    conf = verdict.get("confidence")
    if isinstance(conf, float):
        lines.append(f"- Faithfulness to retrieved reports: **{conf:.0%}**")
    unsupported = verdict.get("unsupported_claims") or []
    if unsupported:
        lines.append("- **Not clearly supported by retrieved context:**")
        for c in unsupported[:12]:
            lines.append(f"  - {c}")
    else:
        lines.append("- No unsupported patient-specific claims flagged.")
    notes = (verdict.get("notes") or "").strip()
    if notes:
        lines.append(f"- Notes: {notes}")
    return "\n".join(lines)


def answer_question(
    cfg: MedSyncConfig,
    question: str,
    *,
    k: int = 5,
    history: list[dict] | None = None,
    skip_faithfulness: bool = False,
) -> str:
    """Routes question to conversational, general-medical, or medical-RAG chain."""
    if not question or not question.strip():
        return "Please ask a question."

    intent = _classify_intent(cfg, question, history=history)
    if intent == "CONVERSATIONAL":
        conv_chain = build_conversational_chain(cfg)
        return conv_chain.invoke({"question": question, "history": history or []})
    if intent == "GENERAL_MEDICAL":
        general_chain = build_general_medical_chain(cfg)
        return general_chain.invoke({"question": question, "history": history or []})

    docs = _retrieve_rag_documents(cfg, question, k=k, history=history)
    if not docs:
        return (
            "I could not locate any uploaded report content related to your question. "
            "Please make sure your report is uploaded and indexed, then try again."
        )
    chain = build_medical_answer_chain(cfg)
    answer = chain.invoke({"question": question, "docs": docs, "history": history or []})

    if (
        skip_faithfulness
        or cfg.llm_disabled
        or cfg.faithfulness_disabled
    ):
        return _clean_response_formatting(answer)

    context = _format_context(docs)
    verdict = _verify_answer_faithfulness(cfg, question, context, answer)
    footer = faithfulness_footer_for_history(verdict)
    final_answer = answer + footer if footer else answer
    return _clean_response_formatting(final_answer)


def iter_chat_stream_events(
    cfg: MedSyncConfig,
    question: str,
    *,
    k: int = 5,
    history: list[dict] | None = None,
    skip_faithfulness: bool = False,
) -> Iterator[dict]:
    """
    Yields {"event": "token", "text": str} for streamed output, and after report-grounded
    LLM answers optionally {"event": "faithfulness", "payload": dict}.
    """
    if not question or not question.strip():
        yield {"event": "token", "text": "Please ask a question."}
        return

    intent = _classify_intent(cfg, question, history=history)
    hist = history or []

    if intent == "CONVERSATIONAL":
        if cfg.llm_disabled:
            yield {
                "event": "token",
                "text": (
                    "Hi! I can chat normally and also help with your uploaded medical reports. "
                    "Ask me anything, or ask report-specific questions like medications, diagnosis, or dates."
                ),
            }
            return
        llm = ChatOpenAI(
            model=cfg.chat_model,
            temperature=cfg.temperature,
            max_tokens=cfg.max_conversational_tokens,
            streaming=True,
        )
        for t in _iter_llm_stream_tokens(
            llm, _conversational_messages({"question": question, "history": hist})
        ):
            yield {"event": "token", "text": t}
        return

    if intent == "GENERAL_MEDICAL":
        if cfg.llm_disabled:
            yield {
                "event": "token",
                "text": (
                    "General medical mode is unavailable while budget mode is enabled. "
                    "Ask about uploaded reports, or disable MEDSYNC_LLM_DISABLED."
                ),
            }
            return
        llm = ChatOpenAI(
            model=cfg.chat_model,
            temperature=cfg.temperature,
            max_tokens=cfg.max_conversational_tokens,
            streaming=True,
        )
        for t in _iter_llm_stream_tokens(
            llm, _general_medical_messages({"question": question, "history": hist})
        ):
            yield {"event": "token", "text": t}
        return

    docs = _retrieve_rag_documents(cfg, question, k=k, history=history)
    if not docs:
        yield {
            "event": "token",
            "text": (
                "I could not locate any uploaded report content related to your question. "
                "Please make sure your report is uploaded and indexed, then try again."
            ),
        }
        return
    inp = {"question": question, "docs": docs, "history": hist}

    if cfg.llm_disabled:
        if not docs:
            yield {
                "event": "token",
                "text": "No relevant documents found. Please upload a medical report first.",
            }
        else:
            context = _format_context(docs)
            yield {
                "event": "token",
                "text": (
                    "Budget mode is enabled (no AI generation).\n\n"
                    f"Relevant context:\n{context}"
                ),
            }
        return

    context = _format_context(docs)
    llm = ChatOpenAI(
        model=cfg.chat_model,
        temperature=cfg.temperature,
        max_tokens=cfg.max_medical_rag_tokens,
        streaming=True,
    )
    pieces: list[str] = []
    for t in _iter_llm_stream_tokens(llm, _medical_rag_messages(inp)):
        pieces.append(t)
        yield {"event": "token", "text": t}

    if skip_faithfulness or cfg.faithfulness_disabled:
        return

    full = "".join(pieces)
    verdict = _verify_answer_faithfulness(cfg, question, context, full)
    if verdict is not None:
        yield {"event": "faithfulness", "payload": verdict}


def stream_answer_question(
    cfg: MedSyncConfig,
    question: str,
    *,
    k: int = 5,
    history: list[dict] | None = None,
    skip_faithfulness: bool = False,
) -> Iterator[str]:
    """
    Token stream only (no faithfulness events). Prefer iter_chat_stream_events for /chat/stream.
    """
    for evt in iter_chat_stream_events(
        cfg, question, k=k, history=history, skip_faithfulness=skip_faithfulness
    ):
        if evt.get("event") == "token":
            yield evt.get("text") or ""


def delete_document_by_filename(cfg: MedSyncConfig, filename: str) -> dict:
    """
    Deletes all vector chunks associated with a specific source filename from the vectorstore.
    """
    try:
        _ensure_persist_directory(cfg)
        vs = get_vectorstore(cfg)
        
        # Delete all documents with this source in metadata
        vs._collection.delete(where={"source": {"$eq": filename}})
        
        logger.info(f"Deleted vector chunks for {filename}")
        return {"message": f"Deleted {filename} from vector database"}
    except Exception as e:
        logger.exception(f"Failed to delete {filename} from vectorstore")
        return {"error": str(e)}


def clear_all_data(cfg: MedSyncConfig) -> dict:
    """
    Clears both vectorstore and uploaded files.
    """
    _ensure_persist_directory(cfg)
    vs = get_vectorstore(cfg)

    # Best-effort wipe of the collection. Chroma supports delete with no filter in most builds;
    # fall back to removing the persisted directory if needed.
    try:
        vs._collection.delete(where={})
    except Exception:
        logger.warning("Vector collection delete failed; removing persisted directory.", exc_info=True)
        persist = Path(cfg.persist_dir)
        if persist.exists():
            _set_path_writable(persist)
            for child in persist.iterdir():
                _set_path_writable(child)
                if child.is_file():
                    child.unlink()
                else:
                    shutil.rmtree(child)

    upload_dir = Path(cfg.uploads_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    removed = 0
    for f in upload_dir.iterdir():
        if f.is_file():
            f.unlink()
            removed += 1

    return {"message": "Clear successful", "deleted_uploads": removed}

