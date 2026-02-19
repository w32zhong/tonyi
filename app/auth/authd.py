import os
from fastapi import FastAPI, Request, Response, Depends

import auth, db


app = FastAPI()

# Configuration
JWT_COOKIE_NAME = os.getenv("JWT_COOKIE_NAME", "jwt")
PORT = int(os.getenv("PORT", "19721"))


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


## below are some built-in testing URI handlers
from middleware.python.middleware import (
    MiddlewareRedirect,
    middleware_redirect_handler,
    jwt_middleware,
)
app.add_exception_handler(MiddlewareRedirect, middleware_redirect_handler)


@app.get("/")
async def root():
    return Response(content="<h2>Authd at your service<h2>", media_type="text/html")


@app.get("/private")
async def private(msg: dict = Depends(jwt_middleware)):
    return Response(content=f"<h2>This is a private place: {msg}<h2>", media_type="text/html")


if __name__ == "__main__":
    import uvicorn
    print(f"Starting Auth Server on port {PORT}...")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
