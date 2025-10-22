from fastapi import FastAPI, Depends, Body, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
import os
import json
import re
from bson import ObjectId
from pymongo import MongoClient
import logging
logging.basicConfig(level=logging.INFO)

from auth import router as auth_router, oauth2_scheme, SECRET_KEY, ALGORITHM, pwd_context
from database import get_db
from crud import get_user_by_username
from studies_test import router as studies_test_router
from studies_responses_grouped import router as responses_grouped
from partial_search import router as partial_search_studies
from routers.studies_responses_v2 import router as responses_v2_router
from routers.studies_responses_labeled import router as responses_labeled_router

app = FastAPI()

# Include routers from separate modules.
app.include_router(auth_router, prefix="/api")
app.include_router(studies_test_router, prefix="/api")
app.include_router(responses_grouped, prefix="/api")
app.include_router(partial_search_studies, prefix="/api")
app.include_router(responses_v2_router, prefix="/api")
app.include_router(responses_labeled_router, prefix="/api")

# Set up MongoDB connection (used only for the /api/studies endpoint).
MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_URL or not MONGO_DB:
    raise Exception("MongoDB connection details are missing.")
client = MongoClient(MONGO_URL)
db_mongo = client[MONGO_DB]
studies_collection = db_mongo["studies"]

def admin_required(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials"
        )

@app.get("/api/hello")
def read_root():
    return {"message": "Hello from FastAPI"}

@app.get("/api/dashboard")
async def get_dashboard_data(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Return the raw list of saved study IDs.
    user_study_ids = user.studies or []
    return {
        "surveys": user_study_ids,
        "user_stats": {
            "last_login": "2025-02-24T15:30:00Z",
            "notifications": 2,
        },
        "info": "Real data for demonstration purposes."
    }

@app.get("/api/studies")
def get_all_studies():
    # Fetch studies from MongoDB.
    studies = list(studies_collection.find({}))
    # Convert ObjectIds and extract needed fields.
    def convert_doc(doc):
        return {
            "id": doc.get("id", ""),  # study IDs are strings
            "title": doc.get("title", "Untitled Study"),
            "description": doc.get("description", "")
        }
    return [convert_doc(s) for s in studies]

@app.post("/api/user/studies")
async def add_user_studies(
    study_ids: list[str] = Body(..., embed=True),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_studies = user.studies or []
    logging.info(f"Before merge: {current_studies}")
    for study in study_ids:
        if study not in current_studies:
            current_studies.append(study)
    logging.info(f"After merge: {current_studies}")
    user.studies = current_studies
    
    await db.commit()
    await db.refresh(user)
    return {"username": username, "studies": user.studies}

@app.delete("/api/user/studies")
async def delete_user_study(
    study_id: str = Body(..., embed=True),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_studies = user.studies or []
    if study_id in current_studies:
        current_studies.remove(study_id)
        user.studies = current_studies
        await db.commit()
        await db.refresh(user)
        return {"username": username, "studies": user.studies}
    else:
        raise HTTPException(status_code=404, detail="Study not found in profile")