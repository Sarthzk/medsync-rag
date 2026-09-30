import json

import pytest
from langchain_core.documents import Document

import medsync_rag as rag

USER = "11111111-1111-1111-1111-111111111111"


class FakeEmbeddings:
    def __init__(self):
        self.documents: list[str] = []
        self.queries: list[str] = []

    def embed_documents(self, texts):
        self.documents.extend(texts)
        return [[float(i)] * 3 for i in range(len(texts))]

    def embed_query(self, text):
        self.queries.append(text)
        return [0.5, 0.5, 0.5]


class FakeStore:
    """In-memory stand-in for medsync_store used by the RAG pipeline."""

    def __init__(self, cached_report=None, match_results=None):
        self.cached_report = cached_report
        self.match_results = list(match_results or [])
        self.upserts = []
        self.results = []
        self.replaced = None
        self.match_calls = []

    def download_report(self, storage_path):
        return b"image-bytes"

    def get_report_by_filename(self, user_id, filename):
        return None

    def remove_objects(self, paths):
        pass

    def upsert_report(self, user_id, filename, storage_path, sha256):
        self.upserts.append((user_id, filename, storage_path, sha256))
        return {"id": "rep-1", "filename": filename, "storage_path": storage_path, "sha256": sha256}

    def get_report_by_sha(self, user_id, sha256):
        return self.cached_report

    def set_report_result(self, report_id, *, status, structured_report=None, error=None):
        self.results.append((report_id, status, structured_report, error))

    def replace_chunks(self, user_id, report_id, chunks, embeddings):
        self.replaced = (user_id, report_id, chunks, embeddings)
        return len(chunks)

    def match_chunks(self, user_id, query_embedding, *, k, metadata_filter=None):
        self.match_calls.append((user_id, k, metadata_filter))
        return self.match_results.pop(0) if self.match_results else []


STRUCTURED = {
    "patient_name": "Asha Rao",
    "report_date": "2026-03-01",
    "report_type": "CBC",
    "diagnoses": ["Mild anemia"],
    "medications": ["Ferrous sulfate 325mg"],
    "lab_results": [
        {"name": "Hemoglobin", "value": "10.9", "unit": "g/dL", "reference_range": "12-15", "flag": "L"}
    ],
    "doctor_notes": "Recheck in 6 weeks.",
    "raw_text": "",
}


@pytest.fixture
def cfg():
    return rag.MedSyncConfig()


@pytest.fixture
def embeddings(monkeypatch):
    fake = FakeEmbeddings()
    monkeypatch.setattr(rag, "_embeddings", lambda cfg: fake)
    return fake


# --- ingestion -----------------------------------------------------------------

def test_ingest_report_extracts_embeds_and_marks_ready(monkeypatch, cfg, embeddings):
    store = FakeStore()
    monkeypatch.setattr(rag, "store", store)
    calls = []

    def fake_extract(cfg_, data, filename):
        calls.append((data, filename))
        return dict(STRUCTURED)

    monkeypatch.setattr(rag, "_extract_structured_report_from_document", fake_extract)

    result = rag.ingest_report(cfg, USER, filename="scan.png", storage_path=f"{USER}/1-scan.png")

    assert calls == [(b"image-bytes", "scan.png")]
    assert store.upserts[0][:3] == (USER, "scan.png", f"{USER}/1-scan.png")
    user_id, report_id, chunks, vectors = store.replaced
    assert (user_id, report_id) == (USER, "rep-1")
    assert chunks and len(chunks) == len(vectors)
    content, metadata = chunks[0]
    assert "Mild anemia" in "".join(c for c, _ in chunks)
    assert metadata["source"] == "scan.png"
    assert metadata["report_type_norm"] == "cbc"
    assert store.results[-1][:2] == ("rep-1", "ready")
    assert store.results[-1][2]["patient_name"] == "Asha Rao"
    assert result["status"] == "ready"
    assert result["report_id"] == "rep-1"
    assert result["chunks"] == len(chunks)


def test_ingest_report_reuses_cached_extraction(monkeypatch, cfg, embeddings):
    store = FakeStore(cached_report={"structured_report": dict(STRUCTURED)})
    monkeypatch.setattr(rag, "store", store)

    def boom(*args, **kwargs):
        raise AssertionError("extraction must not run on cache hit")

    monkeypatch.setattr(rag, "_extract_structured_report_from_document", boom)

    result = rag.ingest_report(cfg, USER, filename="scan.png", storage_path=f"{USER}/1-scan.png")

    assert result["status"] == "ready"
    assert store.replaced is not None


