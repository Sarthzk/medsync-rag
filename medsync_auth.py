"""Authentication for the MedSync API.

Every protected route depends on `get_current_user`, which validates the caller's
Supabase access token (sent as `Authorization: Bearer <jwt>`) and returns the user.
Validation goes through Supabase Auth, so it works with both legacy (HS256) and
asymmetric JWT signing keys without configuring a JWT secret.
"""

import logging
import os
from dataclasses import dataclass

from fastapi import Header, HTTPException
from starlette.concurrency import run_in_threadpool
from supabase import Client, create_client

logger = logging.getLogger("medsync.auth")

_SUPABASE_CLIENT: Client | None = None


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None


def get_supabase() -> Client:
    """Create/reuse a service-role Supabase client from environment variables."""
    global _SUPABASE_CLIENT
    if _SUPABASE_CLIENT is not None:
        return _SUPABASE_CLIENT

    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError(
            "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )
    _SUPABASE_CLIENT = create_client(url, key)
    return _SUPABASE_CLIENT


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"}
    )


def parse_bearer_token(header: str | None) -> str:
    """Extracts the token from an `Authorization: Bearer <token>` header."""
    scheme, _, token = (header or "").strip().partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("Missing or malformed Authorization header.")
    return token


async def get_current_user(
    authorization: str | None = Header(default=None),
) -> AuthUser:
    """FastAPI dependency: resolves the Supabase user for the request or raises 401."""
    token = parse_bearer_token(authorization)
    try:
        sb = get_supabase()
        response = await run_in_threadpool(sb.auth.get_user, token)
    except Exception:
        logger.info("Rejected access token", exc_info=True)
        raise _unauthorized("Invalid or expired session.")

    user = getattr(response, "user", None)
    if user is None or not getattr(user, "id", None):
        raise _unauthorized("Invalid or expired session.")
    return AuthUser(id=str(user.id), email=getattr(user, "email", None))
