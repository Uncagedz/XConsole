from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import re
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api import router as api_router
from .security import (
    authenticate_basic_header,
    configured_legacy_api_token,
    configured_basic_auth_header,
    current_service_user_from_auth_header,
    current_user_from_auth_header,
    current_user_from_session_cookie,
    issue_session_cookie,
)

APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
ADMIN_DIR = APP_DIR / "static" / "admin"
ADMIN_ASSETS_DIR = ADMIN_DIR / "assets"
SALES_ASSISTANT_DIST_DIR = ROOT_DIR / "sales-assistant" / "frontend" / "dist"
SALES_ASSISTANT_ASSETS_DIR = SALES_ASSISTANT_DIST_DIR / "assets"
NO_STORE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}
DEFAULT_CORS_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
)
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
LOGGER = logging.getLogger("xconsole.legacy")

app = FastAPI(title="xConsole Command Center", version="1.0.0")


def _read_text_if_exists(path: Path) -> str | None:
    try:
        if path.exists():
            return path.read_text(encoding="utf-8")
    except Exception:
        return None
    return None


ADMIN_INDEX_FILE = ADMIN_DIR / "index.html"
SALES_INDEX_FILE = SALES_ASSISTANT_DIST_DIR / "index.html"
ADMIN_INDEX_HTML = _read_text_if_exists(ADMIN_INDEX_FILE)
SALES_INDEX_HTML = _read_text_if_exists(SALES_INDEX_FILE)


def _admin_bootstrap_script() -> str:
    auth_header = configured_basic_auth_header()
    if auth_header is None:
        return ""
    payload = json.dumps(auth_header)
    return f"<script>window.__XCONSOLE_BASIC_AUTH__={payload};</script>"


def _admin_index_html() -> str | None:
    if ADMIN_INDEX_HTML is None:
        return None
    return ADMIN_INDEX_HTML.replace("</head>", f"{_admin_bootstrap_script()}</head>")


def _configured_cors_origins() -> list[str]:
    raw = str(
        os.getenv("CORS_ORIGINS")
        or os.getenv("XCONSOLE_CORS_ORIGINS")
        or ""
    ).strip()
    if not raw:
        return list(DEFAULT_CORS_ORIGINS)

    origins: list[str] = []
    for item in raw.split(","):
        origin = item.strip().rstrip("/")
        if not origin:
            continue
        if origin == "*":
            raise RuntimeError(
                "Wildcard CORS origins are not allowed when credentials are enabled."
            )
        if not origin.startswith(("http://", "https://", "chrome-extension://")):
            raise RuntimeError(f"Unsupported CORS origin: {origin}")
        if origin not in origins:
            origins.append(origin)
    if not origins:
        raise RuntimeError("At least one explicit CORS origin is required.")
    return origins


def _request_id(request: Request) -> str:
    supplied = str(request.headers.get("x-request-id") or "").strip()
    if REQUEST_ID_PATTERN.fullmatch(supplied):
        return supplied
    return uuid.uuid4().hex


def _configured_legacy_api_token() -> str | None:
    return configured_legacy_api_token()


def _legacy_bearer_token_matches(auth_header: str | None) -> bool:
    return current_service_user_from_auth_header(auth_header) is not None


def _json_safe_error_payload(
    *,
    message: str,
    path: str,
    request_id: str,
    status_code: int | None = None,
    details: object | None = None,
    error: str = "request_error",
) -> dict[str, object]:
    payload: dict[str, object] = {
        "ok": False,
        "error": error,
        "message": message,
        "path": path,
        "request_id": request_id,
    }
    if status_code is not None:
        payload["status_code"] = status_code
    if details is not None:
        payload["details"] = details
    return payload


@app.exception_handler(StarletteHTTPException)
@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    status_code = int(getattr(exc, "status_code", 500))
    request_id = _request_id(request)
    if status_code >= 500:
        message = "An unexpected error occurred."
        details = None
    else:
        message = str(exc.detail) if not isinstance(exc.detail, dict) else str(exc.detail.get("message", exc.detail))
        details = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
    return JSONResponse(
        status_code=status_code,
        content=_json_safe_error_payload(
            message=message,
            path=str(request.url.path),
            request_id=request_id,
            status_code=status_code,
            details=details,
            error="internal_server_error" if status_code >= 500 else "request_error",
        ),
        headers={"X-Request-ID": request_id},
    )


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    request_id = _request_id(request)
    return JSONResponse(
        status_code=422,
        content=_json_safe_error_payload(
            message="Request validation failed.",
            path=str(request.url.path),
            request_id=request_id,
            status_code=422,
            details=exc.errors(),
        ),
        headers={"X-Request-ID": request_id},
    )


