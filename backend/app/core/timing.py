from contextlib import contextmanager
from contextvars import ContextVar
from time import perf_counter

# 同期依存へ渡るコンテキストでも、同じ要求の計測先を共有する。
request_timings: ContextVar[dict[str, float] | None] = ContextVar("request_timings", default=None)


@contextmanager
def measure(name: str):
    start = perf_counter()
    try:
        yield
    finally:
        timings = request_timings.get()
        if timings is not None:
            timings[name] = timings.get(name, 0) + (perf_counter() - start) * 1000
