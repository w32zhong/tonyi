import json
import os
import urllib
from fastapi import FastAPI, Request, Response, Depends
from fastapi import status as http_status
from fastapi.responses import JSONResponse, RedirectResponse

import auth, db


app = FastAPI()

# Configuration
JWT_COOKIE_NAME = os.getenv("JWT_COOKIE_NAME", "jwt")
PORT = int(os.getenv("PORT", "19721"))


class MiddlewareException(Exception):
    def __init__(self, redirect_url: str):
        self.redirect_url = redirect_url


@app.exception_handler(MiddlewareException)
async def auth_exception_handler(request: Request, exc: MiddlewareException):
    accept = request.headers.get("accept", "")
    if "application/json" in accept:
        return JSONResponse(
            content={
                "pass": False,
                "redirect": exc.redirect_url
            },
            status_code=http_status.HTTP_200_OK
        )
    else:
        return RedirectResponse(url=exc.redirect_url)


async def jwt_middleware(request: Request):
    original_url = str(request.url.path)
    if request.url.query:
        original_url += f"?{request.url.query}"

    # Extract only the JWT token from cookies and send it to /authorization.
    token = request.cookies.get(JWT_COOKIE_NAME, "")
    base_url = str(request.base_url).rstrip("/")
    auth_url = f"{base_url}/authorization"
    req = urllib.request.Request(
        auth_url,
        data=json.dumps({"token": token}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
    except Exception:
        result = {"pass": False}

    if result.get("pass"):
        return result.get("msg")

    encoded_url = urllib.parse.quote(original_url)
    redirect_url = f"/login?next={encoded_url}"

    raise MiddlewareException(redirect_url=redirect_url)


@app.post("/authorization")
async def authorization(request: Request, response: Response):
    req_json = await request.json()
    token = req_json.get("token", "")
    pass_check, msg = auth.verify(token)
    return {"pass": pass_check, "msg": msg}


@app.post("/authentication")
async def authentication(request: Request, response: Response):
    req_json = await request.json()
    username = req_json.get("username", "")
    password = req_json.get("password", "")
    debug = req_json.get("debug", False)

    ip_addr = request.headers.get("x-real-ip", "127.0.0.1")
    pass_check, msg = auth.login(ip_addr, username, password, debug)
    if pass_check:
        response.set_cookie(
            key=JWT_COOKIE_NAME,
            value=msg["token"],
            max_age=msg["info"]["maxAge"],
            httponly=True # ask the browser to hide it from JavaScript
        )

    return {"pass": pass_check, "msg": msg}


@app.get("/secret")
async def get_secret():
    return db.get_jwt_secret()


# test point
@app.get("/")
async def root():
    return Response(content="<h2>Authd at your service<h2>", media_type="text/html")


# test point
@app.get("/private")
async def private(msg: dict = Depends(jwt_middleware)):
    return Response(content=f"<h2>This is a private place: {msg}<h2>", media_type="text/html")


if __name__ == "__main__":
    import uvicorn
    print(f"Starting Auth Server on port {PORT}...")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
