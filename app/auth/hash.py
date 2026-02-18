from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# Argon2 Password Hasher - handles salt and security parameters automatically
ph = PasswordHasher()


def hash_password(password: str) -> str:
    # Argon2 will add salt underlying
    return ph.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    try:
        return ph.verify(hashed, password)
    except VerifyMismatchError:
        return False