@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = _request_id(request)
    LOGGER.error(
        "Unhandled legacy request failure",
        extra={"request_id": request_id, "request_path": str(request.url.path)},
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(
        status_code=500,
        content=_json_safe_error_payload(
            message="An unexpected error occurred.",
            path=str(request.url.path),
            request_id=request_id,
            status_code=500,
            error="internal_server_error",
        ),
        headers={"X-Request-ID": request_id},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_configured_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/health")
async def railway_health() -> dict[str, bool]:
    return {"ok": True}


def _is_uncached_app_path(path: str) -> bool:
    return (
        path.startswith("/api/")
        or path == "/admin"
        or path.startswith("/admin/")
        or path.startswith("/static/admin/")
        or path == "/sales-assistant"
        or path.startswith("/sales-assistant/")
    )


def _with_no_store_headers(path: str, response: Response) -> Response:
    if _is_uncached_app_path(path):
        response.headers.update(NO_STORE_HEADERS)
    return response


def _apply_session_cookie(request: Request, response: Response) -> Response:
    user = current_user_from_session_cookie(request.cookies.get("xconsole_session"))
    if not user:
        user = current_user_from_auth_header(request.headers.get("authorization", ""))
    if not user:
        return response
    secure_cookie = request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").lower() == "https"
    response.set_cookie(
        "xconsole_session",
        issue_session_cookie(str(user.get("username") or "")),
        httponly=True,
        samesite="lax",
        secure=secure_cookie,
        path="/",
    )
    return response


@app.middleware("http")
async def optional_basic_auth(request: Request, call_next):
    path = request.url.path

    if request.method == "OPTIONS":
        response = await call_next(request)
        return _with_no_store_headers(path, response)

    if path in {"/health", "/api/health"}:
        response = await call_next(request)
        return _with_no_store_headers(path, response)

    if path.startswith("/api/"):
        session_user = current_user_from_session_cookie(
            request.cookies.get("xconsole_session")
        )
        auth_user = current_user_from_auth_header(
            request.headers.get("authorization", "")
        )
        service_authenticated = _legacy_bearer_token_matches(
            request.headers.get("authorization", "")
        )
        if not session_user and not auth_user and not service_authenticated:
            request_id = _request_id(request)
            return JSONResponse(
                status_code=401,
                content=_json_safe_error_payload(
                    message="Authentication required.",
                    path=path,
                    request_id=request_id,
                    status_code=401,
                    error="authentication_required",
                ),
                headers={
                    "WWW-Authenticate": 'Basic realm="xConsole"',
                    "X-Request-ID": request_id,
                },
            )
        response = await call_next(request)
        if auth_user:
            secure_cookie = (
                request.url.scheme == "https"
                or request.headers.get("x-forwarded-proto", "").lower()
                == "https"
            )
            response.set_cookie(
                "xconsole_session",
                issue_session_cookie(str(auth_user.get("username") or "")),
                httponly=True,
                samesite="lax",
                secure=secure_cookie,
                path="/",
            )
        return _with_no_store_headers(path, response)

    if (
        path.startswith("/static/admin/assets/")
        or path.startswith("/sales-assistant/assets/")
        or path == "/admin"
        or path.startswith("/admin/")
        or path == "/sales-assistant"
        or path.startswith("/sales-assistant/")
    ):
        response = await call_next(request)
        return _with_no_store_headers(path, response)

    session_user = current_user_from_session_cookie(request.cookies.get("xconsole_session"))
    if session_user:
        response = await call_next(request)
        return _with_no_store_headers(path, response)

    auth_user = authenticate_basic_header(request.headers.get("authorization", ""))
    if auth_user:
        response = await call_next(request)
        secure_cookie = request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").lower() == "https"
        response.set_cookie(
            "xconsole_session",
            issue_session_cookie(str(auth_user.get("username") or "")),
            httponly=True,
            samesite="lax",
            secure=secure_cookie,
            path="/",
        )
        return _with_no_store_headers(path, response)

    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="xConsole"'},
        content="Authentication required",
    )

if ADMIN_ASSETS_DIR.exists():
    app.mount(
        "/static/admin/assets",
        StaticFiles(directory=str(ADMIN_ASSETS_DIR)),
        name="admin-assets",
    )

if SALES_ASSISTANT_ASSETS_DIR.exists():
    app.mount(
        "/sales-assistant/assets",
        StaticFiles(directory=str(SALES_ASSISTANT_ASSETS_DIR)),
        name="sales-assistant-assets",
    )


@app.get("/")
async def root() -> RedirectResponse:
    return RedirectResponse(url="/admin")


@app.get("/admin")
async def admin_index(request: Request) -> HTMLResponse:
    html_text = _admin_index_html()
    if html_text is None:
        raise HTTPException(status_code=404, detail="Admin bundle missing. Run start-local-stack.ps1.")
    response = HTMLResponse(html_text, headers=NO_STORE_HEADERS)
    return _apply_session_cookie(request, response)


@app.get("/admin/{path:path}")
async def admin_spa(path: str, request: Request) -> HTMLResponse:
    html_text = _admin_index_html()
    if html_text is None:
        raise HTTPException(status_code=404, detail="Admin bundle missing. Run start-local-stack.ps1.")
    response = HTMLResponse(html_text, headers=NO_STORE_HEADERS)
    return _apply_session_cookie(request, response)


@app.get("/sales-assistant")
async def sales_assistant_index() -> HTMLResponse:
    if SALES_INDEX_HTML is None:
        raise HTTPException(
            status_code=404,
            detail="Sales-assistant bundle missing. Run start-local-stack.ps1.",
        )
    return HTMLResponse(SALES_INDEX_HTML, headers=NO_STORE_HEADERS)


@app.get("/sales-assistant/{path:path}")
async def sales_assistant_spa(path: str) -> HTMLResponse:
    if SALES_INDEX_HTML is None:
        raise HTTPException(
            status_code=404,
            detail="Sales-assistant bundle missing. Run start-local-stack.ps1.",
        )
    return HTMLResponse(SALES_INDEX_HTML, headers=NO_STORE_HEADERS)
