from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
from typing import List, Optional

Base = SQLModel  # Define Base as SQLModel

class User(Base, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, nullable=False, unique=True)
    hashed_password: str = Field(nullable=False)
    name: str = Field(nullable=False)
    surname: str = Field(nullable=False)
    email: str = Field(nullable=False, unique=True, index=True)
    role: str = Field(default="user", nullable=False)
    studies: List[int] = Field(default_factory=list, sa_column=Column(JSON))