def test_ingest_report_marks_failed_and_reraises(monkeypatch, cfg, embeddings):
    store = FakeStore()
    monkeypatch.setattr(rag, "store", store)

    def fail(*args, **kwargs):
        raise ValueError("Uploaded file scan.png is not a valid image.")

    monkeypatch.setattr(rag, "_extract_structured_report_from_document", fail)

    with pytest.raises(ValueError):
        rag.ingest_report(cfg, USER, filename="scan.png", storage_path=f"{USER}/1-scan.png")

    report_id, status, _, error = store.results[-1]
    assert (report_id, status) == ("rep-1", "failed")
    assert "not a valid image" in error


# --- retrieval -------------------------------------------------------------------

def test_retrieve_falls_back_to_unfiltered_search(monkeypatch, cfg, embeddings):
    doc = Document(page_content="Hemoglobin 10.9", metadata={"source": "scan.png"})
    store = FakeStore(match_results=[[], [doc]])
    monkeypatch.setattr(rag, "store", store)
    monkeypatch.setattr(rag, "_build_metadata_filter", lambda *a, **k: {"report_type_norm": "lipid"})
    monkeypatch.setattr(rag, "_build_hyde_query", lambda cfg_, q, history=None: "hyde text")
    monkeypatch.delenv("COHERE_API_KEY", raising=False)

    docs = rag._retrieve_rag_documents(cfg, USER, "what is my hemoglobin?", k=5)

    assert docs == [doc]
    assert embeddings.queries == ["hyde text"]
    assert [c[2] for c in store.match_calls] == [{"report_type_norm": "lipid"}, None]
    assert all(c[0] == USER for c in store.match_calls)


def test_extract_sources_is_unique_and_sorted():
    docs = [
        Document(page_content="a", metadata={"source": "b.pdf"}),
        Document(page_content="b", metadata={"source": "a.pdf"}),
        Document(page_content="c", metadata={"source": "b.pdf"}),
        Document(page_content="d", metadata={}),
    ]
    assert rag.extract_sources(docs) == ["a.pdf", "b.pdf"]


# --- metadata filter ---------------------------------------------------------------

class _FakeLLM:
    def __init__(self, content):
        self._content = content

    def invoke(self, messages):
        return type("Msg", (), {"content": self._content})()


def test_metadata_filter_accepts_fenced_json_and_flattens(monkeypatch, cfg):
    raw = "```json\n" + json.dumps(
        {
            "patient_name": "Asha  Rao",
            "report_type": "CBC",
            "date_scope": "exact_month",
            "report_year_month": "2026-03",
            "report_date": "",
        }
    ) + "\n```"
    monkeypatch.setattr(rag, "ChatOpenAI", lambda **kwargs: _FakeLLM(raw))

    result = rag._build_metadata_filter(cfg, "my CBC from March 2026")

    assert result == {
        "patient_name_norm": "asha rao",
        "report_type_norm": "cbc",
        "report_year_month": "2026-03",
    }


def test_metadata_filter_none_when_nothing_extracted(monkeypatch, cfg):
    raw = json.dumps({"patient_name": "", "report_type": "", "date_scope": "none"})
    monkeypatch.setattr(rag, "ChatOpenAI", lambda **kwargs: _FakeLLM(raw))
    assert rag._build_metadata_filter(cfg, "hello") is None


# --- pure helpers ----------------------------------------------------------------------

def test_extract_json_object_handles_code_fence():
    assert rag._extract_json_object('```json\n{"a": 1}\n```') == {"a": 1}


@pytest.mark.parametrize(
    "raw, expected",
    [("2026-03-01", "2026-03-01"), ("01/03/2026", "2026-03-01"), ("1 Mar 2026", "2026-03-01"), ("garbage", "")],
)
def test_normalize_report_date(raw, expected):
    assert rag._normalize_report_date(raw) == expected


def test_is_text_dense_pdf():
    assert rag._is_text_dense_pdf("Hemoglobin 13.2 g/dL " * 10, 1) is True
    assert rag._is_text_dense_pdf("  \n ", 3) is False
    assert rag._is_text_dense_pdf("anything", 0) is False


