"""FastAPI backend entrypoint for the MedSync application.

Responsibilities:
- Authenticates every request with the caller's Supabase access token.
- Ingests reports the browser uploaded to Supabase Storage.
- Answers chat questions (plain JSON or Server-Sent Events).
- Lists/deletes reports and manages vitals, always scoped to the current user.

The app is stateless (no local files), so it runs on serverless platforms such as Vercel.
"""

import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

# Load .env before anything reads configuration. Real environment variables win.
load_dotenv(override=False)

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, model_validator
from starlette.concurrency import run_in_threadpool

import medsync_store as store
from medsync_auth import AuthUser, get_current_user, get_supabase
from medsync_rag import (
    ALLOWED_EXTENSIONS,
    answer_question,
    ingest_report,
    iter_chat_stream_events,
    load_config,
)

logging.basicConfig(
    level=(os.getenv("LOG_LEVEL", "INFO") or "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("medsync.api")

SUPABASE_TABLE_VITALS = "vitals"


def _validate_required_env_vars() -> None:
    """Fails fast at startup if a required environment variable is missing."""
    required_vars = {
        "OPENAI_API_KEY": "OpenAI API key for LLM completions and embeddings",
        "SUPABASE_URL": "Supabase project URL",
        "SUPABASE_SERVICE_ROLE_KEY": "Supabase service role key (server-side only)",
    }
    missing = [
        f"  • {name}: {description}"
        for name, description in required_vars.items()
        if not (os.getenv(name) or "").strip()
    ]
    if missing:
        error_msg = (
            "\n❌ STARTUP FAILED: Missing required environment variables.\n"
            + "\n".join(missing)
            + "\n\nSet them in the Vercel project settings, or in .env for local development."
        )
        logger.critical(error_msg)
        raise RuntimeError(error_msg)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_required_env_vars()
    yield


app = FastAPI(lifespan=lifespan)


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS") or "http://localhost:3000"
    return [o.strip() for o in raw.split(",") if o.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


def _error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status_code)


# --- Health ---------------------------------------------------------------------

@app.get("/")
def read_root():
    """Simple API health/status endpoint."""
    return {"status": "MedSync-RAG API is Online"}


# --- Reports --------------------------------------------------------------------

class IngestRequest(BaseModel):
    storage_path: str = Field(min_length=1, max_length=512)
    filename: str = Field(min_length=1, max_length=255)


@app.post("/reports/ingest")
async def ingest(request: IngestRequest, user: AuthUser = Depends(get_current_user)):
    """Extracts, embeds and indexes a report the user already uploaded to Storage."""
    filename = Path(request.filename.replace("\\", "/")).name.strip()
    if not filename or not filename.lower().endswith(ALLOWED_EXTENSIONS):
        return _error(400, f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    try:
        storage_path = store.assert_owned_path(user.id, request.storage_path)
    except ValueError:
        return _error(400, "Invalid storage path.")

    try:
        return await run_in_threadpool(
            ingest_report,
            load_config(),
            user.id,
            filename=filename,
            storage_path=storage_path,
        )
    except ValueError as e:
        logger.warning("Ingest rejected: %s", e)
        return _error(400, str(e))
    except Exception:
        logger.exception("Ingest failed")
        return _error(500, "Report processing failed. Please try again.")


@app.get("/reports")
async def list_reports(user: AuthUser = Depends(get_current_user)):
    """Lists the user's reports with short-lived signed URLs for preview."""

    def _run() -> list[dict]:
        reports = store.list_reports(user.id)
        for report in reports:
            path = report.pop("storage_path", None)
            try:
                report["url"] = store.signed_url(path) if path else None
            except Exception:
                logger.warning("Could not sign URL for report %s", report.get("id"), exc_info=True)
                report["url"] = None
        return reports

    try:
        return {"reports": await run_in_threadpool(_run)}
    except Exception:
        logger.exception("List reports failed")
        return _error(500, "Could not load reports.")


@app.get("/reports/latest")
async def latest_report(user: AuthUser = Depends(get_current_user)):
    """Structured JSON of the user's most recent successfully processed report."""
    try:
        report = await run_in_threadpool(store.latest_report, user.id)
    except Exception:
        logger.exception("Latest report failed")
        return JSONResponse(
            {"error": "Could not load the latest report.", "structured_report": None},
            status_code=500,
        )
    if report is None:
        return JSONResponse(
            {"error": "No reports uploaded yet.", "structured_report": None},
            status_code=404,
        )
    return {
        "report_id": report["id"],
        "file": report["filename"],
        "created_at": report["created_at"],
        "structured_report": report["structured_report"],
    }


@app.delete("/reports/{report_id}")
async def delete_report(report_id: str, user: AuthUser = Depends(get_current_user)):
    """Deletes one report: stored file, chunks, and linked medication reminders."""
    try:
        result = await run_in_threadpool(store.delete_report, user.id, report_id)
    except Exception:
        logger.exception("Delete report failed")
        return _error(500, "Could not delete the report.")
    if result is None:
        return _error(404, "Report not found.")
    return result


@app.delete("/reports")
async def delete_all_reports(user: AuthUser = Depends(get_current_user)):
    """Deletes every report of the current user."""
    try:
        return await run_in_threadpool(store.delete_all_for_user, user.id)
    except Exception:
        logger.exception("Delete all reports failed")
        return _error(500, "Could not delete reports.")


# --- Account ------------------------------------------------------------------------

@app.delete("/account")
async def delete_account(user: AuthUser = Depends(get_current_user)):
    """
    Permanently deletes the user: reports, chunks, stored files, vitals, reminders and
    settings first, then the auth user. If data removal fails, the
    account is kept so the user can retry instead of leaving orphaned medical data.
    """

    def _run() -> dict:
        result = store.delete_all_for_user(user.id)
        store.delete_user_storage(user.id)
        store.delete_user_rows(user.id)
        get_supabase().auth.admin.delete_user(user.id)
        return result

    try:
        result = await run_in_threadpool(_run)
    except Exception:
        logger.exception("Account deletion failed")
        return _error(500, "Could not delete your account. Please try again.")
    return {"message": "Account deleted", **result}


# --- Chat -----------------------------------------------------------------------

class HistoryTurn(BaseModel):
    user: str | None = Field(default=None, max_length=12_000)
    assistant: str | None = Field(default=None, max_length=12_000)


class ChatRequest(BaseModel):
    """Request payload schema for the chat endpoints (sizes capped to bound LLM cost)."""

    question: str = Field(default="", max_length=4000)
    session_id: str | None = Field(default=None, max_length=200)
    history: list[HistoryTurn] | None = Field(default=None, max_length=20)
    skip_faithfulness: bool = False

    def history_dicts(self) -> list[dict]:
        return [turn.model_dump() for turn in self.history or []]


@app.post("/chat")
async def chat_with_report(request: ChatRequest, user: AuthUser = Depends(get_current_user)):
    """Answers user questions via retrieval + conversational routing pipeline."""
    session_id = (request.session_id or "default").strip() or "default"
    try:
        result = await run_in_threadpool(
            answer_question,
            load_config(),
            user.id,
            request.question,
            k=5,
            history=request.history_dicts(),
            skip_faithfulness=request.skip_faithfulness,
        )
    except Exception:
        logger.exception("Chat error")
        return _error(500, "Could not generate an answer. Please try again.")
    return {**result, "session_id": session_id}


def _sse(payload) -> str:
    data = payload if isinstance(payload, str) else json.dumps(payload)
    return f"data: {data}\n\n"


@app.post("/chat/stream")
def chat_with_report_stream(request: ChatRequest, user: AuthUser = Depends(get_current_user)):
    """Same routing as /chat; streams events as Server-Sent Events (SSE).

    Events: {"t": token}, {"sources": [...]}, {"faithfulness": {...}}, {"error": msg}, then [DONE].
    """
    cfg = load_config()
    history = request.history_dicts()

    def event_stream():
        try:
            for evt in iter_chat_stream_events(
                cfg,
                user.id,
                request.question,
                k=5,
                history=history,
                skip_faithfulness=request.skip_faithfulness,
            ):
                kind = evt.get("event")
                if kind == "token":
                    yield _sse({"t": evt.get("text") or ""})
                elif kind == "sources":
                    yield _sse({"sources": evt.get("sources") or []})
                elif kind == "faithfulness" and isinstance(evt.get("payload"), dict):
                    yield _sse({"faithfulness": evt["payload"]})
        except Exception:
            logger.exception("Stream chat error")
            yield _sse({"error": "Could not generate an answer. Please try again."})
        yield _sse("[DONE]")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- Vitals ---------------------------------------------------------------------

def _sb_list_vitals(user_id: str) -> list[dict]:
    res = (
        get_supabase()
        .table(SUPABASE_TABLE_VITALS)
        .select("id, heart_rate, sleep_quality, daily_steps, date, timestamp")
        .eq("user_id", user_id)
        .order("timestamp", desc=True)
        .execute()
    )
    return res.data or []


def _sb_insert_vital(row: dict) -> dict:
    res = get_supabase().table(SUPABASE_TABLE_VITALS).insert(row).execute()
    data = res.data or []
    return data[0] if data else row


def _sb_delete_vital(user_id: str, vital_id: str) -> bool:
    res = (
        get_supabase()
        .table(SUPABASE_TABLE_VITALS)
        .delete()
        .eq("user_id", user_id)
        .eq("id", vital_id)
        .execute()
    )
    return len(res.data or []) > 0


class VitalLogRequest(BaseModel):
    heart_rate: int | None = Field(default=None, ge=20, le=250)
    sleep_quality: float | None = Field(default=None, ge=0, le=24)
    daily_steps: int | None = Field(default=None, ge=0, le=200_000)

    @model_validator(mode="after")
    def _at_least_one(self):
        if self.heart_rate is None and self.sleep_quality is None and self.daily_steps is None:
            raise ValueError("Provide at least one vital measurement.")
        return self


@app.get("/vitals")
async def get_vitals(user: AuthUser = Depends(get_current_user)):
    """Returns the user's logged vitals in reverse chronological order."""
    try:
        return {"logs": await run_in_threadpool(_sb_list_vitals, user.id)}
    except Exception:
        logger.exception("Vitals list error")
        return JSONResponse({"error": "Could not load vitals.", "logs": []}, status_code=500)


@app.post("/vitals")
async def log_vital(request: VitalLogRequest, user: AuthUser = Depends(get_current_user)):
    """Logs a new vital entry for the user."""
    now = datetime.now(UTC)
    new_log = {
        "id": str(uuid.uuid4()),
        "user_id": user.id,
        "heart_rate": request.heart_rate,
        "sleep_quality": request.sleep_quality,
        "daily_steps": request.daily_steps,
        "date": now.strftime("%Y-%m-%d"),
        "timestamp": int(now.timestamp() * 1000),
    }
    try:
        return await run_in_threadpool(_sb_insert_vital, new_log)
    except Exception:
        logger.exception("Vitals insert error")
        return _error(500, "Could not save the vital log.")


@app.delete("/vitals/{vital_id}")
async def delete_vital(vital_id: str, user: AuthUser = Depends(get_current_user)):
    """Deletes one of the user's vital log entries."""
    try:
        deleted = await run_in_threadpool(_sb_delete_vital, user.id, vital_id)
    except Exception:
        logger.exception("Vitals delete error")
        return _error(500, "Could not delete the vital log.")
    if not deleted:
        return _error(404, "Vital log not found.")
    return {"message": "Vital log deleted"}
