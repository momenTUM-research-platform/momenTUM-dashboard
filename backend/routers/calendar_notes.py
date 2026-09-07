from __future__ import annotations

import os

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from pymongo import (
    ASCENDING,
    MongoClient,
)

from auth import require_study_access
from models import User
from schemas.calendar_notes import (
    CalendarNoteCreate,
    CalendarNoteOut,
    CalendarNoteUpdate,
)


router = APIRouter(
    prefix="/v2/calendar-notes",
    tags=["calendar notes"],
)


MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")

if not MONGO_URL or not MONGO_DB:
    raise RuntimeError(
        "Missing MONGO_URL/MONGO_DB"
    )


client = MongoClient(MONGO_URL)
db = client[MONGO_DB]

notes_col = db["calendar_notes"]


# Efficient lookup by study and calendar range.
notes_col.create_index(
    [
        ("study_id", ASCENDING),
        ("date", ASCENDING),
    ]
)

# Efficient lookup for participant-specific notes.
notes_col.create_index(
    [
        ("study_id", ASCENDING),
        ("user_id", ASCENDING),
        ("date", ASCENDING),
    ]
)


def _clean_text(
    value: str,
) -> str:
    text = value.strip()

    if not text:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail="Note text cannot be empty.",
        )

    return text


def _normalize_user_id(
    value: str | None,
) -> str | None:
    if value is None:
        return None

    normalized = value.strip()

    return normalized or None


def _parse_object_id(
    note_id: str,
) -> ObjectId:
    if not ObjectId.is_valid(note_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar note not found.",
        )

    return ObjectId(note_id)


def _serialize_note(
    doc: dict,
) -> CalendarNoteOut:
    return CalendarNoteOut(
        id=str(doc["_id"]),
        study_id=doc["study_id"],
        date=doc["date"],
        user_id=doc.get("user_id"),
        text=doc["text"],
        created_by=doc["created_by"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


@router.get(
    "",
    response_model=list[CalendarNoteOut],
)
def list_calendar_notes(
    study_id: str = Query(...),
    user_id: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    _user: User = Depends(
        require_study_access
    ),
):
    query: dict = {
        "study_id": study_id,
    }

    if user_id is not None:
        normalized_user_id = (
            _normalize_user_id(user_id)
        )

        query["user_id"] = (
            normalized_user_id
        )

    if from_date or to_date:
        date_query: dict = {}

        if from_date:
            date_query["$gte"] = from_date

        if to_date:
            date_query["$lte"] = to_date

        query["date"] = date_query

    cursor = (
        notes_col.find(query)
        .sort(
            [
                ("date", ASCENDING),
                ("created_at", ASCENDING),
            ]
        )
    )

    return [
        _serialize_note(doc)
        for doc in cursor
    ]


@router.post(
    "",
    response_model=CalendarNoteOut,
    status_code=status.HTTP_201_CREATED,
)
def create_calendar_note(
    payload: CalendarNoteCreate,
    study_id: str = Query(...),
    current_user: User = Depends(
        require_study_access
    ),
):
    now = datetime.now(timezone.utc)

    doc = {
        "study_id": study_id,
        "date": payload.date.isoformat(),
        "user_id": _normalize_user_id(
            payload.user_id
        ),
        "text": _clean_text(
            payload.text
        ),
        "created_by": current_user.username,
        "created_at": now,
        "updated_at": now,
    }

    result = notes_col.insert_one(doc)

    doc["_id"] = result.inserted_id

    return _serialize_note(doc)


@router.patch(
    "/{note_id}",
    response_model=CalendarNoteOut,
)
def update_calendar_note(
    note_id: str,
    payload: CalendarNoteUpdate,
    study_id: str = Query(...),
    current_user: User = Depends(
        require_study_access
    ),
):
    object_id = _parse_object_id(
        note_id
    )

    existing = notes_col.find_one(
        {
            "_id": object_id,
            "study_id": study_id,
        }
    )

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar note not found.",
        )

    is_owner = (
        existing.get("created_by")
        == current_user.username
    )

    is_admin = (
        current_user.role == "admin"
    )

    if not is_owner and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You can only edit your own notes."
            ),
        )

    notes_col.update_one(
        {
            "_id": object_id,
            "study_id": study_id,
        },
        {
            "$set": {
                "text": _clean_text(
                    payload.text
                ),
                "updated_at": datetime.now(
                    timezone.utc
                ),
            }
        },
    )

    updated = notes_col.find_one(
        {
            "_id": object_id,
            "study_id": study_id,
        }
    )

    if not updated:
        raise HTTPException(
            status_code=500,
            detail=(
                "Calendar note could not be reloaded."
            ),
        )

    return _serialize_note(updated)


@router.delete(
    "/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_calendar_note(
    note_id: str,
    study_id: str = Query(...),
    current_user: User = Depends(
        require_study_access
    ),
):
    object_id = _parse_object_id(
        note_id
    )

    existing = notes_col.find_one(
        {
            "_id": object_id,
            "study_id": study_id,
        }
    )

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar note not found.",
        )

    is_owner = (
        existing.get("created_by")
        == current_user.username
    )

    is_admin = (
        current_user.role == "admin"
    )

    if not is_owner and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You can only delete your own notes."
            ),
        )

    notes_col.delete_one(
        {
            "_id": object_id,
            "study_id": study_id,
        }
    )

    return None