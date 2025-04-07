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

        matching_studies = list(studies_collection.find({"properties.study_id": study_id}))
        if not matching_studies:
            raise HTTPException(status_code=404, detail=f"No study documents found for study_id {study_id}")

        module_to_study_map = {}
        for mod_id in encountered_module_ids:
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
                    continue
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
                            answer = responses_data[q_id]
                            answer_entry = {"answer": answer, "response_time": response_time}
                            if q_text not in grouped[user_id][mod_id]["sections"][sec_key]["qa"]:
                                grouped[user_id][mod_id]["sections"][sec_key]["qa"][q_text] = []
                            grouped[user_id][mod_id]["sections"][sec_key]["qa"][q_text].append(answer_entry)
            else:
                if "unknown_module" not in grouped[user_id]:
                    grouped[user_id]["unknown_module"] = {
                        "module_name": module_name,
                        "raw_responses": []
                    }
                grouped[user_id]["unknown_module"]["raw_responses"].append(doc)

        # Extract Study ID for each user
        for user_id, modules in grouped.items():
            extracted_study_id = None
            for key, mod in modules.items():
                if key == "extracted_study_id":
                    continue
                if mod.get("module_name", "").strip() == "Study ID" and "sections" in mod:
                    section0 = mod["sections"].get("0")
                    if section0 and section0.get("qa"):
                        answers = []
                        for ans in section0["qa"].values():
                            if isinstance(ans, list):
                                answers.extend(ans)
                            else:
                                answers.append(ans)
                        if answers:
                            extracted_study_id = str(answers[0].get("answer") or answers[0]).strip()
                            break
            modules["extracted_study_id"] = extracted_study_id or "Unknown"

        return convert_object_ids({
            "study_id": study_id,
            "grouped_responses": grouped
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))