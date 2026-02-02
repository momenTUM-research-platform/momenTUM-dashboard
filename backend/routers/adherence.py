from __future__ import annotations

import os
from datetime import datetime, date
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from pymongo import MongoClient, ASCENDING

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    from backports.zoneinfo import ZoneInfo  # type: ignore

from auth import require_study_access
from models import User
from services.adherence_schedule import expand_study_schedule

router = APIRouter(prefix="/v2/adherence", tags=["adherence"])

MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")
if not MONGO_URL or not MONGO_DB:
    raise RuntimeError("Missing MONGO_URL/MONGO_DB")

client = MongoClient(MONGO_URL)
db = client[MONGO_DB]
studies_col = db["studies"]
responses_col = db["responses"]


class OccurrenceOut(BaseModel):
    module_id: str
    module_name: str
    date: str
    start: str
    end: str


class ModuleMeta(BaseModel):
    module_id: str
    module_name: str
    repeat: str
    sticky: bool


class StructureCountOut(BaseModel):
    study_days: int
    per_module: Dict[str, int]
    per_module_meta: Dict[str, ModuleMeta]
    total: int
    max_offset_days: int


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


def _parse_dt(v: Any) -> Optional[datetime]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=ZoneInfo("UTC"))
    if isinstance(v, str):
        try:
            dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=ZoneInfo("UTC"))
        except Exception:
            return None
    return None


def _earliest_baseline_dt_for_user(study_id: str, user_id: str) -> Optional[datetime]:
    cur = responses_col.find(
        {"study_id": study_id, "user_id": user_id},
        projection={"_id": 0, "alert_time": 1, "response_time": 1},
    ).sort([("alert_time", ASCENDING), ("response_time", ASCENDING)]).limit(50)

    best: Optional[datetime] = None
    for doc in cur:
        cand = _parse_dt(doc.get("alert_time")) or _parse_dt(doc.get("response_time"))
        if cand is None:
            continue
        if best is None or cand < best:
            best = cand
    return best


def _infer_study_days_from_structure(study: Dict[str, Any]) -> int:
    daily_days: list[int] = []
    for m in study.get("modules") or []:
        alerts = m.get("alerts") or {}
        if (alerts.get("repeat") or "").lower() != "daily":
            continue
        rc = alerts.get("repeatCount", None)
        if rc is None:
            continue
        try:
            rc_int = int(rc)
        except Exception:
            continue
        daily_days.append(max(1, rc_int + 1))
    return max(daily_days) if daily_days else 7


def _times_len(alerts: Dict[str, Any]) -> int:
    ts = alerts.get("times") or ["12:00:00"]
    return len(ts)


def _daily_occurrences_per_day(alerts: Dict[str, Any]) -> int:
    times = alerts.get("times") or []
    offset_time = alerts.get("offsetTime")

    def norm(x: Any) -> str:
        return str(x).strip()

    uniq = {norm(t) for t in times if norm(t)}
    if offset_time:
        uniq.add(norm(offset_time))

    return len(uniq) if uniq else 1


@router.get("/expected", response_model=List[OccurrenceOut])
def expected_windows(
    study_id: str = Query(...),
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    tz: Optional[str] = Query("UTC"),
    user_id: Optional[str] = Query(None),
    _user: User = Depends(require_study_access),
):
    zone = _ensure_tz(tz)
    start_date = _to_date(from_, zone)
    end_date = _to_date(to, zone)
    if end_date < start_date:
        raise HTTPException(400, "'to' must be >= 'from'")

    study = _fetch_study(study_id)

    baseline_local_date: Optional[date] = None
    if user_id:
        baseline_dt = _earliest_baseline_dt_for_user(study_id, user_id)
        if baseline_dt:
            baseline_local_date = baseline_dt.astimezone(zone).date()

    occs = expand_study_schedule(
        study,
        start_date,
        end_date,
        zone,
        baseline_local_date=baseline_local_date,
    )
    return [OccurrenceOut(**o.__dict__) for o in occs]


@router.get("/structure-count", response_model=StructureCountOut)
def structure_count(
    study_id: str = Query(...),
    include_one_off: bool = Query(True),
    exclude_module_ids: Optional[str] = Query(None),
    _user: User = Depends(require_study_access),
):
    study = _fetch_study(study_id)
    study_days = _infer_study_days_from_structure(study)

    exclude: set[str] = set()
    if exclude_module_ids:
        exclude = {s.strip() for s in exclude_module_ids.split(",") if s.strip()}

    per_module: Dict[str, int] = {}
    per_module_meta: Dict[str, ModuleMeta] = {}
    total = 0

    max_offset_days = 0

    for mod in study.get("modules") or []:
        mid = mod.get("id")
        if not mid or mid in exclude:
            continue

        name = (mod.get("name") or mid).strip()
        alerts = mod.get("alerts") or {}
        try:
            od = int(alerts.get("offsetDays", 0))
        except Exception:
            od = 0
        if od > max_offset_days:
            max_offset_days = od
        repeat = (alerts.get("repeat") or "").lower()
        sticky = bool(alerts.get("sticky", False))

        if repeat == "daily":
            count = study_days * (1 if sticky else _daily_occurrences_per_day(alerts))
        elif repeat == "never":
            count = (1 if sticky else _times_len(alerts)) if include_one_off else 0
        else:
            count = 0

        per_module[mid] = count
        per_module_meta[mid] = ModuleMeta(
            module_id=mid,
            module_name=name,
            repeat=repeat,
            sticky=sticky,
        )
        total += count

    return StructureCountOut(
        study_days=study_days,
        per_module=per_module,
        per_module_meta=per_module_meta,
        total=total,
        max_offset_days=max_offset_days,
    )