def test_structured_report_markdown_contains_sections():
    md = rag._structured_report_to_markdown(STRUCTURED, source="scan.png")
    assert md.startswith("# Medical report (scan.png)")
    for part in ("Asha Rao", "## Diagnoses", "Mild anemia", "## Medications", "| Hemoglobin | 10.9 |", "Recheck"):
        assert part in md


# --- latency: retrieval prep runs concurrently with classification ------------------

def _slow(value, delay=0.3):
    import time

    def fn(*args, **kwargs):
        time.sleep(delay)
        return value

    return fn


def test_answer_question_overlaps_classifier_filter_and_hyde(monkeypatch, cfg, embeddings):
    import time

    doc = Document(page_content="LDL 162 mg/dL", metadata={"source": "lipid.pdf"})
    monkeypatch.setattr(rag, "store", FakeStore(match_results=[[doc]]))
    monkeypatch.setattr(rag, "_classify_intent", _slow("RETRIEVAL"))
    monkeypatch.setattr(rag, "_build_metadata_filter", _slow(None))
    monkeypatch.setattr(rag, "_build_hyde_query", _slow("hyde text"))
    monkeypatch.setattr(
        rag, "build_medical_answer_chain", lambda cfg_: type("C", (), {"invoke": lambda self, inp: "LDL is high."})()
    )
    monkeypatch.delenv("COHERE_API_KEY", raising=False)

    start = time.perf_counter()
    result = rag.answer_question(cfg, USER, "is my LDL high?", skip_faithfulness=True)
    elapsed = time.perf_counter() - start

    assert result == {"answer": "LDL is high.", "sources": ["lipid.pdf"]}
    assert embeddings.queries == ["hyde text"]
    assert elapsed < 0.55, f"classifier, filter and HyDE should overlap (took {elapsed:.2f}s)"


def test_stream_skips_retrieval_for_conversation(monkeypatch, cfg):
    store = FakeStore()
    monkeypatch.setattr(rag, "store", store)
    monkeypatch.setattr(rag, "_classify_intent", lambda *a, **k: "CONVERSATIONAL")
    monkeypatch.setattr(rag, "_build_metadata_filter", lambda *a, **k: None)
    monkeypatch.setattr(rag, "_build_hyde_query", lambda cfg_, q, history=None: q)
    monkeypatch.setattr(rag, "_iter_llm_stream_tokens", lambda llm, messages: iter(["Hi", "!"]))
    monkeypatch.setattr(rag, "ChatOpenAI", lambda **kwargs: object())

    events = list(rag.iter_chat_stream_events(cfg, USER, "hello there"))

    assert [e["text"] for e in events] == ["Hi", "!"]
    assert store.match_calls == []


def test_reupload_with_same_name_removes_previous_storage_object(monkeypatch, cfg, embeddings):
    store = FakeStore(cached_report={"structured_report": dict(STRUCTURED)})
    store.previous = {"id": "rep-1", "storage_path": f"{USER}/1-old-scan.png"}
    store.removed = []
    store.get_report_by_filename = lambda user_id, filename: store.previous
    store.remove_objects = lambda paths: store.removed.extend(paths)
    monkeypatch.setattr(rag, "store", store)

    rag.ingest_report(cfg, USER, filename="scan.png", storage_path=f"{USER}/2-new-scan.png")

    assert store.removed == [f"{USER}/1-old-scan.png"]


def test_first_upload_removes_nothing(monkeypatch, cfg, embeddings):
    store = FakeStore(cached_report={"structured_report": dict(STRUCTURED)})
    store.removed = []
    store.get_report_by_filename = lambda user_id, filename: None
    store.remove_objects = lambda paths: store.removed.extend(paths)
    monkeypatch.setattr(rag, "store", store)

    rag.ingest_report(cfg, USER, filename="scan.png", storage_path=f"{USER}/2-scan.png")

    assert store.removed == []


def test_rerank_without_cohere_key_is_quiet(monkeypatch, caplog):
    monkeypatch.delenv("COHERE_API_KEY", raising=False)
    docs = [Document(page_content=str(i)) for i in range(8)]
    with caplog.at_level("WARNING", logger="medsync"):
        assert rag._rerank_documents("q", docs, top_n=5) == docs[:5]
    assert caplog.records == []
