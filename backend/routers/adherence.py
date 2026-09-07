from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from pymongo import MongoClient

try:
    from zoneinfo import ZoneInfo
except Exception:
    from backports.zoneinfo import ZoneInfo

from auth import require_study_access
from models import User
from services.adherence_schedule import expand_study_schedule


router = APIRouter(
    prefix="/v2/adherence",
    tags=["adherence"],
)


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
    schedule_span_days: int


def _safe_int(
    value: Any,
    default: int,
) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _to_date(
    value: str,
    tz: ZoneInfo,
) -> date:
    try:
        if (
            len(value) == 10
            and value[4] == "-"
            and value[7] == "-"
        ):
            return date(
                int(value[:4]),
                int(value[5:7]),
                int(value[8:10]),
            )

        return (
            datetime.fromisoformat(
                value.replace(
                    "Z",
                    "+00:00",
                )
            )
            .astimezone(tz)
            .date()
        )

    except Exception:
        raise HTTPException(
            status_code=400,
            detail=f"Bad date: {value}",
        )


def _ensure_tz(
    tz_name: Optional[str],
) -> ZoneInfo:
    try:
        return (
            ZoneInfo(tz_name)
            if tz_name
            else ZoneInfo("UTC")
        )

    except Exception:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown timezone: {tz_name}",
        )


def _fetch_study(
    study_id: str,
) -> Dict[str, Any]:
    document = studies_col.find_one(
        {
            "properties.study_id": study_id,
        }
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail=f"Study '{study_id}' not found",
        )

    return document


def _parse_dt(
    value: Any,
) -> Optional[datetime]:
    if value is None:
        return None

    if isinstance(value, datetime):
        if value.tzinfo:
            return value

        return value.replace(
            tzinfo=ZoneInfo("UTC")
        )

    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(
                value.replace(
                    "Z",
                    "+00:00",
                )
            )

            if parsed.tzinfo:
                return parsed

            return parsed.replace(
                tzinfo=ZoneInfo("UTC")
            )

        except Exception:
            return None

    return None


def _earliest_baseline_dt_for_user(
    study_id: str,
    user_id: str,
) -> Optional[datetime]:
    cursor = responses_col.find(
        {
            "study_id": study_id,
            "user_id": user_id,
        },
        projection={
            "_id": 0,
            "alert_time": 1,
            "response_time": 1,
        },
    )

    earliest: Optional[datetime] = None

    for document in cursor:
        candidate = (
            _parse_dt(
                document.get("alert_time")
            )
            or _parse_dt(
                document.get("response_time")
            )
        )

        if candidate is None:
            continue

        if (
            earliest is None
            or candidate < earliest
        ):
            earliest = candidate

    return earliest


def _norm_time_str(
    value: Any,
) -> Optional[str]:
    if value is None:
        return None

    normalized = str(value).strip()

    return (
        normalized
        if normalized
        else None
    )


def _unique_times_count(
    alerts: Dict[str, Any],
) -> int:
    values = set()

    for value in (
        alerts.get("times")
        or []
    ):
        normalized = _norm_time_str(
            value
        )

        if normalized:
            values.add(
                normalized
            )

    offset_time = _norm_time_str(
        alerts.get("offsetTime")
    )

    if offset_time:
        values.add(
            offset_time
        )

    return (
        len(values)
        if values
        else 1
    )


def _module_schedule_count(
    alerts: Dict[str, Any],
    include_one_off: bool,
) -> int:
    repeat = str(
        alerts.get("repeat")
        or ""
    ).lower()

    sticky = bool(
        alerts.get(
            "sticky",
            False,
        )
    )

    time_count = (
        1
        if sticky
        else _unique_times_count(
            alerts
        )
    )

    if repeat == "daily":
        repeat_count = max(
            0,
            _safe_int(
                alerts.get(
                    "repeatCount",
                    0,
                ),
                0,
            ),
        )

        scheduled_days = (
            repeat_count + 1
        )

        return (
            scheduled_days
            * time_count
        )

    if repeat == "never":
        if not include_one_off:
            return 0

        return time_count

    return 0


