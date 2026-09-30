"""Vercel serverless entrypoint: every request is rewritten here (see vercel.json)."""

from main import app

__all__ = ["app"]
