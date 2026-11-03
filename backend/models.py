from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, DateTime
from sqlalchemy.ext.mutable import MutableList
from typing import List, Optional
from datetime import datetime, timezone

Base = SQLModel  # Define Base as SQLModel

class User(Base, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, nullable=False, unique=True)
    hashed_password: str = Field(nullable=False)
    name: str = Field(nullable=False)
    surname: str = Field(nullable=False)
    email: str = Field(nullable=False, unique=True, index=True)
    role: str = Field(default="user", nullable=False)
    is_active: bool = Field(default=True, nullable=False)
    password_set: bool = Field(default=True, nullable=False)
    session_version: int = Field(default=0, nullable=False)
    studies: List[str] = Field(
        default_factory=list,
        sa_column=Column(MutableList.as_mutable(JSON))
    )

class AccountInvitation(Base, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(unique=True, index=True)
    expires_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    used_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    purpose: str


class UserAccessAudit(Base, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    actor_id: int = Field(index=True)
    target_id: int = Field(index=True)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc),
                                 sa_column=Column(DateTime(timezone=True), nullable=False))
    ended_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    expires_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
