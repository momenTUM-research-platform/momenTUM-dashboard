"""
Endpoint to retrieve and group study responses hierarchically.
This endpoint supports two kinds of response documents:
  - Documents with a "raw" field (a JSON string) that contains survey data.
  - Documents where survey data is stored directly in the "responses" field.
In both cases, it:
  - Parses the responses,
  - Retrieves the study document from the "studies" collection,
  - Builds a mapping of modules, sections, and questions,
  - Groups responses by user_id, then by module (using module_id), then by section,
  - Maps each question's answer to its corresponding question text.
Documents with a module_id not found in the study mapping are grouped under "unknown_module" for later inspection.
"""

import json
import os
import re
from fastapi import APIRouter, HTTPException
from pymongo import MongoClient

router = APIRouter()

# Retrieve MongoDB connection details from environment variables.
MONGO_URL = os.getenv("MONGO_URL")
if not MONGO_URL:
    raise Exception("MONGO_URL is not set in environment variables")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_DB:
    raise Exception("MONGO_DB is not set in environment variables")

# Create a MongoDB client and select the database.
client = MongoClient(MONGO_URL)
db = client[MONGO_DB]

# Define the collections.
responses_collection = db["responses"]
studies_collection = db["studies"]

@router.get("/studies_responses_grouped/{study_id}")
def get_grouped_study_responses(study_id: str):
    try:
        # Build a regex to match the study_id in documents.
        pattern = rf'"study_id":"{study_id}"'
        regex = re.compile(pattern)
        query = {"$or": [
            {"raw": {"$regex": regex}},
            {"study_id": {"$regex": regex}}
        ]}
        response_docs = list(responses_collection.find(query))
        if not response_docs:
            raise HTTPException(status_code=404, detail=f"No responses found for study_id {study_id}")
        
        # Retrieve the study document from the studies collection.
        study_doc = studies_collection.find_one({"properties.study_id": study_id})
        if not study_doc:
            raise HTTPException(status_code=404, detail=f"Study document not found for study_id {study_id}")

        # Build a mapping of modules from the study document.
        modules_mapping = {}
        modules = study_doc.get("modules", [])
        for module in modules:
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
            # Attempt to parse survey data from the document.
            if "raw" in doc and isinstance(doc["raw"], str):
                try:
                    parsed_response = json.loads(doc["raw"])
                except Exception:
                    parsed_response = doc
            else:
                parsed_response = doc

            user_id = parsed_response.get("user_id", "unknown")
            mod_id = parsed_response.get("module_id")
            if not mod_id:
                continue  # Skip documents without a module_id

            # Retrieve the nested responses.
            answers = parsed_response.get("responses", {})
            if isinstance(answers, str):
                try:
                    answers = json.loads(answers)
                except Exception:
                    answers = {}

            if user_id not in grouped:
                grouped[user_id] = {}

            if mod_id in modules_mapping:
                if mod_id not in grouped[user_id]:
                    grouped[user_id][mod_id] = {
                        "module_name": modules_mapping[mod_id]["module_name"],
                        "sections": {}
                    }
                module_sections = modules_mapping[mod_id].get("sections", {})
                for sec_idx, sec_data in module_sections.items():
                    if sec_idx not in grouped[user_id][mod_id]["sections"]:
                        grouped[user_id][mod_id]["sections"][sec_idx] = {
                            "section_name": sec_data["section_name"],
                            "qa": {}
                        }
                    for qid, qtext in sec_data["questions"].items():
                        if qid in answers:
                            grouped[user_id][mod_id]["sections"][sec_idx]["qa"][qtext] = answers[qid]
            else:
                # Fallback for responses without a matching module mapping.
                fallback_module_name = parsed_response.get("module_name", "Unknown Module")
                if "unknown_module" not in grouped[user_id]:
                    grouped[user_id]["unknown_module"] = {
                        "module_name": fallback_module_name,
                        "raw_responses": []
                    }
                grouped[user_id]["unknown_module"]["raw_responses"].append(parsed_response)
        
        return {"study_id": study_id, "grouped_responses": grouped}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
