"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchLabeledResponses } from "@/app/lib/responses";
import { InferredStudyQuestion, VarRow } from "../lib/types";
import { isSelectableNumeric, toNumberLoose } from "../lib/vizUtils";

export function useVariables(
  studyId: string,
  questions: InferredStudyQuestion[] | null,
  selectedVars: string[],
  opts: { userIds?: string[]; from?: string; to?: string; binning: "none" | "hour" | "day"; zscore: boolean }
) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<VarRow[]>([]);

  const selectable = useMemo(() => (questions || []).filter(isSelectableNumeric), [questions]);

  const labelByVar: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    selectable.forEach((q) => {
      const varId = `${q.module_id}:${q.question_id}`;
      m[varId] = `${q.module_name || q.module_id} · ${q.question_text || q.question_id}`;
    });
    return m;
  }, [selectable]);

  const qMeta = useMemo(() => {
    const m = new Map<string, InferredStudyQuestion>();
    (questions || []).forEach((q) => m.set(`${q.module_id}:${q.question_id}`, q));
    return m;
  }, [questions]);

  const selectedModules = useMemo(
    () => Array.from(new Set(selectedVars.map((v) => v.split(":")[0]))),
    [selectedVars]
  );

  const canQuery = selectedVars.length > 0;

  const load = async () => {
    if (!canQuery) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const docs = await fetchLabeledResponses(studyId, {
        user_id: opts.userIds && opts.userIds.length ? opts.userIds : undefined,
        module_id: selectedModules,
        from: opts.from || undefined,
        to: opts.to || undefined,
        sort: "asc",
        limit: 10000,
      });

      const out: VarRow[] = [];
      for (const d of docs) {
        const rt = new Date(d.response_time).getTime();
        if (!Number.isFinite(rt)) continue;
        const ans = d.responses || {};
        for (const varId of selectedVars) {
          const [, qid] = varId.split(":");
          if (!qid) continue;
          const meta = qMeta.get(varId);
          const raw = ans[qid];
          let num: number | null = null;
          if (meta?.option_map) {
            const k = String(raw);
            if (k in meta.option_map) num = meta.option_map[k];
          }
          if (num == null) num = toNumberLoose(raw);
          if (num == null) continue;

          out.push({ user_id: d.user_id, t: rt, varId, value: num, label: labelByVar[varId] || varId });
        }
      }
      setRows(out);
    } finally {
      setLoading(false);
    }
  };

  // transforms
  const binned = useMemo(() => {
    if (!rows.length || opts.binning === "none") return rows;
    const bucket = new Map<string, { sum: number; n: number }>();
    const keyFor = (r: VarRow, ts: number) => `${r.user_id}|${r.varId}|${ts}`;
    const roundHour = (ms: number) => { const d = new Date(ms); d.setMinutes(0,0,0); return d.getTime(); };
    const roundDay  = (ms: number) => { const d = new Date(ms); d.setHours(0,0,0,0); return d.getTime(); };

    for (const r of rows) {
      const ts = opts.binning === "hour" ? roundHour(r.t) : roundDay(r.t);
      const k = keyFor(r, ts);
      if (!bucket.has(k)) bucket.set(k, { sum: 0, n: 0 });
      const acc = bucket.get(k)!;
      acc.sum += r.value; acc.n += 1;
    }
    const out: VarRow[] = [];
    for (const [k, acc] of bucket) {
      const [user_id, varId, ts] = k.split("|");
      const label = rows.find((r) => r.varId === varId)?.label || varId;
      out.push({ user_id, varId, t: Number(ts), value: acc.sum / acc.n, label });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }, [rows, opts.binning]);

  const zscored = useMemo(() => {
    if (!opts.zscore) return binned;
    const by = new Map<string, VarRow[]>();
    binned.forEach((r) => {
      const k = `${r.user_id}|${r.varId}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(r);
    });
    const out: VarRow[] = [];
    for (const arr of by.values()) {
      const mu = arr.reduce((s, x) => s + x.value, 0) / arr.length;
      const sd = Math.sqrt(Math.max(1e-9, arr.reduce((s, x) => s + (x.value - mu) ** 2, 0) / arr.length));
      arr.forEach((r) => out.push({ ...r, value: (r.value - mu) / sd }));
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }, [binned, opts.zscore]);

  return { selectable, selectedModules, canQuery, loading, load, rows: zscored };
}