from __future__ import annotations

import os
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from pymongo import MongoClient, DESCENDING

from auth import require_study_access
from models import User
from schemas import SurveyResponseOut

router = APIRouter()

# MongoDB setup
MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_URL or not MONGO_DB:
    raise RuntimeError("Missing MONGO_URL/MONGO_DB")

client = MongoClient(MONGO_URL)
db = client[MONGO_DB]
responses_col = db["responses"]
studies_col = db["studies"]

_NUM_RE = re.compile(r"[-+]?\d+(\.\d+)?")
_INT_RE = re.compile(r"[-+]?\d+")


def _ensure_dt(v: Any) -> Optional[datetime]:
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        s = v.replace("Z", "+00:00") if v.endswith("Z") else v
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return None
    return None


def _parse_responses(val: Any) -> Dict[str, Any]:
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            obj = json.loads(val)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}
    return {}


@router.get("/studies/{study_id}/responses", response_model=List[SurveyResponseOut])
def list_study_responses(
    study_id: str,
    _user: User = Depends(require_study_access),
):
    docs = list(
        responses_col.find(
            {"study_id": study_id},
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
        ).sort([("response_time", DESCENDING)])
    )

    if not docs:
        raise HTTPException(status_code=404, detail=f"No responses for '{study_id}'")

    out: List[SurveyResponseOut] = []
    for d in docs:
        out.append(
            SurveyResponseOut(
                data_type=d.get("data_type"),
                user_id=d["user_id"],
                study_id=d["study_id"],
                module_index=d.get("module_index"),
                platform=d.get("platform"),
                module_id=d.get("module_id"),
                module_name=d.get("module_name"),
                responses=_parse_responses(d.get("responses")),
                response_time=_ensure_dt(d.get("response_time")),
                alert_time=_ensure_dt(d.get("alert_time")),
            )
        )

    return out


@router.get("/studies/{study_id}/questions")
def list_study_questions(
    study_id: str,
    _user: User = Depends(require_study_access),
):
    study_doc = studies_col.find_one(
        {"properties.study_id": study_id},
        projection={"_id": 0, "modules": 1},
    )

    if not study_doc:
        return []

    tag_re = re.compile(r"<[^>]+>")
    num_re = re.compile(r"([-+]?\d+(\.\d+)?)")

    def strip_html(s: str) -> str:
        return tag_re.sub("", s).strip()

    def infer_multi_numeric(options: list) -> Optional[Dict[str, float]]:
        if not options:
            return None

        parsed: List[Optional[float]] = []
        labels: List[str] = []

        for opt in options:
            txt = strip_html(str(opt))
            labels.append(txt)
            m = num_re.search(txt)
            parsed.append(float(m.group(1)) if m else None)

        if all(v is None for v in parsed):
            return None

        mapping: Dict[str, float] = {}
        for idx, (val, lbl) in enumerate(zip(parsed, labels)):
            score = float(idx) if val is None else float(val)
            mapping[str(idx)] = score
            mapping[lbl] = score
            mapping[str(int(score))] = score
            if not score.is_integer():
                mapping[str(score)] = score

        return mapping

    out = []
    for m in study_doc.get("modules") or []:
        mid = m.get("id")
        mname = m.get("name") or m.get("title") or "Unnamed module"
        params = m.get("params") or {}

        for sec in params.get("sections") or []:
            for q in sec.get("questions") or []:
                qid = q.get("id")
                if not qid:
                    continue

                qtype = q.get("type")
                subtype = q.get("subtype")
                qtext = q.get("text") or q.get("label") or qid

                is_schema_numeric = (
                    qtype == "number" or (qtype == "text" and subtype == "numeric")
                )

                option_map = None
                if qtype == "multi":
                    option_map = infer_multi_numeric(q.get("options") or [])

                out.append(
                    {
                        "module_id": mid,
                        "module_name": mname,
                        "question_id": qid,
                        "question_text": qtext,
                        "type": qtype,
                        "subtype": subtype,
                        "is_numeric": bool(is_schema_numeric or option_map),
                        "option_map": option_map or {},
                    }
                )

    out.sort(
        key=lambda x: (
            x.get("module_name") or "",
            x.get("question_text") or "",
            x.get("module_id") or "",
            x.get("question_id") or "",
        )
    )

    return out


@router.get("/studies/{study_id}/user-mapping")
def user_mapping(
    study_id: str,
    module_id: str = Query(...),
    question_id: str = Query(...),
    mode: str = Query("latest", regex="^(latest|earliest)$"),
    _user: User = Depends(require_study_access),
):
    cursor = responses_col.find(
        {"study_id": study_id, "module_id": module_id},
        projection={"_id": 0, "user_id": 1, "responses": 1, "response_time": 1},
    )

    by_user: Dict[str, Dict[str, Any]] = {}

    for d in cursor:
        resp_map = _parse_responses(d.get("responses"))
        if question_id not in resp_map:
            continue

        rt = _ensure_dt(d.get("response_time"))
        if not rt:
            continue

        current = by_user.get(d["user_id"])
        if not current:
            by_user[d["user_id"]] = {"rt": rt, "val": resp_map[question_id]}
        else:
            if mode == "latest" and rt > current["rt"]:
                current.update(rt=rt, val=resp_map[question_id])
            elif mode == "earliest" and rt < current["rt"]:
                current.update(rt=rt, val=resp_map[question_id])

    return {uid: data["val"] for uid, data in by_user.items()}