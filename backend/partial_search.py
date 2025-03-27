import os
import re
from fastapi import APIRouter, HTTPException
from pymongo import MongoClient
from bson import ObjectId


MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")

if not MONGO_URL or not MONGO_DB:
    raise Exception("MongoDB connection details are missing.")

client = MongoClient(MONGO_URL)
db = client[MONGO_DB]
responses_collection = db["responses"]
studies_collection = db["studies"]

router = APIRouter()
@router.get("/studies_suggestions")
def get_studies_suggestions(query: str):
    try:
        # Build a case-insensitive regex for partial matching
        regex = re.compile(query, re.IGNORECASE)
        # Search both the study_id and the study name inside properties
        suggestions = list(studies_collection.find(
            {"$or": [
                {"properties.study_id": regex},
                {"properties.name": regex}
            ]}
        ))
        # Return a simple list with study_id and name for suggestions
        suggestions = [
            {"study_id": s.get("properties", {}).get("study_id"), "name": s.get("properties", {}).get("name")}
            for s in suggestions
        ]
        return suggestions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))