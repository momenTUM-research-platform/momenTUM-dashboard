"use client";
import { useMemo } from "react";
import { SleepRow } from "../../lib/types";
import { median } from "../../lib/vizUtils";
import styles from "./SleepVizPanel.module.css";

export function SleepStats({
  data,
  mapping,
  mappingName = "Mapped ID",
}: {
  data: SleepRow[];
  mapping?: Record<string, string>;
  mappingName?: string;
}) {
  const displayId = (uid: string) => mapping?.[uid] ?? uid;

  const byUser = useMemo(() => {
    const m = new Map<string, SleepRow[]>();
    for (const r of data) {
      if (!m.has(r.user_id)) m.set(r.user_id, []);
      m.get(r.user_id)!.push(r);
    }
    return Array.from(m.entries());
  }, [data]);

  const fmtHM = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
  const timeToMins = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const fmtClock = (mins: number | null) => {
    if (mins == null) return "—";
    const m = (mins + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  return (
    <div className={styles.statsGrid}>
      {byUser.map(([user, rows]) => {
        const durations = rows.map((r) => r.durationMin).filter((x): x is number => x != null);
        const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

        const bedMins = rows.map((r) => r.bedtime).filter((d): d is Date => !!d).map(timeToMins);
        const riseMins = rows.map((r) => r.risetime).filter((d): d is Date => !!d).map(timeToMins);

        const medBed = median(bedMins);
        const medRise = median(riseMins);

        const pretty = displayId(user);
        const showRaw = pretty !== user;

        return (
          <div key={user} className={styles.statCard}>
            <div className={styles.statTitle}>
              {pretty} {showRaw && <span className={styles.rawGray}>({user})</span>}
            </div>
            <div className={styles.statBody}>
              <div>Avg duration: <span className={styles.statStrong}>{avgDur != null ? fmtHM(avgDur) : "—"}</span></div>
              <div>Median bedtime: <span className={styles.statStrong}>{fmtClock(medBed)}</span></div>
              <div>Median risetime: <span className={styles.statStrong}>{fmtClock(medRise)}</span></div>
              <div>Days: <span className={styles.statStrong}>{rows.length}</span></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}