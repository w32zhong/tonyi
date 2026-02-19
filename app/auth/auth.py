import os
import jwt
from datetime import datetime, timedelta, timezone
from typing import Tuple, Dict, Any, Optional

import db
import hash


LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_MAX_TIMESPAN = int(os.getenv("LOGIN_MAX_TIMESPAN", str(24 * 60)))


def login(ip_address: str, username: str, password: str, debug: bool = False) -> Tuple[bool, Dict[str, Any]]:
    print(f"[login user] {username}")

    errmsg = "Wrong password."
    left_chances = 0
    try:
        consec_fails, attempts = db.get_login_attempts(ip_address, username, LOGIN_MAX_TIMESPAN)
        print(f"[login] username={username}, consec_fails={consec_fails}.")
        print('[attempts]', attempts)

        left_chances = max(LOGIN_MAX_ATTEMPTS - consec_fails - 1, 0)
        if left_chances == 0:
            raise Exception(f"Too many login attempts. (User, IP) is locked out!")

        user = db.get_user(username)

        if user and hash.verify_password(user.password_hash, password):
            # Success logic
            now = datetime.now(timezone.utc)
            duration = timedelta(seconds=10) if debug else timedelta(days=1)

            exp = now + duration
            info = {
                "exp": int(exp.timestamp()),
                "maxAge": int(duration.total_seconds()),
                "loggedInAs": username,
                "scope": ["/*"]
            }

            jwt_secret = db.get_jwt_secret()
            token = jwt.encode(info, jwt_secret, algorithm="HS256")

            db.store_login_attempt(ip_address, username, True)
            return True, {
                "info": info,
                "algorithm": {"algorithm": "HS256"},
                "token": token
            }

        else:
            # Failure logic
            db.store_login_attempt(ip_address, username, False)

    except Exception as e:
        print(f"Login error: {str(e)}")
        errmsg = str(e)

    return False, {"errmsg": errmsg, "left_chances": left_chances}


def verify(token: str, secret: str) -> Tuple[bool, Any]:
    print(f"[verify token] {token[:5]}...")

    try:
        # pyjwt's decode handles both signature verification and expiration check
        secret = db.get_jwt_secret()
        decoded = jwt.decode(token, secret, algorithms=["HS256"])
        return True, decoded

    except jwt.ExpiredSignatureError:
        return False, "Token has expired."
    except jwt.InvalidTokenError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Lattice Authentication Tool")
    parser.add_argument("--ip", default="127.0.0.1", help="IP address (default: 127.0.0.1)")
    parser.add_argument("--user", default="admin", help="Username (default: admin)")
    parser.add_argument("--password", default="changeme!", help="Password (default: changeme!)")

    args = parser.parse_args()

    successful, result = login(args.ip, args.user, args.password)
    print('[successful?]', successful, result)

    if successful:
        verify_res = verify(result['token'], db.get_jwt_secret())
        print('[verify]', verify_res)
