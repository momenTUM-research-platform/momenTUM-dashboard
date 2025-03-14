import json
import os
import re
from fastapi import APIRouter, HTTPException
from pymongo import MongoClient

router = APIRouter()

# Get the MongoDB connection string and database name from environment variables.
MONGO_URL = os.getenv("MONGO_URL")
if not MONGO_URL:
    raise Exception("MONGO_URL is not set in environment variables")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_DB:
    raise Exception("MONGO_DB is not set in environment variables")

# Create a MongoDB client and select the database and collection.
client = MongoClient(MONGO_URL)
db = client[MONGO_DB]
# Change "responses" to the actual collection name if different.
collection = db["responses"]

@router.get("/study-id={study_id}")
def get_study_responses(study_id: str):
    """
    Retrieve and render all responses for a given study_id.
    Searches for documents where the "raw" field contains the study_id,
    then parses the JSON string in "raw" and groups the results by user_id.
    """
    try:
        # regex that matches the substring: "study_id":"<study_id>"
        pattern = rf'"study_id":"{study_id}"'
        regex = re.compile(pattern)
        query = {"raw": {"$regex": regex}}
        docs = list(collection.find(query))
        print("Using regex pattern:", pattern)
        if not docs:
            raise HTTPException(status_code=404, detail=f"No responses found for study_id {study_id}")
        
        # Group responses by user_id
        grouped = {}
        for doc in docs:
            raw_data = doc.get("raw")
            if raw_data:
                try:
                    parsed = json.loads(raw_data)
                    user_id = parsed.get("user_id", "unknown")
                    if user_id not in grouped:
                        grouped[user_id] = []
                    grouped[user_id].append(parsed)
                except Exception as e:
                    continue
        
        return {"study_id": study_id, "grouped_responses": grouped}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
