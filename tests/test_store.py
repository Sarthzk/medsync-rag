import pytest

import medsync_store
from medsync_store import assert_owned_path, match_chunks

USER = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"


def test_assert_owned_path_accepts_own_file():
    assert assert_owned_path(USER, f"{USER}/171-report.pdf") == f"{USER}/171-report.pdf"


def test_assert_owned_path_strips_whitespace():
    assert assert_owned_path(USER, f"  {USER}/a.png ") == f"{USER}/a.png"


@pytest.mark.parametrize(
    "path",
    [
        "",
        f"{OTHER}/report.pdf",  # someone else's folder
        f"{USER}",  # folder only, no file
        f"{USER}/",  # empty filename
        f"/{USER}/report.pdf",  # absolute
        f"{USER}/../{OTHER}/report.pdf",  # traversal
        f"{USER}/./report.pdf",
        f"{USER}//report.pdf",
        f"{USER}\\report.pdf",
        f"{USER}x/report.pdf",  # prefix match must not be enough
    ],
)
def test_assert_owned_path_rejects_foreign_or_malformed(path):
    with pytest.raises(ValueError):
        assert_owned_path(USER, path)


class _FakeRpc:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        rows = self.rows

        class _Exec:
            def execute(self_inner):
                return type("R", (), {"data": rows})()

        return _Exec()


def test_match_chunks_maps_rows_to_documents(monkeypatch):
    fake = _FakeRpc(
        [
            {
                "id": 7,
                "report_id": "r-1",
                "content": "Hemoglobin 13.2 g/dL",
                "metadata": {"source": "cbc.pdf", "report_type_norm": "cbc"},
                "similarity": 0.83,
            }
        ]
    )
    monkeypatch.setattr(medsync_store, "get_supabase", lambda: fake)

    docs = match_chunks(USER, [0.1, 0.2], k=5, metadata_filter={"report_type_norm": "cbc"})

    assert len(docs) == 1
    assert docs[0].page_content == "Hemoglobin 13.2 g/dL"
    assert docs[0].metadata["source"] == "cbc.pdf"
    assert docs[0].metadata["report_id"] == "r-1"
    assert docs[0].metadata["similarity"] == pytest.approx(0.83)
    name, params = fake.calls[0]
    assert name == "match_report_chunks"
    assert params == {
        "query_embedding": [0.1, 0.2],
        "match_count": 5,
        "p_user_id": USER,
        "p_filter": {"report_type_norm": "cbc"},
    }


def test_match_chunks_sends_empty_filter_when_none(monkeypatch):
    fake = _FakeRpc([])
    monkeypatch.setattr(medsync_store, "get_supabase", lambda: fake)

    assert match_chunks(USER, [0.0], k=3, metadata_filter=None) == []
    assert fake.calls[0][1]["p_filter"] == {}


def test_delete_user_storage_removes_everything_in_users_folder(monkeypatch):
    removed = []

    class Bucket:
        def list(self, path, options=None):
            assert path == USER
            return [{"name": "a.pdf"}, {"name": "b.png"}]

        def remove(self, paths):
            removed.extend(paths)

    fake = type("SB", (), {"storage": type("S", (), {"from_": lambda self, b: Bucket()})()})()
    monkeypatch.setattr(medsync_store, "get_supabase", lambda: fake)

    assert medsync_store.delete_user_storage(USER) == 2
    assert removed == [f"{USER}/a.pdf", f"{USER}/b.png"]


class _RecordingQuery:
    """Chainable stand-in for a postgrest query builder that records each call."""

    def __init__(self, log, table):
        self.log, self.table = log, table

    def __getattr__(self, name):
        def call(*args, **kwargs):
            self.log.append((self.table, name, args, kwargs))
            return self

        return call

    def execute(self):
        self.log.append((self.table, "execute", (), {}))
        return type("R", (), {"data": []})()


def test_replace_chunks_is_idempotent_upsert_then_trims_stale(monkeypatch):
    log = []
    fake = type("SB", (), {"table": lambda self, name: _RecordingQuery(log, name)})()
    monkeypatch.setattr(medsync_store, "get_supabase", lambda: fake)

    n = medsync_store.replace_chunks(
        USER, "rep-1", [("a", {"source": "x.pdf"}), ("b", {"source": "x.pdf"})], [[0.1], [0.2]]
    )

    assert n == 2
    ops = [entry[1] for entry in log if entry[1] != "execute"]
    # Rows are written with an upsert keyed on (report_id, chunk_index): a duplicate,
    # concurrent ingest of the same report converges instead of hitting a unique violation.
    upserts = [entry for entry in log if entry[1] == "upsert"]
    assert len(upserts) == 1
    rows = upserts[0][2][0]
    assert [r["chunk_index"] for r in rows] == [0, 1]
    assert upserts[0][3] == {"on_conflict": "report_id,chunk_index"}
    assert "insert" not in ops
    # Stale chunks from a longer previous version are removed *after* the upsert.
    assert ops.index("upsert") < ops.index("delete")
    assert ("report_chunks", "gte", ("chunk_index", 2), {}) in log
