import os
import argparse
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from sqlmodel import Field, SQLModel, create_engine, Session, select

import hash

# Database configuration - reads host from environment variable
DB_URL = os.getenv("DB_URL", "postgresql://postgres:postgres@localhost/postgres")
engine = create_engine(DB_URL)


class Auth_User(SQLModel, table=True):
    username: str = Field(max_length=63, primary_key=True)
    password_hash: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Auth_Record(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ip_address: str = Field(max_length=45)  # Supports full IPv6 addresses
    username: str = Field(max_length=63)
    successful: bool
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class JWT_Config(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str


def init_db(reset: bool = False):
    print(engine)
    if reset:
        print("Cleaning up and resetting database schema...")
        SQLModel.metadata.drop_all(engine)

    print("Creating database tables...")
    SQLModel.metadata.create_all(engine)


def create_user(user: str = "admin", password: str = "changeme!"):
    with Session(engine) as session:
        # Check if user already exists
        statement = select(Auth_User).where(Auth_User.username == user)
        if session.exec(statement).first():
            print(f"User `{user}` already exists.")
            return

        print(f"Creating initial user `{user}`...")
        session.add(Auth_User(
            username=user,
            password_hash=hash.hash_password(password)
        ))
        session.commit()
        print("Admin account created successfully.")


def get_user(username: str) -> Optional[Auth_User]:
    with Session(engine) as session:
        statement = select(Auth_User).where(Auth_User.username == username)
        return session.exec(statement).first()


def store_login_attempt(ip_address: str, username: str, success: bool):
    with Session(engine) as session:
        record = Auth_Record(
            ip_address=ip_address,
            username=username,
            successful=success
        )
        session.add(record)
        session.commit()


def get_num_failed_attempts(ip_address: str, username: str, minutes: int) -> int:
    """Gets the number of failed attempts for a user from an IP within the last N minutes"""
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    with Session(engine) as session:
        statement = select(Auth_Record).where(
            Auth_Record.username == username,
            Auth_Record.ip_address == ip_address,
            Auth_Record.successful == False,
            Auth_Record.timestamp >= since
        )
        results = session.exec(statement).all()
        return len(results)


def get_jwt_secret() -> Optional[str]:
    with Session(engine) as session:
        item = session.get(JWT_Config, "jwt_secret")
        return item.value if item else None


def rotate_jwt_secret(new_secret: str) -> str:
    with Session(engine) as session:
        item = session.get(JWT_Config, "jwt_secret")
        if not item:
            item = JWT_Config(key="jwt_secret", value=new_secret)
        else:
            item.value = new_secret
        session.add(item)
        session.commit()
    return new_secret


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lattice Database Management Tool (Python)")
    parser.add_argument("--init", action="store_true", help="Initialize database and create admin user")
    parser.add_argument("--reset", action="store_true", help="Reset the entire database")
    parser.add_argument("--password", help="Pass in the password for the admin user")
    parser.add_argument("--verify", action="store_true", help="Verify admin password")
    parser.add_argument("--failed", help="Show failed attempts in last N mins")
    parser.add_argument("--rotate-jwt", action="store_true", help="Rotate and show the JWT secret")
    args = parser.parse_args()

    password = args.password or "changeme!"

    if args.init:
        init_db()
        create_user('admin', password)

    elif args.reset:
        init_db(reset=True)
        create_user('admin', password)

    elif args.verify:
        admin = get_user('admin')
        successful = hash.verify_password(admin.password_hash, password)
        print('verify successful:', successful)
        store_login_attempt("127.0.0.1", "admin", successful)

    elif args.failed:
        N = int(args.failed)
        attempts = get_num_failed_attempts("127.0.0.1", "admin", N)
        print(f"Failed attempts in last 5 mins: {attempts}")

    elif args.rotate_jwt:
        new_secret = rotate_jwt_secret("test-secret-12345")
        secret = get_jwt_secret()
        assert new_secret == secret
        print(f"Stored Secret: {secret}")

    else:
        parser.print_help()
