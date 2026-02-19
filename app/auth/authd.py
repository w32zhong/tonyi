import os
import urllib.parse
from fastapi import FastAPI, Request, Response, Depends
from fastapi.responses import JSONResponse, RedirectResponse
import uvicorn

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
            status_code=fastapi.status.HTTP_200_OK
        )
    else:
        return RedirectResponse(url=exc.redirect_url)


async def jwt_middleware(request: Request):
    original_url = str(request.url.path)
    if request.url.query:
        original_url += f"?{request.url.query}"

    # TODO: call /authorization WEB API here

    encoded_url = urllib.parse.quote(original_url)
    redirect_url = f"/login?next={encoded_url}"

    raise MiddlewareException(redirect_url=redirect_url)


@app.post("/authorization")
async def authorization(request: Request, response: Response):
    token = request.cookies.get(JWT_COOKIE_NAME, "")
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


@app.get("/")
async def root():
    return Response(content="<h2>Authd at your service<h2>", media_type="text/html")


@app.get("/private")
async def private(): # TODO: use jwt_middleware here.
    return Response(content="<h2>Authd at your service<h2>", media_type="text/html")


if __name__ == "__main__":
    print(f"Starting Auth Server on port {PORT}...")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
