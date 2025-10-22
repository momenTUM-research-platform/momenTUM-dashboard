from pydantic_sqlalchemy import sqlalchemy_to_pydantic
from models import User
from pydantic import BaseModel, EmailStr

# Generate a base schema from User by excluding fields not needed in input.
BaseUserCreate = sqlalchemy_to_pydantic(User, exclude=["id", "hashed_password", "studies"])

# Extend the generated schema to add a plain-text password field.
class UserCreate(BaseUserCreate):
    password: str
