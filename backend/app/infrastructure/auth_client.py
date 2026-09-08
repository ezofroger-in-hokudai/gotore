import httpx


class AuthClient:
    def __init__(self, client: httpx.Client):
        self.client = client

    def get(self, url: str, *, headers: dict[str, str], timeout: float) -> httpx.Response:
        # 接続だけ共有し、他の認証要求のCookieやヘッダーは引き継がない。
        request = httpx.Request(
            "GET",
            url,
            headers=headers,
            extensions={"timeout": httpx.Timeout(timeout).as_dict()},
        )
        return self.client.send(request)
