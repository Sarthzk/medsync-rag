import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import medsync_auth
from medsync_auth import AuthUser, get_current_user, parse_bearer_token


@pytest.mark.parametrize("header", [None, "", "Basic abc", "Bearer", "Bearer ", "Bearer    "])
def test_parse_bearer_token_rejects_missing_or_malformed(header):
    with pytest.raises(HTTPException) as exc:
        parse_bearer_token(header)
    assert exc.value.status_code == 401


@pytest.mark.parametrize("header", ["Bearer abc", "bearer abc", "BEARER  abc "])
def test_parse_bearer_token_extracts_token(header):
    assert parse_bearer_token(header) == "abc"


class _FakeAuth:
    def __init__(self, result=None, error=None):
        self._result = result
        self._error = error
        self.seen_token = None

    def get_user(self, token):
        self.seen_token = token
        if self._error:
            raise self._error
        return self._result


def _patch_client(monkeypatch, fake_auth):
    monkeypatch.setattr(
        medsync_auth, "get_supabase", lambda: SimpleNamespace(auth=fake_auth)
    )


def test_get_current_user_returns_user_for_valid_token(monkeypatch):
    fake = _FakeAuth(
        result=SimpleNamespace(user=SimpleNamespace(id="user-123", email="a@b.com"))
    )
    _patch_client(monkeypatch, fake)

    user = asyncio.run(get_current_user("Bearer good-token"))

    assert user == AuthUser(id="user-123", email="a@b.com")
    assert fake.seen_token == "good-token"


def test_get_current_user_401_when_supabase_rejects(monkeypatch):
    _patch_client(monkeypatch, _FakeAuth(error=RuntimeError("invalid JWT")))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user("Bearer bad-token"))
    assert exc.value.status_code == 401


def test_get_current_user_401_when_no_user_returned(monkeypatch):
    _patch_client(monkeypatch, _FakeAuth(result=SimpleNamespace(user=None)))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user("Bearer token"))
    assert exc.value.status_code == 401


def test_get_current_user_401_without_header():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(None))
    assert exc.value.status_code == 401


def test_get_supabase_gives_each_thread_its_own_client(monkeypatch):
    """HTTP/2 connections in the Supabase client aren't safe to share across threads."""
    import threading

    created = []
    monkeypatch.setattr(medsync_auth, "create_client", lambda url, key: created.append(object()) or created[-1])
    monkeypatch.setattr(medsync_auth, "_thread_clients", threading.local())

    main_a = medsync_auth.get_supabase()
    main_b = medsync_auth.get_supabase()
    other = []
    t = threading.Thread(target=lambda: other.append(medsync_auth.get_supabase()))
    t.start()
    t.join()

    assert main_a is main_b  # reused within a thread
    assert other[0] is not main_a  # never shared across threads
    assert len(created) == 2
