import json
import os
import re
from fastapi import APIRouter, HTTPException
from pymongo import MongoClient
from bson import ObjectId

router = APIRouter()

MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")

if not MONGO_URL or not MONGO_DB:
    raise Exception("MongoDB connection details are missing.")

client = MongoClient(MONGO_URL)
db = client[MONGO_DB]
responses_collection = db["responses"]
studies_collection = db["studies"]

def convert_object_ids(obj):
    if isinstance(obj, dict):
        return {k: convert_object_ids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_object_ids(i) for i in obj]
    elif isinstance(obj, ObjectId):
        return str(obj)
    return obj

@router.get("/studies_responses_grouped/{study_id}")
def get_grouped_study_responses(study_id: str):
    try:
        # Fetch responses
        pattern = rf'"study_id":"{study_id}"'
        regex = re.compile(pattern)
        query = {"$or": [{"raw": {"$regex": regex}}, {"study_id": study_id}]}
        response_docs = list(responses_collection.find(query))
        if not response_docs:
            raise HTTPException(status_code=404, detail=f"No responses found for study_id {study_id}")

        # Parse raw fields and extract module_ids
        parsed_responses = []
        encountered_module_ids = set()

        for doc in response_docs:
            if "raw" in doc and isinstance(doc["raw"], str):
                try:
                    raw_data = json.loads(doc["raw"])
                    doc.update(raw_data)
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Error parsing raw field: {e}")
            parsed_responses.append(doc)
            if "module_id" in doc:
                encountered_module_ids.add(doc["module_id"])

        # Fetch all study documents with matching study_id
        matching_studies = list(studies_collection.find({"properties.study_id": study_id}))
        if not matching_studies:
            raise HTTPException(status_code=404, detail=f"No study documents found for study_id {study_id}")

        # Build a mapping: module_id → latest study_doc that contains it
        module_to_study_map = {}
        for mod_id in encountered_module_ids:
            # Find all studies that include this module
            studies_with_module = [
                s for s in matching_studies if any(m.get("id") == mod_id for m in s.get("modules", []))
            ]
            if studies_with_module:
                latest = max(studies_with_module, key=lambda s: s.get("timestamp", 0))
                module_to_study_map[mod_id] = latest

        grouped = {}

        for doc in parsed_responses:
            user_id = doc.get("user_id", "unknown")
            mod_id = doc.get("module_id") or "unknown_module"
            module_name = doc.get("module_name", "Unknown Module")
            response_time = doc.get("response_time", "Unknown")

            # Parse responses field if it's a string
            responses_data = doc.get("responses", {})
            if isinstance(responses_data, str):
                try:
                    responses_data = json.loads(responses_data)
                except Exception:
                    responses_data = {}

            if user_id not in grouped:
                grouped[user_id] = {}

            if mod_id in module_to_study_map:
                study_doc = module_to_study_map[mod_id]
                module = next((m for m in study_doc.get("modules", []) if m.get("id") == mod_id), None)
                if not module:
                    continue  # Should not happen

                sections = module.get("params", {}).get("sections", [])
                if mod_id not in grouped[user_id]:
                    grouped[user_id][mod_id] = {
                        "module_name": module.get("name", "Unknown Module"),
                        "sections": {}
                    }

                for idx, section in enumerate(sections):
                    sec_key = str(idx)
                    section_name = section.get("name", f"Section {idx + 1}")
                    questions = section.get("questions", [])
                    if sec_key not in grouped[user_id][mod_id]["sections"]:
                        grouped[user_id][mod_id]["sections"][sec_key] = {
                            "section_name": section_name,
                            "qa": {},
                            "response_time": response_time
                        }
                    for q in questions:
                        q_id = q.get("id")
                        q_text = q.get("text", "No question text")
                        if q_id and q_id in responses_data:
                            grouped[user_id][mod_id]["sections"][sec_key]["qa"][q_text] = responses_data[q_id]
            else:
                # Raw fallback if module mapping isn't found
                if "unknown_module" not in grouped[user_id]:
                    grouped[user_id]["unknown_module"] = {
                        "module_name": module_name,
                        "raw_responses": []
                    }
                grouped[user_id]["unknown_module"]["raw_responses"].append(doc)

        return convert_object_ids({
            "study_id": study_id,
            "grouped_responses": grouped
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))