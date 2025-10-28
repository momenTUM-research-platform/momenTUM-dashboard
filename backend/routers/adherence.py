from __future__ import annotations
import os
from datetime import datetime, date
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from pymongo import MongoClient, ASCENDING

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    from backports.zoneinfo import ZoneInfo  # type: ignore

from services.adherence_schedule import expand_study_schedule

router = APIRouter(prefix="/v2/adherence", tags=["adherence"])

# --- Mongo ---
MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_URL or not MONGO_DB:
    raise RuntimeError("Missing MONGO_URL/MONGO_DB")

client = MongoClient(MONGO_URL)
db = client[MONGO_DB]
studies_col = db["studies"]
responses_col = db["responses"]

# --- Models ---
class OccurrenceOut(BaseModel):
    module_id: str
    module_name: str
    date: str
    start: str
    end: str

class StructureCountOut(BaseModel):
    study_days: int
    per_module: Dict[str, int]
    total: int

# --- Helpers ---
def _to_date(s: str, tz: ZoneInfo) -> date:
    try:
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            y, m, d = int(s[:4]), int(s[5:7]), int(s[8:10])
            return date(y, m, d)
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(tz).date()
    except Exception:
        raise HTTPException(400, f"Bad date: {s}")

def _ensure_tz(tz_name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name) if tz_name else ZoneInfo("UTC")
    except Exception:
        raise HTTPException(400, f"Unknown timezone: {tz_name}")

def _fetch_study(study_id: str) -> Dict[str, Any]:
    doc = studies_col.find_one({"properties.study_id": study_id})
    if not doc:
        raise HTTPException(404, f"Study '{study_id}' not found")
    return doc

def _earliest_response_dt_for_user(study_id: str, user_id: str) -> Optional[datetime]:
    cur = responses_col.find(
        {"study_id": study_id, "user_id": user_id, "response_time": {"$ne": None}},
        projection={"_id": 0, "response_time": 1},
    ).sort([("response_time", ASCENDING)]).limit(1)
    first = next(cur, None)
    if not first:
        return None
    rt = first.get("response_time")
    if isinstance(rt, datetime):
        return rt if rt.tzinfo else rt.replace(tzinfo=ZoneInfo("UTC"))
    if isinstance(rt, str):
        try:
            dt = datetime.fromisoformat(rt.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=ZoneInfo("UTC"))
        except Exception:
            return None
    return None

def _infer_study_days_from_structure(study: Dict[str, Any]) -> int:
    """
    Infer active daily length from JSON only.
    1) If there is a 'never' module named like end-of-EMA, use offsetDays - 1.
    2) Else use max offsetDays among 'never' modules minus 1.
    3) Fallback to 7.
    """
    modules = study.get("modules") or []

    for m in modules:
        alerts = m.get("alerts") or {}
        if (alerts.get("repeat") or "").lower() == "never":
            name = (m.get("name") or "").lower()
            if "end" in name and "ema" in name:
                try:
                    off = int(alerts.get("offsetDays", 0))
                except Exception:
                    off = 0
                return max(1, off - 1)

    # Otherwise, use the max offsetDays of any 'never' module
    max_off = None
    for m in modules:
        alerts = m.get("alerts") or {}
        if (alerts.get("repeat") or "").lower() == "never":
            try:
                off = int(alerts.get("offsetDays", 0))
            except Exception:
                off = 0
            max_off = off if max_off is None else max(max_off, off)
    if max_off is not None:
        return max(1, max_off - 1)

    return 7

def _times_len(alerts: Dict[str, Any]) -> int:
    ts = alerts.get("times") or ["12:00:00"]
    return len(ts)

# --- Routes ---
@router.get("/expected", response_model=List[OccurrenceOut])
def expected_windows(
    study_id: str = Query(..., description="Study ID"),
    from_: str = Query(..., alias="from", description="YYYY-MM-DD or ISO"),
    to: str = Query(..., description="YYYY-MM-DD or ISO"),
    tz: Optional[str] = Query("UTC", description="IANA TZ, e.g. Europe/Berlin"),
    user_id: Optional[str] = Query(None, description="Anchor one-offs using this user's earliest response date"),
):
    """
    Expected instances within [from,to] in TZ.
    - Daily: expanded per day (sticky => 1/day, non-sticky => per time).
    - Never: anchored at expectedEnrollmentDate OR user's baseline (earliest response local date) if user_id provided.
    """
    zone = _ensure_tz(tz)
    start_date = _to_date(from_, zone)
    end_date = _to_date(to, zone)
    if end_date < start_date:
        raise HTTPException(400, "'to' must be >= 'from'")

    study = _fetch_study(study_id)

    baseline_local_date: Optional[date] = None
    if user_id:
        first_dt = _earliest_response_dt_for_user(study_id, user_id)
        if first_dt:
            baseline_local_date = first_dt.astimezone(zone).date()

    occs = expand_study_schedule(
        study,
        start_date,
        end_date,
        zone,
        baseline_local_date=baseline_local_date,  # services must accept this kwarg
    )
    return [OccurrenceOut(**o.__dict__) for o in occs]

@router.get("/structure-count", response_model=StructureCountOut)
def structure_count(
    study_id: str = Query(..., description="Study ID"),
    include_one_off: bool = Query(
        True, description='Include repeat:"never" modules (1 each if sticky; else per time)'
    ),
    exclude_module_ids: Optional[str] = Query(
        None, description="Comma-separated module IDs to exclude"
    ),
):
    """
    Fixed expected counts derived solely from the study JSON:
    - Daily:
        sticky -> 1 per day
        non-sticky -> len(times) per day
      multiplied by inferred study_days.
    - One-offs (never):
        sticky -> 1 total (if included)
        non-sticky -> len(times) total (if included)
    """
    study = _fetch_study(study_id)
    study_days = _infer_study_days_from_structure(study)

    exclude: set[str] = set()
    if exclude_module_ids:
        exclude = {s.strip() for s in exclude_module_ids.split(",") if s.strip()}

    per_module: Dict[str, int] = {}
    total = 0

    for mod in (study.get("modules") or []):
        mid = mod.get("id")
        if not mid or mid in exclude:
            continue

        alerts = mod.get("alerts") or {}
        repeat = (alerts.get("repeat") or "").lower()
        sticky = bool(alerts.get("sticky", False))

        if repeat == "daily":
            count = study_days * (1 if sticky else _times_len(alerts))
        elif repeat == "never":
            if not include_one_off:
                count = 0
            else:
                count = 1 if sticky else _times_len(alerts)
        else:
            count = 0

        per_module[mid] = count
        total += count

    return StructureCountOut(study_days=study_days, per_module=per_module, total=total)