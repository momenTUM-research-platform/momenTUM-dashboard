from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, List

from dotenv import load_dotenv
from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from crud import delete_user, get_user_by_username, pwd_context
from database import get_db
from models import User
from schemas import UserCreate


load_dotenv()

router = APIRouter()


SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set.")

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
)


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login"
)


PASSWORD_PATTERN = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$"
)

PASSWORD_REQUIREMENTS_MESSAGE = (
    "Password must be at least 8 characters long and include "
    "uppercase, lowercase, and a number."
)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class UserStudiesUpdate(BaseModel):
    studies: List[str]


def validate_password(password: str) -> None:
    if not PASSWORD_PATTERN.match(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=PASSWORD_REQUIREMENTS_MESSAGE,
        )


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    to_encode = data.copy()

    expires_at = datetime.now(timezone.utc) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=15)
    )

    to_encode.update(
        {
            "exp": expires_at,
        }
    )

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def serialize_user(
    user: User,
) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "surname": user.surname,
        "email": user.email,
        "role": user.role,
        "studies": user.studies or [],
    }


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={
            "WWW-Authenticate": "Bearer",
        },
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        username = payload.get("sub")

        if (
            not username
            or not isinstance(username, str)
        ):
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = await get_user_by_username(
        db,
        username,
    )

    if not user:
        raise credentials_exception

    return user


async def admin_required(
    user: User = Depends(get_current_user),
) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient privileges",
        )

    return user


async def require_study_access(
    study_id: str,
    user: User = Depends(get_current_user),
) -> User:
    if user.role == "admin":
        return user

    allowed_studies = user.studies or []

    if study_id not in allowed_studies:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to access this study",
        )

    return user


@router.post("/auth/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_username(
        db,
        form_data.username,
    )

    if (
        not user
        or not pwd_context.verify(
            form_data.password,
            user.hashed_password,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    access_token = create_access_token(
        data={
            "sub": user.username,
            "role": user.role,
        },
        expires_delta=timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        ),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.get("/auth/me")
async def read_users_me(
    user: User = Depends(get_current_user),
):
    return serialize_user(user)


@router.post("/auth/create-user")
async def create_user_endpoint(
    request: UserCreate,
    _admin: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    existing_user = await get_user_by_username(
        db,
        request.username,
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists",
        )

    validate_password(
        request.password
    )

    user_data = request.dict()

    plain_password = user_data.pop(
        "password"
    )

    user_data["hashed_password"] = (
        pwd_context.hash(
            plain_password
        )
    )

    user_data["studies"] = []

    new_user = User(
        **user_data
    )

    db.add(new_user)

    await db.commit()
    await db.refresh(new_user)

    return {
        "message": (
            f"User {new_user.username} created "
            f"with role {new_user.role}"
        ),
        "user": serialize_user(
            new_user
        ),
    }


@router.get("/auth/check-username")
async def check_username(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    existing_user = (
        await get_user_by_username(
            db,
            username,
        )
    )

    return {
        "exists": bool(
            existing_user
        )
    }


@router.get("/auth/users")
async def list_users(
    _admin: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).order_by(
            User.id.asc()
        )
    )

    users = (
        result.scalars()
        .all()
    )

    return [
        serialize_user(user)
        for user in users
    ]


@router.delete("/auth/users/{user_id}")
async def delete_user_endpoint(
    user_id: int,
    _admin: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(
            User.id == user_id
        )
    )

    user = (
        result.scalars()
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if (
        user.username.lower()
        == "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Cannot delete the primary admin user"
            ),
        )

    await delete_user(
        db,
        user,
    )

    return {
        "message": (
            f"User {user.username} deleted"
        )
    }


@router.patch("/auth/users/{user_id}")
async def update_user_details(
    user_id: int,
    update: dict[str, Any] = Body(...),
    _admin: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    allowed_fields = {
        "name",
        "surname",
        "email",
    }

    update_data = {
        key: value
        for key, value in update.items()
        if key in allowed_fields
    }

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update",
        )

    result = await db.execute(
        select(User).where(
            User.id == user_id
        )
    )

    user = (
        result.scalars()
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    for (
        key,
        value,
    ) in update_data.items():
        setattr(
            user,
            key,
            value,
        )

    await db.commit()
    await db.refresh(user)

    return {
        "message": (
            f"User {user.username} updated"
        ),
        "user": serialize_user(
            user
        ),
    }


@router.patch(
    "/auth/users/{user_id}/reset-password"
)
async def reset_user_password(
    user_id: int,
    new_password: str = Body(
        ...,
        embed=True,
    ),
    _admin: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(
            User.id == user_id
        )
    )

    user = (
        result.scalars()
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    validate_password(
        new_password
    )

    user.hashed_password = (
        pwd_context.hash(
            new_password
        )
    )

    await db.commit()

    return {
        "message": (
            f"Password for user "
            f"{user.username} has been reset"
        )
    }


@router.patch("/auth/change-password")
async def change_my_password(
    payload: ChangePasswordIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not pwd_context.verify(
        payload.current_password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Current password is incorrect"
            ),
        )

    validate_password(
        payload.new_password
    )

    if pwd_context.verify(
        payload.new_password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "New password must be different"
            ),
        )

    user.hashed_password = (
        pwd_context.hash(
            payload.new_password
        )
    )

    await db.commit()

    return {
        "message": "Password updated"
    }


@router.patch("/auth/users/{user_id}/studies")
async def update_user_studies(
    user_id: int,
    payload: UserStudiesUpdate,
    _admin: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(
            User.id == user_id
        )
    )

    user = (
        result.scalars()
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    cleaned: list[str] = []
    seen: set[str] = set()

    for study_id in payload.studies:
        normalized = (
            study_id or ""
        ).strip()

        if not normalized:
            continue

        if normalized in seen:
            continue

        seen.add(
            normalized
        )
        cleaned.append(
            normalized
        )

    user.studies = cleaned

    await db.commit()
    await db.refresh(user)

    return {
        "message": (
            f"Studies updated for user "
            f"{user.username}"
        ),
        "user": serialize_user(
            user
        ),
    }