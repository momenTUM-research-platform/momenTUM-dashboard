import json
from fastapi import APIRouter, HTTPException
from pymongo import MongoClient
import os
import re 

router = APIRouter()

# Get the MongoDB connection string from environment variables.
# Make sure this connection string points to correct SSH tunnel (e.g., using host.docker.internal:27018)
MONGO_URL = os.getenv("MONGO_URL")
if not MONGO_URL:
    raise Exception("MONGO_URL is not set in environment variables")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_DB:
    raise Exception("MONGO_DB is not set in environment variables")

# Create a MongoDB client
client = MongoClient(MONGO_URL)
db = client[MONGO_DB]
collection = db["responses"]

@router.get("/{study_id}")
def get_study_responses(study_id: str):
    """
    Retrieve and render all responses for a given study_id.
    This function searches for documents where the "raw" field contains the study_id,
    then parses the JSON string in "raw" and returns the results.
    """
    try:
        # Regex query to match the study_id within the "raw" field.
        # This assumes the raw JSON string contains something like "study_id":"test_ecosleep_ema"
        pattern = rf'"study_id":"{study_id}"'
        regex = re.compile(pattern)
        query = {"raw": {"$regex": regex}}
        docs = list(collection.find(query))
        print("Using regex pattern:", pattern)
        if not docs:
            raise HTTPException(status_code=404, detail=f"No responses found for study_id {study_id}")
        
        responses = []
        for doc in docs[:5]:
            raw_data = doc.get("raw")
            if raw_data:
                try:
                    parsed = json.loads(raw_data)
                    responses.append(parsed)
                except Exception as e:
                    continue
        
        return {"study_id": study_id, "responses": responses}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))