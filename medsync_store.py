"""Supabase data access for MedSync.

All persistent state lives here so the API can run on stateless serverless
functions:
- Storage bucket `reports`: original uploads at "<user_id>/<file>"
- Table `reports`: one row per upload, incl. cached structured extraction
- Table `report_chunks`: embedded chunks, searched via `match_report_chunks`

Every function takes the owning `user_id` and filters by it, because the
service-role client bypasses Row Level Security. Functions are synchronous;
async callers should wrap them in `run_in_threadpool`.
"""

import logging

from langchain_core.documents import Document

from medsync_auth import get_supabase

logger = logging.getLogger("medsync.store")

BUCKET = "reports"
TABLE_REPORTS = "reports"
TABLE_CHUNKS = "report_chunks"
TABLE_REMINDERS = "medication_reminders"

_REPORT_COLUMNS = "id, user_id, filename, storage_path, sha256, structured_report, status, error, created_at"
_INSERT_BATCH = 100


# --- Storage -----------------------------------------------------------------

def assert_owned_path(user_id: str, storage_path: str) -> str:
    """Returns the normalised path if it is a file inside the user's folder, else ValueError."""
    path = (storage_path or "").strip()
    parts = path.split("/")
    if (
        "\\" in path
        or len(parts) < 2
        or parts[0] != user_id
        or any(p in ("", ".", "..") for p in parts[1:])
    ):
        raise ValueError("Invalid storage path.")
    return path


def download_report(storage_path: str) -> bytes:
    return get_supabase().storage.from_(BUCKET).download(storage_path)


def signed_url(storage_path: str, expires_in: int = 3600) -> str | None:
    res = get_supabase().storage.from_(BUCKET).create_signed_url(storage_path, expires_in)
    return res.get("signedURL") or res.get("signedUrl")


# --- Reports -----------------------------------------------------------------

def upsert_report(user_id: str, filename: str, storage_path: str, sha256: str) -> dict:
    """Creates (or resets) the report row for a user's filename, status `pending`."""
    row = {
        "user_id": user_id,
        "filename": filename,
        "storage_path": storage_path,
        "sha256": sha256,
        "status": "pending",
        "error": None,
    }
    res = (
        get_supabase()
        .table(TABLE_REPORTS)
        .upsert(row, on_conflict="user_id,filename")
        .execute()
    )
    return (res.data or [row])[0]


def get_report_by_sha(user_id: str, sha256: str) -> dict | None:
    """Most recent successfully extracted report with identical content (extraction cache)."""
    res = (
        get_supabase()
        .table(TABLE_REPORTS)
        .select(_REPORT_COLUMNS)
        .eq("user_id", user_id)
        .eq("sha256", sha256)
        .eq("status", "ready")
        .not_.is_("structured_report", "null")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return (res.data or [None])[0]


def set_report_result(
    report_id: str,
    *,
    status: str,
    structured_report: dict | None = None,
    error: str | None = None,
) -> None:
    update: dict = {"status": status, "error": error}
    if structured_report is not None:
        update["structured_report"] = structured_report
    get_supabase().table(TABLE_REPORTS).update(update).eq("id", report_id).execute()


def list_reports(user_id: str) -> list[dict]:
    res = (
        get_supabase()
        .table(TABLE_REPORTS)
        .select("id, filename, storage_path, status, error, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def get_report(user_id: str, report_id: str) -> dict | None:
    res = (
        get_supabase()
        .table(TABLE_REPORTS)
        .select(_REPORT_COLUMNS)
        .eq("user_id", user_id)
        .eq("id", report_id)
        .limit(1)
        .execute()
    )
    return (res.data or [None])[0]


def latest_report(user_id: str) -> dict | None:
    res = (
        get_supabase()
        .table(TABLE_REPORTS)
        .select(_REPORT_COLUMNS)
        .eq("user_id", user_id)
        .eq("status", "ready")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return (res.data or [None])[0]


# --- Chunks ------------------------------------------------------------------

def replace_chunks(
    user_id: str,
    report_id: str,
    chunks: list[tuple[str, dict]],
    embeddings: list[list[float]],
) -> int:
    """Replaces all chunks of a report with the given (content, metadata) + embeddings."""
    if len(chunks) != len(embeddings):
        raise ValueError("chunks and embeddings must have the same length")

    sb = get_supabase()
    sb.table(TABLE_CHUNKS).delete().eq("user_id", user_id).eq("report_id", report_id).execute()

    rows = [
        {
            "report_id": report_id,
            "user_id": user_id,
            "chunk_index": i,
            "content": content,
            "metadata": metadata,
            "embedding": embedding,
        }
        for i, ((content, metadata), embedding) in enumerate(zip(chunks, embeddings))
    ]
    for start in range(0, len(rows), _INSERT_BATCH):
        sb.table(TABLE_CHUNKS).insert(rows[start : start + _INSERT_BATCH]).execute()
    return len(rows)


def match_chunks(
    user_id: str,
    query_embedding: list[float],
    *,
    k: int,
    metadata_filter: dict | None = None,
) -> list[Document]:
    """Top-k chunks for the user by cosine similarity, optionally filtered by metadata equality."""
    res = (
        get_supabase()
        .rpc(
            "match_report_chunks",
            {
                "query_embedding": query_embedding,
                "match_count": k,
                "p_user_id": user_id,
                "p_filter": metadata_filter or {},
            },
        )
        .execute()
    )
    docs: list[Document] = []
    for row in res.data or []:
        metadata = dict(row.get("metadata") or {})
        metadata["report_id"] = row.get("report_id")
        metadata["similarity"] = row.get("similarity")
        docs.append(Document(page_content=row.get("content") or "", metadata=metadata))
    return docs


# --- Deletion ----------------------------------------------------------------

def _delete_reminders(user_id: str, filenames: list[str]) -> int:
    """Removes medication reminders that point at deleted reports (table is optional)."""
    if not filenames:
        return 0
    try:
        res = (
            get_supabase()
            .table(TABLE_REMINDERS)
            .delete()
            .eq("user_id", user_id)
            .in_("report_file", filenames)
            .execute()
        )
        return len(res.data or [])
    except Exception:
        logger.warning("Medication reminder cleanup failed", exc_info=True)
        return 0


def _remove_objects(paths: list[str]) -> None:
    if not paths:
        return
    try:
        get_supabase().storage.from_(BUCKET).remove(paths)
    except Exception:
        logger.warning("Storage object removal failed for %d objects", len(paths), exc_info=True)


def delete_report(user_id: str, report_id: str) -> dict | None:
    """Deletes one report (object, row, chunks via cascade, reminders). None if not found."""
    report = get_report(user_id, report_id)
    if report is None:
        return None

    _remove_objects([report["storage_path"]])
    get_supabase().table(TABLE_REPORTS).delete().eq("user_id", user_id).eq("id", report_id).execute()
    reminders = _delete_reminders(user_id, [report["filename"]])
    return {"deleted": report["filename"], "medication_reminders_cleaned": reminders}


def delete_all_for_user(user_id: str) -> dict:
    """Deletes every report, chunk, stored file and report-linked reminder of the user."""
    reports = list_reports(user_id)
    _remove_objects([r["storage_path"] for r in reports])
    get_supabase().table(TABLE_REPORTS).delete().eq("user_id", user_id).execute()
    reminders = _delete_reminders(user_id, [r["filename"] for r in reports])
    return {"deleted_reports": len(reports), "medication_reminders_cleaned": reminders}
