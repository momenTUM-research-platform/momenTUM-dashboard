from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, List

from dotenv import load_dotenv
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, func, update
from sqlalchemy.exc import IntegrityError

from crud import delete_user, get_user_by_username, pwd_context
from database import get_db
from models import User, AccountInvitation, UserAccessAudit
from schemas.user import UserInvite, UserUpdate, AccountStatus, PasswordSetup, InvitationDelivery
from services.email import MailDeliveryError, send_invitation
from schemas import UserCreate


load_dotenv()

def disable_auth_cache(response: Response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


router = APIRouter(dependencies=[Depends(disable_auth_cache)])


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
    "uppercase, lowercase, and a number (maximum 72 UTF-8 bytes)."
)


class UserStudiesUpdate(BaseModel):
    studies: List[str]


def validate_password(password: str) -> None:
    if len(password.encode("utf-8")) > 72 or not PASSWORD_PATTERN.fullmatch(password):
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
        "is_active": user.is_active,
        "password_set": user.password_set,
    }


async def get_current_user(
    request: Request,
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
            options={"require_exp": True},
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

    if (not user or not user.is_active or not user.password_set
            or payload.get("ver", 0) != user.session_version
            or ("uid" in payload and payload["uid"] != user.id)):
        raise credentials_exception

    actor_id = payload.get("actor_id")
    if actor_id is not None:
        actor = await db.get(User, actor_id)
        audit = await db.get(UserAccessAudit, payload.get("audit_id"))
        if (user.role == "admin" or not actor or actor.role != "admin" or not actor.is_active
                or payload.get("actor_ver") != actor.session_version
                or not audit or audit.ended_at is not None
                or audit.actor_id != actor.id or audit.target_id != user.id):
            raise credentials_exception
        if request.method not in {"GET", "HEAD", "OPTIONS"} and request.url.path != "/api/auth/preview/end":
            raise HTTPException(status_code=403, detail="User preview is read-only")
        request.state.preview = {"actor_id": actor.id, "audit_id": audit.id}

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
        or not user.is_active
        or not user.password_set
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
            "ver": user.session_version,
            "uid": user.id,
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
    request: Request,
    user: User = Depends(get_current_user),
):
    return {**serialize_user(user), "preview": getattr(request.state, "preview", None)}


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

    await ensure_email_available(db, str(request.email))
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

    new_user = User(**user_data, session_version=1)

    db.add(new_user)

    await commit_account(db)
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
    _admin: User = Depends(admin_required),
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
    user = await locked_user(db, user_id)

    if (
        user.username.lower() == "admin" or user.id == _admin.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Cannot delete the primary admin user"
            ),
        )

    await db.execute(delete(AccountInvitation).where(AccountInvitation.user_id == user.id))

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
    update: UserUpdate,
    _admin: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    update_data = update.dict(exclude_unset=True)
    if any(value is None for value in update_data.values()):
        raise HTTPException(status_code=400, detail="Account fields cannot be null")

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update",
        )

    user = await locked_user(db, user_id)

    if "email" in update_data:
        await ensure_email_available(db, str(update_data["email"]), user.id)
        if str(update_data["email"]) != user.email:
            await invalidate_invitations(db, user.id)

    for (
        key,
        value,
    ) in update_data.items():
        setattr(
            user,
            key,
            value,
        )

    await commit_account(db)
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

    user = await locked_user(db, user_id)
    user.hashed_password = pwd_context.hash(new_password)
    user.password_set = True
    user.session_version += 1
    await invalidate_invitations(db, user.id)
    await db.commit()

    return {
        "message": (
            f"Password for user "
            f"{user.username} has been reset"
        )
    }


@router.patch("/auth/change-password")
async def change_my_password(user: User = Depends(get_current_user)):
    raise HTTPException(status_code=403, detail="Contact your administrator to change your password")


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

async def ensure_email_available(db: AsyncSession, email: str, user_id: int | None = None):
    result = await db.execute(select(User).where(func.lower(User.email) == email.lower()))
    if any(user.id != user_id for user in result.scalars().all()):
        raise HTTPException(status_code=409, detail="Email is already in use")


async def locked_user(db: AsyncSession, user_id: int) -> User:
    result = await db.execute(select(User).where(User.id == user_id).with_for_update()
                              .execution_options(populate_existing=True))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def invalidate_invitations(db: AsyncSession, user_id: int):
    await db.execute(update(AccountInvitation).where(
        AccountInvitation.user_id == user_id, AccountInvitation.used_at.is_(None)
    ).values(used_at=datetime.now(timezone.utc)))


