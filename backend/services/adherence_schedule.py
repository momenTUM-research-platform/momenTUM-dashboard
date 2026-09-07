from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional

try:
    from zoneinfo import ZoneInfo
except Exception:
    from backports.zoneinfo import ZoneInfo


@dataclass
class Occurrence:
    module_id: str
    module_name: str
    date: str
    start: str
    end: str


def _ymd(value: date) -> str:
    return value.strftime("%Y-%m-%d")


def _parse_hms(value: str) -> time:
    parts = str(value).strip().split(":")

    hour = (
        int(parts[0])
        if len(parts) >= 1 and parts[0]
        else 0
    )

    minute = (
        int(parts[1])
        if len(parts) >= 2 and parts[1]
        else 0
    )

    second = (
        int(parts[2])
        if len(parts) >= 3 and parts[2]
        else 0
    )

    return time(
        hour,
        minute,
        second,
    )


def _localize(
    value: datetime,
    tz: ZoneInfo,
) -> datetime:
    return value.replace(
        tzinfo=tz
    )


def _norm_time_str(
    value: Any,
) -> Optional[str]:
    if value is None:
        return None

    normalized = str(
        value
    ).strip()

    return (
        normalized
        if normalized
        else None
    )


def _unique_times(
    alerts: Dict[str, Any],
) -> List[str]:
    times = (
        alerts.get("times")
        or []
    )

    offset_time = alerts.get(
        "offsetTime"
    )

    unique: Dict[str, str] = {}

    for value in times:
        normalized = (
            _norm_time_str(
                value
            )
        )

        if normalized:
            unique[
                normalized
            ] = normalized

    normalized_offset = (
        _norm_time_str(
            offset_time
        )
    )

    if normalized_offset:
        unique[
            normalized_offset
        ] = normalized_offset

    if not unique:
        return [
            "12:00:00"
        ]

    def sort_key(
        value: str,
    ):
        parsed = _parse_hms(
            value
        )

        return (
            parsed.hour,
            parsed.minute,
            parsed.second,
        )

    return sorted(
        unique.keys(),
        key=sort_key,
    )


def _end_dt(
    start_dt: datetime,
    tz: ZoneInfo,
    timeout_enabled: bool,
    timeout_after_ms: int,
) -> datetime:
    if (
        timeout_enabled
        and timeout_after_ms > 0
    ):
        return (
            start_dt
            + timedelta(
                milliseconds=(
                    timeout_after_ms
                )
            )
        )

    return _localize(
        datetime(
            start_dt.year,
            start_dt.month,
            start_dt.day,
            23,
            59,
            59,
        ),
        tz,
    )


def _safe_int(
    value: Any,
    default: int,
) -> int:
    try:
        return int(value)
    except Exception:
        return default


def expand_module_daily(
    module: Dict[str, Any],
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    baseline_local_date: Optional[date],
) -> List[Occurrence]:
    occurrences: List[Occurrence] = []

    alerts = (
        module.get("alerts")
        or {}
    )

    repeat = str(
        alerts.get("repeat")
        or ""
    ).lower()

    if repeat != "daily":
        return occurrences

    anchor = (
        baseline_local_date
        or start_date
    )

    offset_days = _safe_int(
        alerts.get(
            "offsetDays",
            0,
        ),
        0,
    )

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

    total_occurrence_days = (
        repeat_count + 1
    )

    first_day = (
        anchor
        + timedelta(
            days=offset_days
        )
    )

    sticky = bool(
        alerts.get(
            "sticky",
            False,
        )
    )

    timeout_enabled = bool(
        alerts.get(
            "timeout",
            False,
        )
    )

    timeout_after_ms = max(
        0,
        _safe_int(
            alerts.get(
                "timeoutAfter",
                0,
            )
            or 0,
            0,
        ),
    )

    times = _unique_times(
        alerts
    )

    scheduled_times = (
        [times[0]]
        if sticky
        else times
    )

    for occurrence_index in range(
        total_occurrence_days
    ):
        occurrence_day = (
            first_day
            + timedelta(
                days=(
                    occurrence_index
                    * interval_days
                )
            )
        )

        if (
            occurrence_day
            < start_date
        ):
            continue

        if (
            occurrence_day
            > end_date
        ):
            break

        for scheduled_time in (
            scheduled_times
        ):
            parsed_time = _parse_hms(
                scheduled_time
            )

            start_naive = datetime(
                occurrence_day.year,
                occurrence_day.month,
                occurrence_day.day,
                parsed_time.hour,
                parsed_time.minute,
                parsed_time.second,
            )

            start_dt = _localize(
                start_naive,
                tz,
            )

            end_dt = _end_dt(
                start_dt,
                tz,
                timeout_enabled,
                timeout_after_ms,
            )

            occurrences.append(
                Occurrence(
                    module_id=module[
                        "id"
                    ],
                    module_name=(
                        module.get(
                            "name"
                        )
                        or module[
                            "id"
                        ]
                    ),
                    date=_ymd(
                        occurrence_day
                    ),
                    start=start_dt.isoformat(),
                    end=end_dt.isoformat(),
                )
            )

    return occurrences


