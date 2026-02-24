import os
import argparse
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from sqlmodel import Field, SQLModel, create_engine, Session, select, desc
import secrets

import hash

# Database configuration - reads host from environment variable
DB_URL = os.getenv("DB_URL", "postgresql://postgres:postgres@localhost/postgres")
engine = create_engine(DB_URL)


class Auth_User(SQLModel, table=True):
    username: str = Field(max_length=63, primary_key=True)
    password_hash: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    modified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Auth_Record(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ip_address: str = Field(max_length=45)  # Supports full IPv6 addresses
    username: str = Field(max_length=63)
    successful: bool
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class JWT_Config(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str
    modified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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


def change_password(user: str = "admin", password: str = "changeme!"):
    with Session(engine) as session:
        statement = select(Auth_User).where(Auth_User.username == user)
        db_user = session.exec(statement).first()
        if not db_user:
            print(f"User `{user}` not found.")
            return

        print(f"Changing password for user `{user}`...")
        db_user.password_hash = hash.hash_password(password)
        db_user.modified_at = datetime.now(timezone.utc)
        session.add(db_user)
        session.commit()
        print("Password updated successfully.")


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


def get_login_attempts(ip_address: str, username: str, max_minutes: int) -> tuple[int, list[Auth_Record]]:
    """Gets the number of failed attempts for a user from an IP since the last success, up to max_minutes ago."""
    since = datetime.now(timezone.utc) - timedelta(minutes=max_minutes)

    with Session(engine) as session:
        statement = select(Auth_Record).where(
            Auth_Record.username == username,
            Auth_Record.ip_address == ip_address,
            Auth_Record.timestamp >= since
        ).order_by(desc(Auth_Record.timestamp))

        records = list(session.exec(statement).all())

        consec_fails = 0
        for record in records:
            if record.successful:
                break
            consec_fails += 1
        return consec_fails, records


def rotate_jwt_secret() -> str:
    new_secret = secrets.token_hex(2048)
    with Session(engine) as session:
        item = session.get(JWT_Config, "jwt_secret")
        if not item:
            item = JWT_Config(key="jwt_secret", value=new_secret)
        else:
            item.value = new_secret
            item.modified_at = datetime.now(timezone.utc)
        session.add(item)
        session.commit()
    return new_secret


def get_jwt_secret() -> Optional[str]:
    with Session(engine) as session:
        item = session.get(JWT_Config, "jwt_secret")
        return item.value if item else rotate_jwt_secret()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lattice Database Management Tool (Python)")
    parser.add_argument("--init", action="store_true", help="Initialize database and create admin user")
    parser.add_argument("--reset", action="store_true", help="Reset the entire database")
    parser.add_argument("--password", help="Pass in the password for the admin user")
    parser.add_argument("--change-password", nargs='?', const='admin', help="Change user password (default: admin)")
    parser.add_argument("--verify", action="store_true", help="Verify admin password")
    parser.add_argument("--rotate-jwt", action="store_true", help="Rotate the JWT secret")
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
        if admin:
            successful = hash.verify_password(admin.password_hash, password)
            print('verify successful:', successful)
            store_login_attempt("127.0.0.1", "admin", successful)
        else:
            print("Admin user not found.")

        N = 5
        attempts = get_login_attempts("127.0.0.1", "admin", N)
        print(f"Failed attempts in last {N} mins: {attempts}")

    elif args.change_password:
        change_password(args.change_password, password)

    elif args.rotate_jwt:
        new_secret = rotate_jwt_secret()
        secret = get_jwt_secret()
        assert new_secret == secret
        print(f"Stored Secret: {secret[:5]}...")

    else:
        parser.print_help()
