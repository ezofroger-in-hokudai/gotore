import asyncio
import gzip

import pytest
from fastapi import HTTPException

from app.api.compressed_request import MAX_BODY_BYTES, GzipRequest


def request(body, *, encoding=b"gzip", chunk_size=7):
    chunks = [body[i : i + chunk_size] for i in range(0, len(body), chunk_size)] or [b""]

    async def receive():
        return {"type": "http.request", "body": chunks.pop(0), "more_body": bool(chunks)}

    scope = {"type": "http", "headers": [(b"content-encoding", encoding)]}
    return GzipRequest(scope, receive)


def test_chunked_gzip_boundary_and_cached_body():
    async def read_twice():
        body = b"x" * MAX_BODY_BYTES
        req = request(gzip.compress(body))
        assert await req.body() == body
        assert await req.body() == body
        too_large = request(gzip.compress(body + b"x"))
        with pytest.raises(HTTPException) as error:
            await too_large.body()
        assert error.value.status_code == 413

    asyncio.run(read_twice())


def test_plain_identity_and_case_insensitive_gzip():
    for encoding, body in [(b"identity", b"{}"), (b" GZip ", gzip.compress(b"{}"))]:
        assert asyncio.run(request(body, encoding=encoding).body()) == b"{}"


def test_chunked_truncated_and_trailing_gzip():
    body = gzip.compress(b"{}")
    for invalid in [body[:-1], body + b"extra", body + body]:
        with pytest.raises(HTTPException) as error:
            asyncio.run(request(invalid, chunk_size=1).body())
        assert error.value.status_code == 400
