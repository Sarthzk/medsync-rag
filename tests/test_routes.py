import json

import pytest
from fastapi.testclient import TestClient

import main
from medsync_auth import AuthUser, get_current_user

USER = AuthUser(id="11111111-1111-1111-1111-111111111111", email="a@b.com")

PROTECTED = [
    ("get", "/reports"),
    ("get", "/reports/latest"),
    ("post", "/reports/ingest"),
    ("delete", "/reports"),
    ("delete", "/reports/abc"),
    ("post", "/chat"),
    ("post", "/chat/stream"),
    ("get", "/vitals"),
    ("post", "/vitals"),
    ("delete", "/vitals/abc"),
]


@pytest.fixture
def anon_client():
    main.app.dependency_overrides.clear()
    return TestClient(main.app)


@pytest.fixture
def client():
    main.app.dependency_overrides[get_current_user] = lambda: USER
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_health_is_public(anon_client):
    assert anon_client.get("/").status_code == 200


@pytest.mark.parametrize("method, path", PROTECTED)
def test_protected_routes_require_auth(anon_client, method, path):
    assert getattr(anon_client, method)(path).status_code == 401


def test_removed_legacy_routes_are_gone(client):
    assert client.post("/clear_db").status_code in (404, 405)
    assert client.get("/files").status_code == 404
    assert client.get("/view-reports/x.pdf").status_code == 404


# --- reports ---------------------------------------------------------------------

def test_ingest_rejects_other_users_path(client, monkeypatch):
    called = []
    monkeypatch.setattr(main, "ingest_report", lambda *a, **k: called.append(1))

    res = client.post(
        "/reports/ingest",
        json={"storage_path": "22222222-2222-2222-2222-222222222222/x.pdf", "filename": "x.pdf"},
    )

    assert res.status_code == 400
    assert called == []


def test_ingest_rejects_unsupported_extension(client):
    res = client.post(
        "/reports/ingest",
        json={"storage_path": f"{USER.id}/x.exe", "filename": "x.exe"},
    )
    assert res.status_code == 400


def test_ingest_passes_user_and_path(client, monkeypatch):
    seen = {}

    def fake_ingest(cfg, user_id, *, filename, storage_path):
        seen.update(user_id=user_id, filename=filename, storage_path=storage_path)
        return {"status": "ready", "report_id": "r1", "file": filename, "chunks": 3}

    monkeypatch.setattr(main, "ingest_report", fake_ingest)

    res = client.post(
        "/reports/ingest",
        json={"storage_path": f"{USER.id}/17-cbc.pdf", "filename": "../cbc.pdf"},
    )

    assert res.status_code == 200
    assert res.json()["report_id"] == "r1"
    assert seen == {"user_id": USER.id, "filename": "cbc.pdf", "storage_path": f"{USER.id}/17-cbc.pdf"}


def test_ingest_value_error_is_400_and_crash_is_generic_500(client, monkeypatch):
    def bad_file(*a, **k):
        raise ValueError("Uploaded file x.png is not a valid image.")

    monkeypatch.setattr(main, "ingest_report", bad_file)
    res = client.post("/reports/ingest", json={"storage_path": f"{USER.id}/x.png", "filename": "x.png"})
    assert res.status_code == 400
    assert "not a valid image" in res.json()["error"]

    def crash(*a, **k):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(main, "ingest_report", crash)
    res = client.post("/reports/ingest", json={"storage_path": f"{USER.id}/x.png", "filename": "x.png"})
    assert res.status_code == 500
    assert "secret" not in res.text


def test_list_reports_adds_signed_urls(client, monkeypatch):
    monkeypatch.setattr(
        main.store,
        "list_reports",
        lambda uid: [{"id": "r1", "filename": "a.pdf", "storage_path": f"{uid}/a.pdf", "status": "ready"}],
    )
    monkeypatch.setattr(main.store, "signed_url", lambda path, expires_in=3600: f"https://signed/{path}")

    res = client.get("/reports")

    assert res.status_code == 200
    (report,) = res.json()["reports"]
    assert report["url"] == f"https://signed/{USER.id}/a.pdf"
    assert "storage_path" not in report


def test_latest_report_404_when_none(client, monkeypatch):
    monkeypatch.setattr(main.store, "latest_report", lambda uid: None)
    res = client.get("/reports/latest")
    assert res.status_code == 404
    assert res.json()["structured_report"] is None


def test_latest_report_returns_structured(client, monkeypatch):
    monkeypatch.setattr(
        main.store,
        "latest_report",
        lambda uid: {"id": "r1", "filename": "a.pdf", "created_at": "2026-01-01", "structured_report": {"x": 1}},
    )
    body = client.get("/reports/latest").json()
    assert body == {"report_id": "r1", "file": "a.pdf", "created_at": "2026-01-01", "structured_report": {"x": 1}}