def expand_module_never(
    module: Dict[str, Any],
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    baseline_local_date: Optional[date],
) -> List[Occurrence]:
    occurrences: List[Occurrence] = []

    alerts = (
        module.get("alerts")
        or {}
    )

    repeat = str(
        alerts.get("repeat")
        or ""
    ).lower()

    if repeat != "never":
        return occurrences

    if (
        baseline_local_date
        is None
    ):
        return occurrences

    offset_days = _safe_int(
        alerts.get(
            "offsetDays",
            0,
        ),
        0,
    )

    occurrence_day = (
        baseline_local_date
        + timedelta(
            days=offset_days
        )
    )

    if not (
        start_date
        <= occurrence_day
        <= end_date
    ):
        return occurrences

    times = _unique_times(
        alerts
    )

    sticky = bool(
        alerts.get(
            "sticky",
            False,
        )
    )

    timeout_enabled = bool(
        alerts.get(
            "timeout",
            False,
        )
    )

    timeout_after_ms = max(
        0,
        _safe_int(
            alerts.get(
                "timeoutAfter",
                0,
            )
            or 0,
            0,
        ),
    )

    scheduled_times = (
        [times[0]]
        if sticky
        else times
    )

    for scheduled_time in (
        scheduled_times
    ):
        parsed_time = _parse_hms(
            scheduled_time
        )

        start_naive = datetime(
            occurrence_day.year,
            occurrence_day.month,
            occurrence_day.day,
            parsed_time.hour,
            parsed_time.minute,
            parsed_time.second,
        )

        start_dt = _localize(
            start_naive,
            tz,
        )

        end_dt = _end_dt(
            start_dt,
            tz,
            timeout_enabled,
            timeout_after_ms,
        )

        occurrences.append(
            Occurrence(
                module_id=module[
                    "id"
                ],
                module_name=(
                    module.get(
                        "name"
                    )
                    or module[
                        "id"
                    ]
                ),
                date=_ymd(
                    occurrence_day
                ),
                start=start_dt.isoformat(),
                end=end_dt.isoformat(),
            )
        )

    return occurrences


def expand_study_schedule(
    study: Dict[str, Any],
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    baseline_local_date: Optional[date] = None,
) -> List[Occurrence]:
    occurrences: List[Occurrence] = []

    for module in (
        study.get("modules")
        or []
    ):
        occurrences.extend(
            expand_module_daily(
                module,
                start_date,
                end_date,
                tz,
                baseline_local_date,
            )
        )

        occurrences.extend(
            expand_module_never(
                module,
                start_date,
                end_date,
                tz,
                baseline_local_date,
            )
        )

    occurrences.sort(
        key=lambda occurrence: (
            occurrence.date,
            occurrence.start,
            occurrence.module_id,
        )
    )

    return occurrences