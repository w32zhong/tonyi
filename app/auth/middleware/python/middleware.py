import os
import json
import urllib.parse
import urllib.request
from fastapi import Request
from fastapi import status as http_status
from fastapi.responses import JSONResponse, RedirectResponse


# Configuration
JWT_COOKIE_NAME = os.getenv("JWT_COOKIE_NAME", "jwt")
PORT = os.getenv("PORT", "19721")
AUTH_BASE_URL = os.getenv("AUTH_BASE_URL", f"http://localhost:{PORT}")
REDIRECT_URL_PREFIX = os.getenv("AUTH_REDIRECT_URL_PREFIX", "/login?next=")


class MiddlewareRedirect(Exception):
    def __init__(self, redirect_url: str):
        self.redirect_url = redirect_url


async def middleware_redirect_handler(request: Request, exc: Exception):
    assert isinstance(exc, MiddlewareRedirect)
    redirect_url = exc.redirect_url
    accept = request.headers.get("accept", "")
    if "application/json" in accept:
        return JSONResponse(
            content={
                "pass": False,
                "redirect": redirect_url
            },
            status_code=http_status.HTTP_200_OK
        )
    else:
        return RedirectResponse(url=redirect_url)


async def jwt_middleware(request: Request):
    # authorization via WEB API
    token = request.cookies.get(JWT_COOKIE_NAME, "")

    auth_base = AUTH_BASE_URL.rstrip('/')
    if auth_base.startswith("/"):
        domain_base = str(request.base_url).rstrip("/")
        auth_url = f"{domain_base}{auth_base}/authorization"
    else:
        auth_url = f"{auth_base}/authorization"

    req = urllib.request.Request(
        auth_url,
        data=json.dumps({"token": token}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
    except Exception as e:
        result = {"pass": False, "msg": str(e)}

    if result.get("pass", False):
        # pass the middleware check
        return result.get("msg")
    else:
        # save URL and redirect for authentication
        original_url = str(request.url.path)
        if request.url.query:
            original_url += f"?{request.url.query}"
        encoded_url = urllib.parse.quote(original_url)
        redirect_url = f"{REDIRECT_URL_PREFIX}{encoded_url}"
        raise MiddlewareRedirect(redirect_url=redirect_url)
