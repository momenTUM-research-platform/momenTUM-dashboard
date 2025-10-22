from __future__ import annotations

import os, json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query
from pymongo import MongoClient, DESCENDING, ASCENDING

from schemas import LabeledSurveyResponseOut, QuestionAnswer

router = APIRouter()

# Mongo
MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_URL or not MONGO_DB:
    raise RuntimeError("Missing MONGO_URL/MONGO_DB")

client = MongoClient(MONGO_URL)
db = client[MONGO_DB]
responses_col = db["responses"]
studies_col = db["studies"]


# Helpers
def _dt(v: Any) -> Optional[datetime]:
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        s = v.replace("Z", "+00:00") if v.endswith("Z") else v
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return None
    return None

def _parse_responses(v: Any) -> Dict[str, Any]:
    if isinstance(v, dict):
        return v
    if isinstance(v, str):
        try:
            obj = json.loads(v)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}
    return {}

def _index_questions(study_doc: Optional[dict]) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    if not study_doc:
        return out
    for m in (study_doc.get("modules") or []):
        mid = m.get("id")
        if not mid:
            continue
        qmap: Dict[str, str] = {}
        params = m.get("params") or {}
        sections = params.get("sections") or []
        for sec in sections:
            for q in (sec.get("questions") or []):
                qid = q.get("id")
                if qid:
                    qmap[qid] = q.get("text")
        out[mid] = qmap
    return out

def _explode(values: Optional[List[str]]) -> Optional[List[str]]:
    if not values:
        return None
    out: List[str] = []
    for v in values:
        out.extend([s for s in v.split(",") if s])
    return out or None

def _parse_pairs(pairs: List[str]) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for p in pairs:
        if ":" in p:
            k, v = p.split(":", 1)
            k, v = k.strip(), v.strip()
            if k and v:
                out.append((k, v))
    return out


# Facets (for filters)
@router.get("/studies/{study_id}/responses:facets")
def list_response_facets(
    study_id: str,
    user_id: List[str] | None = Query(default=None),
    module_id: List[str] | None = Query(default=None),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
):
    users = _explode(user_id)
    modules = _explode(module_id)

    q: Dict[str, Any] = {"study_id": study_id}
    if users:
        q["user_id"] = {"$in": users}
    if modules:
        q["module_id"] = {"$in": modules}
    if from_ or to:
        dr: Dict[str, Any] = {}
        if from_:
            dt = _dt(from_)
            if dt:
                dr["$gte"] = dt.isoformat()
        if to:
            dt = _dt(to)
            if dt:
                dr["$lte"] = dt.isoformat()
        if dr:
            q["response_time"] = dr

    users_out = sorted(set(responses_col.distinct("user_id", q)))

    pipeline = [
        {"$match": q},
        {"$group": {"_id": {"id": "$module_id", "name": "$module_name"}}},
        {"$project": {"_id": 0, "id": "$_id.id", "name": "$_id.name"}},
    ]
    mods_out = list(responses_col.aggregate(pipeline))
    mods_out.sort(key=lambda m: (m.get("name") or "", m.get("id") or ""))

    return {"users": users_out, "modules": mods_out}


# Labeled responses + filters + paging
@router.get("/studies/{study_id}/responses:labeled", response_model=List[LabeledSurveyResponseOut])
def list_study_responses_labeled(
    study_id: str,
    user_id: Optional[List[str]] = Query(default=None, description="repeatable or comma-separated"),
    module_id: Optional[List[str]] = Query(default=None, description="repeatable or comma-separated"),
    from_: Optional[str] = Query(default=None, alias="from", description="ISO datetime"),
    to: Optional[str] = Query(default=None, description="ISO datetime"),
    match: List[str] = Query(default=[], description="repeat qid:value for exact match"),
    contains: List[str] = Query(default=[], description="repeat qid:substring"),
    sort: str = Query(default="desc", regex="^(asc|desc)$"),
    skip: int = 0,
    limit: int = 100,
):
    users = _explode(user_id)
    modules = _explode(module_id)

    q: Dict[str, Any] = {"study_id": study_id}
    if users:
        q["user_id"] = {"$in": users}
    if modules:
        q["module_id"] = {"$in": modules}
    if from_ or to:
        dr: Dict[str, Any] = {}
        if from_:
            dfrom = _dt(from_)
            if dfrom:
                dr["$gte"] = dfrom.isoformat()
        if to:
            dto = _dt(to)
            if dto:
                dr["$lte"] = dto.isoformat()
        if dr:
            q["response_time"] = dr

    sort_dir = DESCENDING if sort == "desc" else ASCENDING
    _skip = max(0, skip)
    _limit = max(1, min(1000, limit))

    docs = list(
        responses_col.find(
            q,
            projection={
                "_id": 0,
                "data_type": 1,
                "user_id": 1,
                "study_id": 1,
                "module_index": 1,
                "platform": 1,
                "module_id": 1,
                "module_name": 1,
                "responses": 1,
                "response_time": 1,
                "alert_time": 1,
            },
        )
        .sort([("response_time", sort_dir)])
        .skip(_skip)
        .limit(_limit)
    )

    if not docs:
        return []

    study_doc = studies_col.find_one(
        {"properties.study_id": study_id},
        projection={"_id": 0, "modules": 1},
    )
    q_index = _index_questions(study_doc)

    exact_pairs = _parse_pairs(match)
    contains_pairs = _parse_pairs(contains)

    out: List[LabeledSurveyResponseOut] = []
    for d in docs:
        resp_map = _parse_responses(d.get("responses"))

        if exact_pairs and any(str(resp_map.get(qid, "")) != v for qid, v in exact_pairs):
            continue
        if contains_pairs and any(substr not in str(resp_map.get(qid, "")) for qid, substr in contains_pairs):
            continue

        mid = d.get("module_id") or "unknown_module"
        rt = _dt(d.get("response_time")) or datetime.utcnow()
        qmap = q_index.get(mid, {})

        answers = [
            QuestionAnswer(question_id=qid, question_text=qmap.get(qid), answer=ans)
            for qid, ans in resp_map.items()
        ]

        out.append(
            LabeledSurveyResponseOut(
                data_type=d.get("data_type", "survey_response"),
                user_id=d["user_id"],
                study_id=d["study_id"],
                module_index=d.get("module_index"),
                platform=d.get("platform"),
                module_id=mid,
                module_name=d.get("module_name") or "Unknown Module",
                responses=resp_map,
                response_time=rt,
                alert_time=_dt(d.get("alert_time")),
                answers=answers,
            )
        )

    return out