from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ASCENDING, MongoClient

from auth import require_study_access
from models import User
from schemas.events import EventOut, ParticipantEventsOut


router = APIRouter(
    prefix="/v2/events",
    tags=["events"],
)


MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")

if not MONGO_URL or not MONGO_DB:
    raise RuntimeError("Missing MONGO_URL/MONGO_DB")


client = MongoClient(MONGO_URL)
db = client[MONGO_DB]

events_col = db["events"]


@router.get(
    "/participant",
    response_model=ParticipantEventsOut,
)
def participant_events(
    study_id: str = Query(...),
    user_id: str = Query(...),
    event_type: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    _user: User = Depends(require_study_access),
):
    query = {
        "study_id": study_id,
        "user_id": user_id,
    }

    if event_type:
        query["event_type"] = event_type

    cursor = (
        events_col.find(query)
        .sort("timestamp", ASCENDING)
        .limit(limit)
    )

    events = []

    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["metadata"] = doc.get("metadata") or {}

        timestamp = doc.get("timestamp")

        # MongoDB stores dates as UTC, but PyMongo may return
        # them as timezone-naive datetime objects.
        if (
            isinstance(timestamp, datetime)
            and timestamp.tzinfo is None
        ):
            doc["timestamp"] = timestamp.replace(
                tzinfo=timezone.utc
            )

        try:
            events.append(EventOut(**doc))
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Failed to parse event "
                    f"{doc.get('_id')}: {exc}"
                ),
            )

    return ParticipantEventsOut(
        study_id=study_id,
        user_id=user_id,
        events=events,
    )