# schemas/user.py
from pydantic_sqlalchemy import sqlalchemy_to_pydantic
from pydantic import BaseModel, EmailStr
from models import User

# Base schema derived from the SQLAlchemy model
BaseUserCreate = sqlalchemy_to_pydantic(
    User,
    exclude=["id", "hashed_password", "studies"],
)

class UserCreate(BaseUserCreate):
    password: str