async def issue_invitation(db: AsyncSession, user: User, purpose: str, delivery: str = "email"):
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Reactivate the account before sending a link")
    await invalidate_invitations(db, user.id)
    token = secrets.token_urlsafe(32)
    invitation = AccountInvitation(
        user_id=user.id, token_hash=hashlib.sha256(token.encode()).hexdigest(),
        purpose=purpose, expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(invitation)
    await db.commit()
    if delivery == "link":
        return {
            "message": "Setup link created",
            "user": serialize_user(user),
            "setup_path": f"/set-password#token={token}",
            "expires_at": invitation.expires_at.isoformat(),
        }
    try:
        await send_invitation(user.email, user.username, token, purpose)
    except MailDeliveryError as exc:
        await db.execute(update(AccountInvitation).where(AccountInvitation.id == invitation.id)
                         .values(used_at=datetime.now(timezone.utc)))
        await db.commit()
        raise HTTPException(status_code=502, detail=f"Account saved. {exc}")
    return {"message": "Email sent", "user": serialize_user(user)}


@router.post("/auth/invite-user")
async def invite_user(payload: UserInvite, _admin: User = Depends(admin_required),
                      db: AsyncSession = Depends(get_db)):
    if await get_user_by_username(db, payload.username):
        raise HTTPException(status_code=409, detail="Username already exists")
    await ensure_email_available(db, str(payload.email))
    user = User(**payload.dict(exclude={"delivery"}), session_version=1, hashed_password=pwd_context.hash(secrets.token_urlsafe(32)),
                password_set=False, studies=[])
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already in use")
    return await issue_invitation(db, user, "invite", payload.delivery)


@router.post("/auth/users/{user_id}/invitation")
async def resend_invitation(user_id: int, payload: InvitationDelivery = Body(default=InvitationDelivery()), _admin: User = Depends(admin_required),
                            db: AsyncSession = Depends(get_db)):
    user = await locked_user(db, user_id)
    if user.password_set:
        raise HTTPException(status_code=400, detail="Use a password reset for an active account")
    return await issue_invitation(db, user, "invite", payload.delivery)


@router.post("/auth/users/{user_id}/reset-invitation")
async def send_reset_invitation(user_id: int, payload: InvitationDelivery = Body(default=InvitationDelivery()), _admin: User = Depends(admin_required),
                                db: AsyncSession = Depends(get_db)):
    user = await locked_user(db, user_id)
    return await issue_invitation(db, user, "reset", payload.delivery)


@router.post("/auth/set-password")
async def set_password(payload: PasswordSetup, db: AsyncSession = Depends(get_db)):
    digest = hashlib.sha256(payload.token.encode()).hexdigest()
    result = await db.execute(select(AccountInvitation.user_id).where(AccountInvitation.token_hash == digest))
    user_id = result.scalar_one_or_none()
    if user_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired link")
    user = await locked_user(db, user_id)
    now = datetime.now(timezone.utc)
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired link")
    validate_password(payload.password)
    result = await db.execute(update(AccountInvitation).where(
        AccountInvitation.token_hash == digest, AccountInvitation.used_at.is_(None),
        AccountInvitation.expires_at > now,
    ).values(used_at=now))
    if result.rowcount != 1:
        raise HTTPException(status_code=400, detail="Invalid or expired link")
    user.hashed_password = pwd_context.hash(payload.password)
    user.password_set = True
    user.session_version += 1
    await invalidate_invitations(db, user.id)
    await db.commit()
    return {"message": "Password saved. Sign in with your username and new password."}


@router.patch("/auth/users/{user_id}/status")
async def set_account_status(user_id: int, payload: AccountStatus,
                             admin: User = Depends(admin_required), db: AsyncSession = Depends(get_db)):
    user = await locked_user(db, user_id)
    if user.id == admin.id or user.username.lower() == "admin":
        raise HTTPException(status_code=403, detail="Cannot suspend this administrator")
    if user.is_active != payload.is_active:
        user.is_active = payload.is_active
        user.session_version += 1
        await invalidate_invitations(db, user.id)
    await db.commit()
    return {"user": serialize_user(user)}


@router.post("/auth/users/{user_id}/preview")
async def start_preview(user_id: int, admin: User = Depends(admin_required),
                        db: AsyncSession = Depends(get_db)):
    user = await locked_user(db, user_id)
    if user.role == "admin" or not user.is_active or not user.password_set:
        raise HTTPException(status_code=400, detail="Only active researcher accounts can be previewed")
    expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    audit = UserAccessAudit(actor_id=admin.id, target_id=user.id, expires_at=expires)
    db.add(audit)
    await db.commit()
    token = create_access_token({"sub": user.username, "ver": user.session_version, "uid": user.id,
                                 "actor_id": admin.id, "actor_ver": admin.session_version,
                                 "audit_id": audit.id}, timedelta(minutes=15))
    return {"access_token": token}


@router.post("/auth/preview/end")
async def end_preview(request: Request, _user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    preview = getattr(request.state, "preview", None)
    if not preview:
        raise HTTPException(status_code=400, detail="No preview session")
    await db.execute(update(UserAccessAudit).where(UserAccessAudit.id == preview["audit_id"])
                     .values(ended_at=datetime.now(timezone.utc)))
    await db.commit()
    return {"message": "Preview ended"}


async def commit_account(db: AsyncSession):
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already in use")
