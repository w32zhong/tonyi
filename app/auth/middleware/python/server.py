"""
Test server — reference usage of jwt_middleware.

Shows how a downstream service integrates with authd:
  - GET  /login          serve login page (form POSTs directly to authd via proxy)
  - GET  /private        protected route via jwt_middleware

Assumes authd and this server share the same domain via a reverse proxy,
so cookies set by authd are readable here.

Environment variables:
  AUTH_BASE_URL   Base URL of authd as seen by the browser (default: http://localhost:19721)
  JWT_COOKIE_NAME Cookie name matching authd config          (default: jwt)
  TEST_PORT       Port this server listens on               (default: 18000)
"""

import json
import os
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI
from fastapi.responses import HTMLResponse

from middleware import (
    AUTH_BASE_URL,
    JWT_COOKIE_NAME,
    REDIRECT_URL_PREFIX,
    MiddlewareRedirect,
    jwt_middleware,
    middleware_redirect_handler,
)

TEST_PORT = int(os.getenv("TEST_PORT", "18000"))
HERE = Path(__file__).resolve().parent

app = FastAPI()
app.add_exception_handler(MiddlewareRedirect, middleware_redirect_handler)


@app.get("/login", response_class=HTMLResponse)
async def login_page(logout: bool = False):
    html = (HERE.parent / "login.html").read_text()
    html = html.replace("__AUTH_BASE_URL__", AUTH_BASE_URL)
    response = HTMLResponse(content=html)
    if logout:
        response.delete_cookie(JWT_COOKIE_NAME)
    return response


@app.get("/private", response_class=HTMLResponse)
async def private_page(jwt_payload: dict = Depends(jwt_middleware)):
    html = (HERE.parent / "private.html").read_text()
    html = html.replace("__PAYLOAD__", json.dumps(jwt_payload, indent=2))
    html = html.replace("__USERNAME__", jwt_payload.get("loggedInAs", "stranger"))
    return HTMLResponse(content=html)


if __name__ == "__main__":
    print(f"Test server starting on port {TEST_PORT}")
    print(f"AUTH_BASE_URL: {AUTH_BASE_URL}")
    print(f"JWT_COOKIE_NAME: {JWT_COOKIE_NAME}")
    print(f"REDIRECT_URL_PREFIX: {REDIRECT_URL_PREFIX}")
    uvicorn.run(app, host="0.0.0.0", port=TEST_PORT)
