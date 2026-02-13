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
    for (const [, arr] of m) arr.sort((a, b) => a.date.localeCompare(b.date));
    return Array.from(m.entries());
  }, [data]);

  const timeToMins = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const addMinutes = (d: Date, mins: number) => new Date(d.getTime() + mins * 60_000);

  const diffMinutes = (start: Date, end: Date) => {
    let dt = (end.getTime() - start.getTime()) / 60000;
    if (dt < 0) dt += 24 * 60;
    return Math.round(dt);
  };

  const fmtHM = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;

  const fmtClock = (mins: number | null) => {
    if (mins == null) return "—";
    const m = (mins + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  return (
    <div className={styles.statsGrid}>
      {byUser.map(([user, rows]) => {
        const pretty = displayId(user);
        const showRaw = pretty !== user;

        const trySleepTimes = rows
          .map((r) => (r.trySleepTime ? timeToMins(r.trySleepTime) : null))
          .filter((x): x is number => x != null);

        const onsetTimes = rows
          .map((r) => {
            if (r.trySleepTime && r.sleepLatencyMin != null) {
              return timeToMins(addMinutes(r.trySleepTime, r.sleepLatencyMin));
            }
            return null;
          })
          .filter((x): x is number => x != null);

        const endTimes = rows
          .map((r) => {
            const end = r.finalAwakeningTime ?? r.outOfBedTime ?? null;
            return end ? timeToMins(end) : null;
          })
          .filter((x): x is number => x != null);

        const medTry = median(trySleepTimes);
        const medOnset = median(onsetTimes);
        const medEnd = median(endTimes);

        const sleepPeriods = rows
          .map((r) => {
            const onset =
              r.trySleepTime && r.sleepLatencyMin != null
                ? addMinutes(r.trySleepTime, r.sleepLatencyMin)
                : null;
            const end = r.finalAwakeningTime ?? r.outOfBedTime ?? null;
            if (!onset || !end) return null;
            return diffMinutes(onset, end);
          })
          .filter((x): x is number => x != null);

        const tstMinutes = rows
          .map((r) => {
            const onset =
              r.trySleepTime && r.sleepLatencyMin != null
                ? addMinutes(r.trySleepTime, r.sleepLatencyMin)
                : null;
            const end = r.finalAwakeningTime ?? r.outOfBedTime ?? null;
            if (!onset || !end) return null;

            const sleepPeriod = diffMinutes(onset, end);
            const waso = r.awakeningsDurationMin ?? null;
            if (waso == null) return sleepPeriod;

            return Math.max(0, sleepPeriod - waso);
          })
          .filter((x): x is number => x != null);

        const inclNapsMinutes = rows
          .map((r) => {
            const onset =
              r.trySleepTime && r.sleepLatencyMin != null
                ? addMinutes(r.trySleepTime, r.sleepLatencyMin)
                : null;
            const end = r.finalAwakeningTime ?? r.outOfBedTime ?? null;
            if (!onset || !end) return null;

            const sleepPeriod = diffMinutes(onset, end);
            const waso = r.awakeningsDurationMin ?? null;
            const core = waso == null ? sleepPeriod : Math.max(0, sleepPeriod - waso);

            const naps = r.napMinutes ?? null;
            return naps == null ? core : core + naps;
          })
          .filter((x): x is number => x != null);

        const wasoList = rows
          .map((r) => r.awakeningsDurationMin ?? null)
          .filter((x): x is number => x != null);

        const napMinList = rows
          .map((r) => r.napMinutes ?? null)
          .filter((x): x is number => x != null);

        const napCountList = rows
          .map((r) => r.napCount ?? null)
          .filter((x): x is number => x != null);

        const avgSleepPeriod = avg(sleepPeriods);
        const avgTst = avg(tstMinutes);
        const avgInclNaps = avg(inclNapsMinutes);
        const avgWaso = avg(wasoList);
        const avgNapMin = avg(napMinList);
        const avgNapCount = avg(napCountList);

        return (
          <div key={user} className={styles.statCard}>
            <div className={styles.statTitle}>
              {pretty} {showRaw && <span className={styles.rawGray}>({user})</span>}
            </div>

            <div className={styles.statBody}>
              <div>
                Avg sleep period:{" "}
                <span className={styles.statStrong}>{avgSleepPeriod != null ? fmtHM(avgSleepPeriod) : "—"}</span>
              </div>
              <div>
                Avg sleep (TST):{" "}
                <span className={styles.statStrong}>{avgTst != null ? fmtHM(avgTst) : "—"}</span>
                {avgWaso != null && <span className={styles.rawGray}> (WASO avg {avgWaso}m)</span>}
              </div>
              <div>
                Avg sleep incl. naps:{" "}
                <span className={styles.statStrong}>{avgInclNaps != null ? fmtHM(avgInclNaps) : "—"}</span>
                {(avgNapMin != null || avgNapCount != null) && (
                  <span className={styles.rawGray}>
                    {" "}
                    (naps avg {avgNapMin != null ? `${avgNapMin}m` : "—"}
                    {avgNapCount != null ? `, n=${avgNapCount}` : ""})
                  </span>
                )}
              </div>

              <div>
                Median try-to-sleep: <span className={styles.statStrong}>{fmtClock(medTry)}</span>
              </div>
              <div>
                Median sleep onset: <span className={styles.statStrong}>{fmtClock(medOnset)}</span>
              </div>
              <div>
                Median end: <span className={styles.statStrong}>{fmtClock(medEnd)}</span>
              </div>

              <div>
                Days: <span className={styles.statStrong}>{rows.length}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}