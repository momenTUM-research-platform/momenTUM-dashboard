from fastapi import FastAPI, Depends, Body, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pymongo import MongoClient
import os
import logging

from auth import router as auth_router, get_current_user
from database import get_db
from models import User
from studies_test import router as studies_test_router
from studies_responses_grouped import router as responses_grouped
from partial_search import router as partial_search_studies
from routers.studies_responses_v2 import router as responses_v2_router
from routers.studies_responses_labeled import router as responses_labeled_router
from routers.adherence import router as adherence_router

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

# MongoDB (used for /api/studies)
MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_URL or not MONGO_DB:
    raise RuntimeError("MongoDB connection details are missing (MONGO_URL/MONGO_DB).")

client = MongoClient(MONGO_URL)
db_mongo = client[MONGO_DB]
studies_collection = db_mongo["studies"]


@app.get("/api/hello")
def read_root():
    return {"message": "Hello from FastAPI"}


@app.get("/api/dashboard")
async def get_dashboard_data(
    user: User = Depends(get_current_user),
):
    user_study_ids = user.studies or []
    return {
        "surveys": user_study_ids,
        "user_stats": {
            "last_login": "2025-02-24T15:30:00Z",
            "notifications": 2,
        },
        "info": "Real data for demonstration purposes.",
    }


@app.get("/api/studies")
def get_all_studies(
    _user: User = Depends(get_current_user),
):
    studies = list(studies_collection.find({}))

    def convert_doc(doc):
        return {
            "id": doc.get("id", ""),
            "title": doc.get("title", "Untitled Study"),
            "description": doc.get("description", ""),
        }

    return [convert_doc(s) for s in studies]


@app.post("/api/user/studies")
async def add_user_studies(
    study_ids: list[str] = Body(..., embed=True),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_studies = user.studies or []

    for study_id in study_ids:
        if study_id not in current_studies:
            current_studies.append(study_id)

    user.studies = current_studies
    await db.commit()
    await db.refresh(user)

    return {"username": user.username, "studies": user.studies}


@app.delete("/api/user/studies")
async def delete_user_study(
    study_id: str = Body(..., embed=True),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_studies = user.studies or []

    if study_id not in current_studies:
        raise HTTPException(status_code=404, detail="Study not found in profile")

    current_studies.remove(study_id)
    user.studies = current_studies

    await db.commit()
    await db.refresh(user)

    return {"username": user.username, "studies": user.studies}