def _module_last_offset_day(
    alerts: Dict[str, Any],
) -> int:
    repeat = str(
        alerts.get("repeat")
        or ""
    ).lower()

    offset_days = max(
        0,
        _safe_int(
            alerts.get(
                "offsetDays",
                0,
            ),
            0,
        ),
    )

    if repeat == "never":
        return offset_days

    if repeat != "daily":
        return offset_days

    interval_days = max(
        1,
        _safe_int(
            alerts.get(
                "interval",
                1,
            ),
            1,
        ),
    )

    repeat_count = max(
        0,
        _safe_int(
            alerts.get(
                "repeatCount",
                0,
            ),
            0,
        ),
    )

    return (
        offset_days
        + (
            repeat_count
            * interval_days
        )
    )


def _infer_study_days_from_structure(
    study: Dict[str, Any],
) -> int:
    longest_daily_run = 0

    for module in (
        study.get("modules")
        or []
    ):
        alerts = (
            module.get("alerts")
            or {}
        )

        repeat = str(
            alerts.get("repeat")
            or ""
        ).lower()

        if repeat != "daily":
            continue

        repeat_count = max(
            0,
            _safe_int(
                alerts.get(
                    "repeatCount",
                    0,
                ),
                0,
            ),
        )

        longest_daily_run = max(
            longest_daily_run,
            repeat_count + 1,
        )

    return (
        longest_daily_run
        if longest_daily_run > 0
        else 7
    )


@router.get(
    "/expected",
    response_model=List[OccurrenceOut],
)
def expected_windows(
    study_id: str = Query(...),
    from_: str = Query(
        ...,
        alias="from",
    ),
    to: str = Query(...),
    tz: Optional[str] = Query(
        "UTC"
    ),
    user_id: Optional[str] = Query(
        None
    ),
    _user: User = Depends(
        require_study_access
    ),
):
    zone = _ensure_tz(
        tz
    )

    start_date = _to_date(
        from_,
        zone,
    )

    end_date = _to_date(
        to,
        zone,
    )

    if (
        end_date <
        start_date
    ):
        raise HTTPException(
            status_code=400,
            detail="'to' must be >= 'from'",
        )

    study = _fetch_study(
        study_id
    )

    baseline_local_date: Optional[date] = None

    if user_id:
        baseline_dt = (
            _earliest_baseline_dt_for_user(
                study_id,
                user_id,
            )
        )

        if baseline_dt:
            baseline_local_date = (
                baseline_dt
                .astimezone(
                    zone
                )
                .date()
            )

    occurrences = expand_study_schedule(
        study,
        start_date,
        end_date,
        zone,
        baseline_local_date=(
            baseline_local_date
        ),
    )

    return [
        OccurrenceOut(
            **occurrence.__dict__
        )
        for occurrence
        in occurrences
    ]


@router.get(
    "/structure-count",
    response_model=StructureCountOut,
)
def structure_count(
    study_id: str = Query(...),
    include_one_off: bool = Query(
        True
    ),
    exclude_module_ids: Optional[str] = Query(
        None
    ),
    _user: User = Depends(
        require_study_access
    ),
):
    study = _fetch_study(
        study_id
    )

    study_days = _infer_study_days_from_structure(
        study
    )

    excluded: set[str] = set()

    if exclude_module_ids:
        excluded = {
            value.strip()
            for value
            in exclude_module_ids.split(",")
            if value.strip()
        }

    per_module: Dict[str, int] = {}

    per_module_meta: Dict[
        str,
        ModuleMeta,
    ] = {}

    total = 0
    max_offset_days = 0
    last_schedule_offset = 0

    for module in (
        study.get("modules")
        or []
    ):
        module_id = module.get(
            "id"
        )

        if (
            not module_id
            or module_id in excluded
        ):
            continue

        module_name = str(
            module.get("name")
            or module_id
        ).strip()

        alerts = (
            module.get("alerts")
            or {}
        )

        repeat = str(
            alerts.get("repeat")
            or ""
        ).lower()

        sticky = bool(
            alerts.get(
                "sticky",
                False,
            )
        )

        offset_days = max(
            0,
            _safe_int(
                alerts.get(
                    "offsetDays",
                    0,
                ),
                0,
            ),
        )

        max_offset_days = max(
            max_offset_days,
            offset_days,
        )

        last_schedule_offset = max(
            last_schedule_offset,
            _module_last_offset_day(
                alerts
            ),
        )

        count = _module_schedule_count(
            alerts,
            include_one_off,
        )

        per_module[
            module_id
        ] = count

        per_module_meta[
            module_id
        ] = ModuleMeta(
            module_id=module_id,
            module_name=module_name,
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
        schedule_span_days=(
            last_schedule_offset +
            1
        ),
    )