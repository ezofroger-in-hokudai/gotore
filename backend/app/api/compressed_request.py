import zlib
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request, Response
from fastapi.routing import APIRoute

# 最大20種目×30セットのJSONを収めつつ、圧縮本文と展開結果を個別に制限する。
MAX_BODY_BYTES = 128 * 1024


class GzipRequest(Request):
    async def body(self) -> bytes:
        if hasattr(self, "_body"):
            return self._body
        encodings = self.headers.getlist("content-encoding")
        if not encodings or encodings == ["identity"]:
            return await super().body()
        if len(encodings) != 1 or encodings[0].strip().lower() != "gzip":
            raise HTTPException(415, "この圧縮形式には対応していません。")
        decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
        result = bytearray()
        received = 0
        try:
            async for chunk in self.stream():
                received += len(chunk)
                if received > MAX_BODY_BYTES:
                    raise HTTPException(413, "保存データが大きすぎます。")
                result.extend(decoder.decompress(chunk, MAX_BODY_BYTES + 1 - len(result)))
                if len(result) > MAX_BODY_BYTES:
                    raise HTTPException(413, "保存データが大きすぎます。")
                if decoder.unused_data:
                    raise HTTPException(400, "圧縮データを読み取れません。")
        except zlib.error as exc:
            raise HTTPException(400, "圧縮データを読み取れません。") from exc
        if not decoder.eof:
            raise HTTPException(400, "圧縮データを読み取れません。")
        self._body = bytes(result)
        return self._body


class GzipRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        handler = super().get_route_handler()

        async def read_compressed(request: Request) -> Response:
            return await handler(GzipRequest(request.scope, request.receive))

        return read_compressed
