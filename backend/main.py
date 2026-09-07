from typing import Any

import logging
import os

from fastapi import Body, Depends, FastAPI, HTTPException
from pymongo import MongoClient
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, router as auth_router
from database import get_db
from models import User
from partial_search import router as partial_search_studies
from routers.adherence import router as adherence_router
from routers.events import router as events_router
from routers.studies_responses_labeled import router as responses_labeled_router
from routers.studies_responses_v2 import router as responses_v2_router
from studies_responses_grouped import router as responses_grouped
from studies_test import router as studies_test_router
from routers.calendar_notes import router as calendar_notes_router


logging.basicConfig(level=logging.INFO)

app = FastAPI()


# Routers

app.include_router(auth_router, prefix="/api")
app.include_router(studies_test_router, prefix="/api")
app.include_router(responses_grouped, prefix="/api")
app.include_router(partial_search_studies, prefix="/api")
app.include_router(responses_v2_router, prefix="/api")
app.include_router(responses_labeled_router, prefix="/api")
app.include_router(adherence_router, prefix="/api")
app.include_router(events_router, prefix="/api")
app.include_router(calendar_notes_router, prefix="/api")


# MongoDB

MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")

if not MONGO_URL or not MONGO_DB:
    raise RuntimeError(
        "MongoDB connection details are missing "
        "(MONGO_URL/MONGO_DB)."
    )

client = MongoClient(MONGO_URL)
db_mongo = client[MONGO_DB]

studies_collection = db_mongo["studies"]


def _study_summary(
    document: dict[str, Any],
) -> dict[str, str]:
    properties = document.get("properties") or {}

    study_id = (
        properties.get("study_id")
        or document.get("study_id")
        or document.get("id")
        or ""
    )

    study_name = (
        properties.get("study_name")
        or document.get("study_name")
        or document.get("title")
        or study_id
        or "Untitled study"
    )

    return {
        "study_id": str(study_id),
        "study_name": str(study_name),
    }


def _find_study_summary(
    study_id: str,
) -> dict[str, str] | None:
    document = studies_collection.find_one(
        {
            "properties.study_id": study_id,
        },
        projection={
            "_id": 0,
            "properties.study_id": 1,
            "properties.study_name": 1,
        },
    )

    if not document:
        return None

    return _study_summary(document)


@app.get("/api/hello")
def read_root():
    return {
        "message": "Hello from FastAPI",
    }


@app.get("/api/dashboard")
async def get_dashboard_data(
    user: User = Depends(get_current_user),
):
    user_study_ids = user.studies or []

    studies = []

    if user_study_ids:
        documents = studies_collection.find(
            {
                "properties.study_id": {
                    "$in": user_study_ids,
                }
            },
            projection={
                "_id": 0,
                "properties.study_id": 1,
                "properties.study_name": 1,
            },
        )

        summaries_by_id = {
            summary["study_id"]: summary
            for document in documents
            if (
                summary := _study_summary(
                    document
                )
            )["study_id"]
        }

        # Preserve the order stored on the user's profile.
        # If a study document is missing, still expose the ID
        # so the dashboard does not silently hide profile data.
        for study_id in user_study_ids:
            studies.append(
                summaries_by_id.get(
                    study_id,
                    {
                        "study_id": study_id,
                        "study_name": study_id,
                    },
                )
            )

    return {
        "surveys": studies,
        "user_stats": {
            "last_login": "2025-02-24T15:30:00Z",
            "notifications": 2,
        },
        "info": "Real data for demonstration purposes.",
    }


@app.get("/api/studies")
def get_all_studies(
    _user: User = Depends(
        get_current_user
    ),
):
    documents = studies_collection.find(
        {},
        projection={
            "_id": 0,
            "properties.study_id": 1,
            "properties.study_name": 1,
            "properties.instructions": 1,
        },
    )

    studies = []

    for document in documents:
        properties = (
            document.get("properties")
            or {}
        )

        summary = _study_summary(
            document
        )

        if not summary["study_id"]:
            continue

        studies.append(
            {
                "id": summary["study_id"],
                "title": summary["study_name"],
                "description": (
                    properties.get(
                        "instructions"
                    )
                    or ""
                ),
            }
        )

    return sorted(
        studies,
        key=lambda study: (
            study["title"].lower(),
            study["id"].lower(),
        ),
    )


@app.get(
    "/api/studies/{study_id}/metadata"
)
def get_study_metadata(
    study_id: str,
    _user: User = Depends(
        get_current_user
    ),
):
    summary = _find_study_summary(
        study_id
    )

    if not summary:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Study '{study_id}' "
                "was not found."
            ),
        )

    return summary


@app.post("/api/user/studies")
async def add_user_studies(
    study_ids: list[str] = Body(
        ...,
        embed=True,
    ),
    user: User = Depends(
        get_current_user
    ),
    db: AsyncSession = Depends(
        get_db
    ),
):
    current_studies = list(
        user.studies or []
    )

    for study_id in study_ids:
        if study_id not in current_studies:
            current_studies.append(
                study_id
            )

    user.studies = current_studies

    await db.commit()
    await db.refresh(user)

    return {
        "username": user.username,
        "studies": user.studies,
    }


@app.delete("/api/user/studies")
async def delete_user_study(
    study_id: str = Body(
        ...,
        embed=True,
    ),
    user: User = Depends(
        get_current_user
    ),
    db: AsyncSession = Depends(
        get_db
    ),
):
    current_studies = list(
        user.studies or []
    )

    if study_id not in current_studies:
        raise HTTPException(
            status_code=404,
            detail=(
                "Study not found "
                "in profile"
            ),
        )

    current_studies.remove(
        study_id
    )

    user.studies = current_studies

    await db.commit()
    await db.refresh(user)

    return {
        "username": user.username,
        "studies": user.studies,
    }