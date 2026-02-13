"use client";

import { useMemo, useState } from "react";
import { fetchLabeledResponses, LabeledSurveyResponseOut } from "@/app/lib/responses";
import { RoleKey, SleepRow } from "../lib/types";
import { toDate, toInt } from "../lib/vizUtils";

type Opts = { userIds?: string[]; from?: string; to?: string };

const minsBetween = (start: Date, end: Date) => {
  let dt = (end.getTime() - start.getTime()) / 60000;
  if (dt < 0) dt += 24 * 60;
  return Math.round(dt);
};

const addMinutes = (d: Date, mins: number) => new Date(d.getTime() + mins * 60_000);

const dayKeyFromResponseTime = (iso: string) => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

const toQid = (k: string) => (k ? k.split(":")[1] : "");

export function useSleep(studyId: string, roles: Record<RoleKey, string>, opts: Opts) {
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<LabeledSurveyResponseOut[]>([]);

  const chosenModules = useMemo(() => {
    const s = new Set<string>();
    for (const k of Object.values(roles)) {
      if (!k) continue;
      const [mid] = k.split(":");
      if (mid) s.add(mid);
    }
    return Array.from(s);
  }, [roles]);

  const canQuery = chosenModules.length > 0 && !!roles.trySleepTime && !!roles.outOfBedTime;

  const load = async () => {
    if (!canQuery) {
      setDocs([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetchLabeledResponses(studyId, {
        user_id: opts.userIds && opts.userIds.length ? opts.userIds : undefined,
        module_id: chosenModules,
        from: opts.from || undefined,
        to: opts.to || undefined,
        sort: "desc",
        limit: 5000,
      });
      setDocs(res);
    } finally {
      setLoading(false);
    }
  };

  const normalized: SleepRow[] = useMemo(() => {
    if (!docs.length) return [];

    const tryQ = toQid(roles.trySleepTime);
    const outQ = toQid(roles.outOfBedTime);
    const latQ = toQid(roles.sleepLatencyMin);
    const finalAwQ = toQid(roles.finalAwakeningTime);
    const wakesCountQ = toQid(roles.awakeningsCount);
    const wakesDurQ = toQid(roles.awakeningsDurationMin);
    const napMinQ = toQid(roles.napMinutes);
    const napCountQ = toQid(roles.napCount);

    const bucket = new Map<string, SleepRow>();

    for (const r of docs) {
      const ans = r.responses || {};
      const day = dayKeyFromResponseTime(r.response_time);
      const key = `${r.user_id}|${day}`;

      if (!bucket.has(key)) {
        bucket.set(key, {
          user_id: r.user_id,
          date: day,

          trySleepTime: null,
          outOfBedTime: null,
          sleepLatencyMin: null,
          finalAwakeningTime: null,

          awakeningsCount: null,
          awakeningsDurationMin: null,

          napMinutes: null,
          napCount: null,

          sleepOnsetTime: null,
          sleepDurationMin: null,
          sleepDurationInclNapsMin: null,
        });
      }

      const row = bucket.get(key)!;

      const trySleepTime = tryQ ? toDate(ans[tryQ]) : null;
      const outOfBedTime = outQ ? toDate(ans[outQ]) : null;
      const sleepLatencyMin = latQ ? toInt(ans[latQ]) : null;
      const finalAwakeningTime = finalAwQ ? toDate(ans[finalAwQ]) : null;

      const awakeningsCount = wakesCountQ ? toInt(ans[wakesCountQ]) : null;
      const awakeningsDurationMin = wakesDurQ ? toInt(ans[wakesDurQ]) : null;

      const napMinutes = napMinQ ? toInt(ans[napMinQ]) : null;
      const napCount = napCountQ ? toInt(ans[napCountQ]) : null;

      if (trySleepTime && !row.trySleepTime) row.trySleepTime = trySleepTime;
      if (outOfBedTime && !row.outOfBedTime) row.outOfBedTime = outOfBedTime;
      if (sleepLatencyMin != null && row.sleepLatencyMin == null) row.sleepLatencyMin = sleepLatencyMin;
      if (finalAwakeningTime && !row.finalAwakeningTime) row.finalAwakeningTime = finalAwakeningTime;

      if (awakeningsCount != null && row.awakeningsCount == null) row.awakeningsCount = awakeningsCount;
      if (awakeningsDurationMin != null && row.awakeningsDurationMin == null) row.awakeningsDurationMin = awakeningsDurationMin;

      if (napMinutes != null && row.napMinutes == null) row.napMinutes = napMinutes;
      if (napCount != null && row.napCount == null) row.napCount = napCount;
    }

    for (const row of bucket.values()) {
      const end = row.finalAwakeningTime ?? row.outOfBedTime;
      if (!row.trySleepTime || !end) continue;

      const onset =
        row.sleepLatencyMin != null
          ? addMinutes(row.trySleepTime, Math.max(0, row.sleepLatencyMin))
          : row.trySleepTime;

      row.sleepOnsetTime = onset;

      const totalFromOnset = minsBetween(onset, end);
      const awakeMins = Math.max(0, row.awakeningsDurationMin ?? 0);
      const sleepMins = Math.max(0, totalFromOnset - awakeMins);

      row.sleepDurationMin = sleepMins;

      const naps = Math.max(0, row.napMinutes ?? 0);
      row.sleepDurationInclNapsMin = sleepMins + naps;
    }

    return Array.from(bucket.values()).sort((a, b) =>
      a.user_id === b.user_id ? a.date.localeCompare(b.date) : a.user_id.localeCompare(b.user_id)
    );
  }, [docs, roles]);

  return { canQuery, chosenModules, loading, load, normalized };
}