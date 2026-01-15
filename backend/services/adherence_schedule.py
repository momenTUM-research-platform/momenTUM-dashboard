# services/adherence_schedule.py
from __future__ import annotations
from dataclasses import dataclass
from datetime import date, time, datetime, timedelta
from typing import Dict, List, Optional

try:
    from zoneinfo import ZoneInfo  # py3.9+
except Exception:  # pragma: no cover
    from backports.zoneinfo import ZoneInfo  # type: ignore


@dataclass
class Occurrence:
    module_id: str
    module_name: str
    date: str            # YYYY-MM-DD in local tz
    start: str           # ISO8601 with tz
    end: str             # ISO8601 with tz


def _ymd(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def _parse_hms(hms: str) -> time:
    parts = hms.split(":")
    hh = int(parts[0])
    mm = int(parts[1]) if len(parts) > 1 else 0
    ss = int(parts[2]) if len(parts) > 2 else 0
    return time(hh, mm, ss)


def _localize(dt_naive: datetime, tz: ZoneInfo) -> datetime:
    return dt_naive.replace(tzinfo=tz)


def expand_module_daily(module: Dict, start_date: date, end_date: date, tz: ZoneInfo) -> List[Occurrence]:
    """Expand a 'daily' module into expected prompt instances within [start_date, end_date]."""
    out: List[Occurrence] = []
    alerts = module.get("alerts") or {}
    if (alerts.get("repeat") or "").lower() != "daily":
        return out

    interval_days = max(1, int(alerts.get("interval", 1)))
    times = alerts.get("times") or ["12:00:00"]

    # sticky => one per day (regardless of times)
    sticky = bool(alerts.get("sticky", False))
    timeout_enabled = bool(alerts.get("timeout", False))
    timeout_after_ms = int(alerts.get("timeoutAfter") or 0)

    d = start_date
    while d <= end_date:
        if sticky:
            # pick the first configured time (or noon) as the "start"
            t = times[0] if times else "12:00:00"
            start_naive = datetime(d.year, d.month, d.day,
                                   _parse_hms(t).hour, _parse_hms(t).minute, _parse_hms(t).second)
            start_dt = _localize(start_naive, tz)
            if timeout_enabled and timeout_after_ms > 0:
                end_dt = start_dt + timedelta(milliseconds=timeout_after_ms)
            else:
                end_dt = _localize(datetime(d.year, d.month, d.day, 23, 59, 59), tz)

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
            # non-sticky => one per configured time
            for t in times:
                tt = _parse_hms(t)
                start_naive = datetime(d.year, d.month, d.day, tt.hour, tt.minute, tt.second)
                start_dt = _localize(start_naive, tz)
                if timeout_enabled and timeout_after_ms > 0:
                    end_dt = start_dt + timedelta(milliseconds=timeout_after_ms)
                else:
                    end_dt = _localize(datetime(d.year, d.month, d.day, 23, 59, 59), tz)

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


def _parse_expected_enrollment_date(alerts: Dict, tz: ZoneInfo) -> Optional[date]:
    s = (alerts.get("expectedEnrollmentDate") or "").strip()
    if not s:
        return None
    try:
        # interpret as local date in tz
        dt = datetime.fromisoformat(s) if "T" in s else datetime.strptime(s, "%Y-%m-%d")
        # if naive, make it local midnight
        if dt.tzinfo is None:
            dt = dt.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=tz)
        else:
            dt = dt.astimezone(tz)
        return dt.date()
    except Exception:
        return None


def expand_module_never(
    module: Dict,
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    baseline_local_date: Optional[date],
) -> List[Occurrence]:
    """
    Expand a 'never' (one-off) module.
    Anchor date priority:
      1) alerts.expectedEnrollmentDate (in tz)
      2) baseline_local_date (per-user, e.g., earliest response local date)
    Apply offsetDays (default 0). Emit once if sticky; else one per configured time.
    """
    out: List[Occurrence] = []
    alerts = module.get("alerts") or {}
    if (alerts.get("repeat") or "").lower() != "never":
        return out

    anchor = _parse_expected_enrollment_date(alerts, tz) or baseline_local_date
    if anchor is None:
        return out  # no way to place this one-off

    try:
        offset_days = int(alerts.get("offsetDays", 0))
    except Exception:
        offset_days = 0

    day = anchor + timedelta(days=offset_days)
    if not (start_date <= day <= end_date):
        return out

    times = alerts.get("times") or ["12:00:00"]
    sticky = bool(alerts.get("sticky", False))
    timeout_enabled = bool(alerts.get("timeout", False))
    timeout_after_ms = int(alerts.get("timeoutAfter") or 0)

    def _make_occ(tstr: str):
        tt = _parse_hms(tstr)
        start_naive = datetime(day.year, day.month, day.day, tt.hour, tt.minute, tt.second)
        start_dt = _localize(start_naive, tz)
        if timeout_enabled and timeout_after_ms > 0:
            end_dt = start_dt + timedelta(milliseconds=timeout_after_ms)
        else:
            end_dt = _localize(datetime(day.year, day.month, day.day, 23, 59, 59), tz)
        return Occurrence(
            module_id=module["id"],
            module_name=module.get("name") or module["id"],
            date=_ymd(day),
            start=start_dt.isoformat(),
            end=end_dt.isoformat(),
        )

    if sticky:
        out.append(_make_occ(times[0]))
    else:
        for t in times:
            out.append(_make_occ(t))

    return out


def expand_study_schedule(
    study: Dict,
    start_date: date,
    end_date: date,
    tz: ZoneInfo,
    baseline_local_date: Optional[date] = None,
) -> List[Occurrence]:
    """Expand all modules between start_date and end_date."""
    occs: List[Occurrence] = []
    for mod in (study.get("modules") or []):
        occs.extend(expand_module_daily(mod, start_date, end_date, tz))
        occs.extend(expand_module_never(mod, start_date, end_date, tz, baseline_local_date))
    occs.sort(key=lambda o: (o.date, o.module_id, o.start))
    return occs