def test_delete_report_404_when_missing(client, monkeypatch):
    monkeypatch.setattr(main.store, "delete_report", lambda uid, rid: None)
    assert client.delete("/reports/nope").status_code == 404


# --- chat --------------------------------------------------------------------------

def test_chat_returns_answer_and_sources(client, monkeypatch):
    def fake_answer(cfg, user_id, question, **kwargs):
        assert user_id == USER.id
        return {"answer": "Hi", "sources": ["a.pdf"]}

    monkeypatch.setattr(main, "answer_question", fake_answer)
    res = client.post("/chat", json={"question": "hello"})
    assert res.status_code == 200
    assert res.json()["answer"] == "Hi"
    assert res.json()["sources"] == ["a.pdf"]


def _sse_payloads(text):
    return [line[6:] for line in text.splitlines() if line.startswith("data: ")]


def test_chat_stream_emits_tokens_sources_and_done(client, monkeypatch):
    def fake_events(cfg, user_id, question, **kwargs):
        yield {"event": "sources", "sources": ["a.pdf"]}
        yield {"event": "token", "text": "Hel"}
        yield {"event": "token", "text": "lo"}

    monkeypatch.setattr(main, "iter_chat_stream_events", fake_events)
    payloads = _sse_payloads(client.post("/chat/stream", json={"question": "q"}).text)
    assert payloads[-1] == "[DONE]"
    decoded = [json.loads(p) for p in payloads[:-1]]
    assert {"sources": ["a.pdf"]} in decoded
    assert "".join(d.get("t", "") for d in decoded) == "Hello"


def test_chat_stream_reports_errors_without_details(client, monkeypatch):
    def failing(cfg, user_id, question, **kwargs):
        yield {"event": "token", "text": "partial"}
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(main, "iter_chat_stream_events", failing)
    text = client.post("/chat/stream", json={"question": "q"}).text
    assert '"error"' in text
    assert "secret" not in text
    assert _sse_payloads(text)[-1] == "[DONE]"


# --- vitals ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "payload",
    [
        {},  # nothing provided
        {"heart_rate": 5},
        {"heart_rate": 400},
        {"sleep_quality": 30},
        {"daily_steps": -1},
    ],
)
def test_vitals_validation(client, payload):
    assert client.post("/vitals", json=payload).status_code == 422


def test_vitals_insert_is_stamped_with_user(client, monkeypatch):
    rows = []
    monkeypatch.setattr(main, "_sb_insert_vital", lambda row: rows.append(row) or row)
    res = client.post("/vitals", json={"heart_rate": 0 + 72, "daily_steps": 0})
    assert res.status_code == 200
    assert rows[0]["user_id"] == USER.id
    assert rows[0]["daily_steps"] == 0
    assert rows[0]["heart_rate"] == 72


def test_vitals_delete_404_when_not_owned(client, monkeypatch):
    monkeypatch.setattr(main, "_sb_delete_vital", lambda user_id, vital_id: False)
    assert client.delete("/vitals/abc").status_code == 404


# --- account deletion -------------------------------------------------------------------

def test_delete_account_requires_auth(anon_client):
    assert anon_client.delete("/account").status_code == 401


def test_delete_account_removes_data_then_auth_user(client, monkeypatch):
    calls = []
    monkeypatch.setattr(main.store, "delete_all_for_user", lambda uid: calls.append(("data", uid)) or {"deleted_reports": 2})
    monkeypatch.setattr(main.store, "delete_user_storage", lambda uid: calls.append(("storage", uid)) or 0)
    monkeypatch.setattr(main.store, "delete_user_rows", lambda uid: calls.append(("rows", uid)) or {})

    class FakeAdmin:
        def delete_user(self, uid):
            calls.append(("auth", uid))

    fake_sb = type("SB", (), {"auth": type("A", (), {"admin": FakeAdmin()})()})()
    monkeypatch.setattr(main, "get_supabase", lambda: fake_sb)

    res = client.delete("/account")

    assert res.status_code == 200
    assert calls == [("data", USER.id), ("storage", USER.id), ("rows", USER.id), ("auth", USER.id)]


def test_delete_account_keeps_auth_user_if_data_deletion_fails(client, monkeypatch):
    def boom(uid):
        raise RuntimeError("db down")

    monkeypatch.setattr(main.store, "delete_all_for_user", boom)
    deleted = []
    fake_sb = type("SB", (), {"auth": type("A", (), {"admin": type("Ad", (), {"delete_user": lambda self, uid: deleted.append(uid)})()})()})()
    monkeypatch.setattr(main, "get_supabase", lambda: fake_sb)

    res = client.delete("/account")

    assert res.status_code == 500
    assert deleted == []
