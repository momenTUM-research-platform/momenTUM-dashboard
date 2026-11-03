import os
import sys
from pathlib import Path

os.environ["SECRET_KEY"] = "test-signing-key-with-no-production-use"
os.environ["DATABASE_URL"] = os.getenv("AUTH_TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ["MONGO_URL"] = "mongodb://127.0.0.1:27017"
os.environ["MONGO_DB"] = "authentication_tests"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

import auth
from database import get_db
from models import Base, User


@pytest_asyncio.fixture
async def setup(monkeypatch):
    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    sessions = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with sessions() as db:
        for username, role, studies in [("admin", "admin", []), ("researcher", "user", ["assigned"]),
                                        ("other", "user", [])]:
            db.add(User(username=username, role=role, studies=studies, name=username,
                        surname="Test", email=f"{username}@example.org",
                        hashed_password=auth.pwd_context.hash("ExistingPass1")))
        await db.commit()

    async def override_db():
        async with sessions() as db:
            yield db

    app = FastAPI()
    app.include_router(auth.router, prefix="/api")
    app.dependency_overrides[get_db] = override_db
    sent = []

    async def send(email, username, token, purpose):
        sent.append({"email": email, "username": username, "token": token, "purpose": purpose})

    monkeypatch.setattr(auth, "send_invitation", send)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, sessions, sent, app
    await engine.dispose()


async def login(client, username="admin", password="ExistingPass1"):
    response = await client.post("/api/auth/login", data={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
