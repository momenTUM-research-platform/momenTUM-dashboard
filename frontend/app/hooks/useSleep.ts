"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchLabeledResponses, LabeledSurveyResponseOut } from "@/app/lib/responses";
import { RoleKey, SleepRow } from "../lib/types";
import { toDate, toInt } from "../lib/vizUtils";

export function useSleep(
  studyId: string,
  roles: Record<RoleKey, string>,
  opts: { userIds?: string[]; from?: string; to?: string }
) {
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<LabeledSurveyResponseOut[]>([]);
  const chosenModules = useMemo(() => {
    const s = new Set<string>();
    Object.values(roles).forEach((k) => {
      if (!k) return;
      const [mid] = k.split(":");
      if (mid) s.add(mid);
    });
    return Array.from(s);
  }, [roles]);

  const canQuery = chosenModules.length > 0 && (roles.bedtime || roles.risetime);

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
    const toQid = (k: string) => (k ? k.split(":")[1] : "");

    const btQ = toQid(roles.bedtime);
    const rtQ = toQid(roles.risetime);
    const ddQ = toQid(roles.diaryDate);
    const awQ = toQid(roles.awakenings);
    const npQ = toQid(roles.napMinutes);

    const bucket = new Map<string, SleepRow>();
    for (const r of docs) {
      const ans = r.responses || {};
      const bedtime = btQ ? toDate(ans[btQ]) : null;
      const risetime = rtQ ? toDate(ans[rtQ]) : null;
      const awakenings = awQ ? toInt(ans[awQ]) : null;
      const napMinutes = npQ ? toInt(ans[npQ]) : null;

      let d = ddQ ? toDate(ans[ddQ]) : null;
      if (!d && risetime) d = risetime;
      if (!d) d = new Date(r.response_time);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      const day = `${y}-${m}-${da}`;

      const key = `${r.user_id}|${day}`;
      if (!bucket.has(key)) {
        bucket.set(key, { user_id: r.user_id, date: day, bedtime: null, risetime: null, awakenings: null, napMinutes: null, durationMin: null });
      }
      const row = bucket.get(key)!;
      if (bedtime && !row.bedtime) row.bedtime = bedtime;
      if (risetime && !row.risetime) row.risetime = risetime;
      if (awakenings !== null && row.awakenings == null) row.awakenings = awakenings;
      if (napMinutes !== null && row.napMinutes == null) row.napMinutes = napMinutes;
    }

    for (const r of bucket.values()) {
      if (r.bedtime && r.risetime) {
        let dt = (r.risetime.getTime() - r.bedtime.getTime()) / 60000;
        if (dt < 0) dt += 24 * 60;
        r.durationMin = Math.round(dt);
      }
    }

    return Array.from(bucket.values()).sort((a, b) =>
      a.user_id === b.user_id ? a.date.localeCompare(b.date) : a.user_id.localeCompare(b.user_id)
    );
  }, [docs, roles]);

  return { canQuery, chosenModules, loading, load, normalized };
}