"""
Endpoint to retrieve and group study responses hierarchically.

This endpoint supports two response formats:
  1. Documents containing a "raw" field (a JSON string), which are parsed
     and merged into the top-level document.
  2. Documents with key fields already at the top level.

The endpoint:
  - Parses the "raw" field (if present) and merges its contents.
  - Retrieves the study document from the "studies" collection to build a mapping
    of modules, sections, and questions.
  - Groups responses by user_id, then by module (using module_id), then by section,
    mapping each question's answer to its corresponding question text.
  - For responses without a matching module, groups them under "unknown_module".
  - Converts any MongoDB ObjectIds into strings for JSON serialization.
"""

import json
import os
import re
from fastapi import APIRouter, HTTPException
from pymongo import MongoClient
from bson import ObjectId

router = APIRouter()

# Retrieve MongoDB connection details from environment variables.
MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_URL or not MONGO_DB:
    raise Exception("MongoDB connection details are missing in environment variables.")

# Initialize MongoDB client and collections.
client = MongoClient(MONGO_URL)
db = client[MONGO_DB]
responses_collection = db["responses"]
studies_collection = db["studies"]

def convert_object_ids(obj):
    """
    Recursively convert ObjectId instances to strings.
    """
    if isinstance(obj, dict):
        return {k: convert_object_ids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_object_ids(item) for item in obj]
    elif isinstance(obj, ObjectId):
        return str(obj)
    else:
        return obj

@router.get("/studies_responses_grouped/{study_id}")
def get_grouped_study_responses(study_id: str):
    try:
        # Build a regex to search for study_id in the "raw" field.
        pattern = rf'"study_id":"{study_id}"'
        regex = re.compile(pattern)
        query = {"$or": [{"raw": {"$regex": regex}}, {"study_id": study_id}]}
        response_docs = list(responses_collection.find(query))
        if not response_docs:
            raise HTTPException(status_code=404, detail=f"No responses found for study_id {study_id}")
        
        # Retrieve the study document.
        study_doc = studies_collection.find_one({"properties.study_id": study_id})
        if not study_doc:
            raise HTTPException(status_code=404, detail=f"Study document not found for study_id {study_id}")
        
        # Build a mapping of modules from the study document.
        modules_mapping = {}
        for module in study_doc.get("modules", []):
            mod_id = module.get("id")
            if not mod_id:
                continue
            module_name = module.get("name", "Unknown Module")
            sections_list = module.get("params", {}).get("sections", [])
            sections_mapping = {}
            for idx, section in enumerate(sections_list):
                section_name = section.get("name", f"Section {idx + 1}")
                questions = section.get("questions", [])
                questions_mapping = {}
                for question in questions:
                    q_id = question.get("id")
                    q_text = question.get("text", "No question text")
                    if q_id:
                        questions_mapping[q_id] = q_text
                sections_mapping[str(idx)] = {"section_name": section_name, "questions": questions_mapping}
            modules_mapping[mod_id] = {"module_name": module_name, "sections": sections_mapping}

        # Group responses by user_id, then by module.
        grouped = {}
        for doc in response_docs:
            # If the document contains a "raw" field, parse and merge its contents.
            if "raw" in doc and isinstance(doc["raw"], str):
                try:
                    parsed = json.loads(doc["raw"])
                    doc.update(parsed)
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Error parsing raw field: {e}")
            parsed_response = doc

            user_id = parsed_response.get("user_id", "unknown")
            mod_id = parsed_response.get("module_id") or "unknown_module"
            # Process the responses field (parse if necessary).
            responses_data = parsed_response.get("responses", {})
            if isinstance(responses_data, str):
                try:
                    responses_data = json.loads(responses_data)
                except Exception:
                    responses_data = {}

            response_time = parsed_response.get("response_time", "Unknown")

            if user_id not in grouped:
                grouped[user_id] = {}

            if mod_id in modules_mapping:
                if mod_id not in grouped[user_id]:
                    grouped[user_id][mod_id] = {"module_name": modules_mapping[mod_id]["module_name"], "sections": {}}
                for sec_idx, sec_data in modules_mapping[mod_id]["sections"].items():
                    if sec_idx not in grouped[user_id][mod_id]["sections"]:
                        grouped[user_id][mod_id]["sections"][sec_idx] = {"section_name": sec_data["section_name"], "qa": {}, "response_time": response_time}
                    for qid, qtext in sec_data["questions"].items():
                        if qid in responses_data:
                            grouped[user_id][mod_id]["sections"][sec_idx]["qa"][qtext] = responses_data[qid]
            else:
                # Fallback for responses with no matching module mapping.
                if "unknown_module" not in grouped[user_id]:
                    fallback_module_name = parsed_response.get("module_name", "Unknown Module")
                    grouped[user_id]["unknown_module"] = {"module_name": fallback_module_name, "raw_responses": []}
                grouped[user_id]["unknown_module"]["raw_responses"].append(parsed_response)

        # Convert any ObjectId instances to strings.
        result = {"study_id": study_id, "grouped_responses": grouped}
        return convert_object_ids(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))