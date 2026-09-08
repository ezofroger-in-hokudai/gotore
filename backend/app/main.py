from contextlib import asynccontextmanager
from time import perf_counter

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.timing import request_timings
from app.domain.errors import Conflict, NotFound, ServiceUnavailable
from app.infrastructure.auth_client import AuthClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    with httpx.Client(
        timeout=5,
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=5, keepalive_expiry=30),
    ) as client:
        app.state.auth_client = AuthClient(client)
        yield


app = FastAPI(
    lifespan=lifespan,
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
)
app.include_router(api_router)


@app.middleware("http")
async def disable_api_cache(request: Request, call_next):
    timings = {}
    token = request_timings.set(timings)
    start = perf_counter()
    try:
        response = await call_next(request)
        timings["app"] = (perf_counter() - start) * 1000
        response.headers["Cache-Control"] = "no-store"
        response.headers["Server-Timing"] = ", ".join(
            f"{name};dur={duration:.1f}" for name, duration in timings.items()
        )
        return response
    finally:
        request_timings.reset(token)


@app.exception_handler(NotFound)
async def not_found(request: Request, error: NotFound):
    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.exception_handler(Conflict)
async def conflict(request: Request, error: Conflict):
    return JSONResponse(status_code=409, content={"detail": str(error)})


@app.exception_handler(ServiceUnavailable)
async def service_unavailable(request: Request, error: ServiceUnavailable):
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.get("/", tags=["root"])
def read_root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "environment": settings.app_env,
        "docs": "/docs",
        "healthcheck": "/api/health",
    }
