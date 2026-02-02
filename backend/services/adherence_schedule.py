from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, time
from typing import Dict, List, Optional, Any

try:
    from zoneinfo import ZoneInfo  # py3.9+
except Exception:  # pragma: no cover
    from backports.zoneinfo import ZoneInfo  # type: ignore


@dataclass
class Occurrence:
    module_id: str
    module_name: str
    date: str
    start: str
    end: str


def _ymd(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def _parse_hms(hms: str) -> time:
    parts = str(hms).strip().split(":")
    hh = int(parts[0]) if len(parts) >= 1 and parts[0] else 0
    mm = int(parts[1]) if len(parts) >= 2 and parts[1] else 0
    ss = int(parts[2]) if len(parts) >= 3 and parts[2] else 0
    return time(hh, mm, ss)


def _localize(dt_naive: datetime, tz: ZoneInfo) -> datetime:
    return dt_naive.replace(tzinfo=tz)


def _norm_time_str(x: Any) -> Optional[str]:
    if x is None:
        return None
    s = str(x).strip()
    return s if s else None


def _unique_times(alerts: Dict[str, Any]) -> List[str]:
    times = alerts.get("times") or []
    offset_time = alerts.get("offsetTime")
    uniq: Dict[str, str] = {}

    for t in times:
        s = _norm_time_str(t)
        if s:
            uniq[s] = s

    s0 = _norm_time_str(offset_time)
    if s0:
        uniq[s0] = s0

    if not uniq:
        return ["12:00:00"]

    return sorted(uniq.keys(), key=lambda s: (_parse_hms(s).hour, _parse_hms(s).minute, _parse_hms(s).second))


def _end_dt(start_dt: datetime, tz: ZoneInfo, timeout_enabled: bool, timeout_after_ms: int) -> datetime:
    if timeout_enabled and timeout_after_ms > 0:
        return start_dt + timedelta(milliseconds=timeout_after_ms)
    return _localize(datetime(start_dt.year, start_dt.month, start_dt.day, 23, 59, 59), tz)


def expand_module_daily(
    module: Dict,
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    baseline_local_date: Optional[date],
) -> List[Occurrence]:
    out: List[Occurrence] = []
    alerts = module.get("alerts") or {}
    if (alerts.get("repeat") or "").lower() != "daily":
        return out

    anchor = baseline_local_date or start_date

    try:
        offset_days = int(alerts.get("offsetDays", 0))
    except Exception:
        offset_days = 0

    try:
        interval_days = max(1, int(alerts.get("interval", 1)))
    except Exception:
        interval_days = 1

    try:
        repeat_count = int(alerts.get("repeatCount", 0))
    except Exception:
        repeat_count = 0

    total_days = max(1, repeat_count + 1)
    first_day = anchor + timedelta(days=offset_days)
    last_day = first_day + timedelta(days=(total_days - 1) * interval_days)

    window_start = max(start_date, first_day)
    window_end = min(end_date, last_day)
    if window_end < window_start:
        return out

    sticky = bool(alerts.get("sticky", False))
    timeout_enabled = bool(alerts.get("timeout", False))
    timeout_after_ms = int(alerts.get("timeoutAfter") or 0)

    times = _unique_times(alerts)
    pick_time = times[0]

    d = window_start
    while d <= window_end:
        if d < first_day:
            d += timedelta(days=interval_days)
            continue

        if sticky:
            tt = _parse_hms(pick_time)
            start_naive = datetime(d.year, d.month, d.day, tt.hour, tt.minute, tt.second)
            start_dt = _localize(start_naive, tz)
            end_dt = _end_dt(start_dt, tz, timeout_enabled, timeout_after_ms)

            out.append(
                Occurrence(
                    module_id=module["id"],
                    module_name=module.get("name") or module["id"],
                    date=_ymd(d),
                    start=start_dt.isoformat(),
                    end=end_dt.isoformat(),
                )
            )
        else:
            for t in times:
                tt = _parse_hms(t)
                start_naive = datetime(d.year, d.month, d.day, tt.hour, tt.minute, tt.second)
                start_dt = _localize(start_naive, tz)
                end_dt = _end_dt(start_dt, tz, timeout_enabled, timeout_after_ms)

                out.append(
                    Occurrence(
                        module_id=module["id"],
                        module_name=module.get("name") or module["id"],
                        date=_ymd(d),
                        start=start_dt.isoformat(),
                        end=end_dt.isoformat(),
                    )
                )

        d += timedelta(days=interval_days)

    return out


def expand_module_never(
    module: Dict,
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    baseline_local_date: Optional[date],
) -> List[Occurrence]:
    out: List[Occurrence] = []
    alerts = module.get("alerts") or {}
    if (alerts.get("repeat") or "").lower() != "never":
        return out

    anchor = baseline_local_date
    if anchor is None:
        return out

    try:
        offset_days = int(alerts.get("offsetDays", 0))
    except Exception:
        offset_days = 0

    day = anchor + timedelta(days=offset_days)
    if not (start_date <= day <= end_date):
        return out

    times = _unique_times(alerts)
    sticky = bool(alerts.get("sticky", False))
    timeout_enabled = bool(alerts.get("timeout", False))
    timeout_after_ms = int(alerts.get("timeoutAfter") or 0)

    def make_occ(tstr: str) -> Occurrence:
        tt = _parse_hms(tstr)
        start_naive = datetime(day.year, day.month, day.day, tt.hour, tt.minute, tt.second)
        start_dt = _localize(start_naive, tz)
        end_dt = _end_dt(start_dt, tz, timeout_enabled, timeout_after_ms)
        return Occurrence(
            module_id=module["id"],
            module_name=module.get("name") or module["id"],
            date=_ymd(day),
            start=start_dt.isoformat(),
            end=end_dt.isoformat(),
        )

    if sticky:
        out.append(make_occ(times[0]))
    else:
        for t in times:
            out.append(make_occ(t))

    return out


def expand_study_schedule(
    study: Dict,
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    baseline_local_date: Optional[date] = None,
) -> List[Occurrence]:
    occs: List[Occurrence] = []
    for mod in (study.get("modules") or []):
        occs.extend(expand_module_daily(mod, start_date, end_date, tz, baseline_local_date))
        occs.extend(expand_module_never(mod, start_date, end_date, tz, baseline_local_date))
    occs.sort(key=lambda o: (o.date, o.module_id, o.start))
    return occs