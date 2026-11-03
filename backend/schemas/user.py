from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, constr


class AccountDetails(BaseModel):
    username: constr(strip_whitespace=True, min_length=1, max_length=100)
    name: constr(strip_whitespace=True, min_length=1, max_length=100)
    surname: constr(strip_whitespace=True, min_length=1, max_length=100)
    email: EmailStr
    role: Literal["user", "admin"] = "user"


class UserCreate(AccountDetails):
    password: str


class InvitationDelivery(BaseModel):
    delivery: Literal["email", "link"] = "email"


class UserInvite(AccountDetails):
    delivery: Literal["email", "link"] = "email"


class UserUpdate(BaseModel):
    name: Optional[constr(strip_whitespace=True, min_length=1, max_length=100)] = None
    surname: Optional[constr(strip_whitespace=True, min_length=1, max_length=100)] = None
    email: Optional[EmailStr] = None


class AccountStatus(BaseModel):
    is_active: bool


class PasswordSetup(BaseModel):
    token: constr(min_length=40, max_length=200)
    password: str
