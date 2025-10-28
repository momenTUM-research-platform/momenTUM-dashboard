"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchAdherenceExpected,
  fetchAdherenceStructureCount,
  OccurrenceOut,
  safeTZ,
  toYMD,
} from "@/app/lib/adherence";
import {
  fetchLabeledResponses,
  fetchFacets,
  LabeledSurveyResponseOut,
  Facets,
} from "@/app/lib/responses";
import styles from "./AdherencePanel.module.css";

type Props = {
  studyId: string;
  userIds?: string[];
  mapping?: Record<string, string>;
  mappingName?: string;
};

type UserSummary = {
  user_id: string;
  label: string;
  expected: number;   // from /structure-count.total
  completed: number;  // matched hits within baseline window
  completion: number; // %
  perModule: Record<string, { module_name: string; expected: number; completed: number }>;
};

function minDateISO(dates: string[]): Date | null {
  const ts = dates
    .map((s) => {
      try { return new Date(s).getTime(); } catch { return NaN; }
    })
    .filter((n) => Number.isFinite(n)) as number[];
  if (!ts.length) return null;
  return new Date(Math.min(...ts));
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function AdherencePanel({
  studyId,
  userIds,
  mapping,
  mappingName = "Mapped ID",
}: Props) {
  const [rows, setRows] = useState<LabeledSurveyResponseOut[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [structureTotal, setStructureTotal] = useState<number>(0);
  const [structurePerModule, setStructurePerModule] = useState<Record<string, number>>({});
  const [studyDays, setStudyDays] = useState<number>(7);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UserSummary[]>([]);
  const tz = safeTZ();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchLabeledResponses(studyId, {
          user_id: userIds && userIds.length ? userIds : undefined,
          sort: "desc",
          skip: 0,
          limit: 20000,
        });
        if (!cancelled) setRows(res);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load responses");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studyId, JSON.stringify(userIds)]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await fetchFacets(studyId, {});
        if (!cancelled) setFacets(f);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [studyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sc = await fetchAdherenceStructureCount(studyId);
        if (!cancelled) {
          setStructureTotal(sc.total);
          setStructurePerModule(sc.per_module || {});
          setStudyDays(sc.study_days);
        }
      } catch (e: any) {
        console.error("structure-count failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [studyId]);

  // Summaries
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Users in scope
      const explicit = userIds && userIds.length ? userIds : [];
      const fromRows = Array.from(new Set(rows.map((r) => r.user_id)));
      const fromFacets = facets?.users ?? [];
      const users = Array.from(new Set([...explicit, ...fromRows, ...fromFacets])).filter(Boolean);

      if (!users.length) {
        if (!cancelled) setSummary([]);
        return;
      }

      // Build per-user earliest date & actual timestamps
      const earliestByUser: Record<string, Date> = {};
      const actualByUser: Record<string, Record<string, number[]>> = {};

      for (const uid of users) {
        const userRows = rows.filter((r) => r.user_id === uid);
        if (userRows.length) {
          const minD = minDateISO(userRows.map((r) => r.response_time as any));
          if (minD) earliestByUser[uid] = minD;
        }
      }

      for (const r of rows) {
        const t = new Date(r.response_time as any).getTime();
        (actualByUser[r.user_id] ||= {});
        (actualByUser[r.user_id][r.module_id] ||= []).push(t);
      }

      const out: UserSummary[] = [];

      for (const uid of users) {
        // If we don’t know baseline (no responses at all), skip summarizing this user
        const baseline = earliestByUser[uid];
        if (!baseline) continue;

        const toDate = addDays(baseline, Math.max(1, studyDays) + 1); // +1 for safety/end marker
        const fromY = toYMD(baseline);
        const toY = toYMD(toDate);

        let expectedOccs: OccurrenceOut[] = [];
        try {
          expectedOccs = await fetchAdherenceExpected({
            studyId,
            from: fromY,
            to: toY,
            tz,
            userId: uid, 
          });
        } catch {
          expectedOccs = [];
        }

        const perModule: Record<string, { module_name: string; expected: number; completed: number }> = {};
        let hitCount = 0;
        const userActual = actualByUser[uid] || {};

        // Use structure per-module counts as the expected ceiling
        for (const [mid, expCount] of Object.entries(structurePerModule)) {
          perModule[mid] = { module_name: mid, expected: expCount, completed: 0 };
        }

        // Tally completions within the participant’s window
        for (const occ of expectedOccs) {
          const mid = occ.module_id;
          const name = occ.module_name || mid;
          if (!perModule[mid]) {
            // include modules that weren’t in structure-count for any reason
            perModule[mid] = { module_name: name, expected: 0, completed: 0 };
          } else {
            // preserve name if we have it
            perModule[mid].module_name = name;
          }

          const startT = new Date(occ.start).getTime();
          const endT = new Date(occ.end).getTime();
          const times = userActual[mid] || [];
          const completed = times.some((t) => t >= startT && t <= endT);

          // Only increment completed; expected comes from structure-count
          if (completed) {
            perModule[mid].completed += 1;
          }
        }

        // Cap completed at expected per module (just in case)
        for (const v of Object.values(perModule)) {
          if (v.completed > v.expected) v.completed = v.expected;
        }

        const expectedTotal = structureTotal || 0;
        const completedTotal = Object.values(perModule).reduce((s, v) => s + v.completed, 0);
        const completionPct = expectedTotal ? Math.round((completedTotal / expectedTotal) * 100) : 0;

        out.push({
          user_id: uid,
          label: mapping?.[uid] ? `${mapping[uid]} (${uid})` : uid,
          expected: expectedTotal,
          completed: completedTotal,
          completion: completionPct,
          perModule,
        });
      }

      if (!cancelled) {
        out.sort((a, b) => a.label.localeCompare(b.label));
        setSummary(out);
      }
    })();

    return () => { cancelled = true; };
  }, [studyId, JSON.stringify(userIds), rows, facets, studyDays, JSON.stringify(structurePerModule), structureTotal, tz, JSON.stringify(mapping)]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h3 className="text-xl font-semibold">Adherence</h3>
          <p className="text-sm text-gray-600">
            Study-wide adherence per participant (baseline → baseline + {studyDays} days). Labels use “{mappingName}” when available.
          </p>
        </div>
      </div>

      {loading && <div className={styles.help}>Loading…</div>}
      {error && <div className={styles.err}>{error}</div>}

      {!loading && !error && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Participant</th>
                <th className={styles.num}>Expected</th>
                <th className={styles.num}>Completed</th>
                <th className={styles.num}>%</th>
                <th>Per-module</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.user_id}>
                  <td>{s.label}</td>
                  <td className={styles.num}>{s.expected}</td>
                  <td className={styles.num}>{s.completed}</td>
                  <td className={styles.num}>{s.completion}</td>
                  <td>
                    <div className={styles.modules}>
                      {Object.entries(s.perModule).map(([mid, v]) => (
                        <span key={mid} className={styles.modChip} title={`${v.completed}/${v.expected}`}>
                          {v.module_name}: {v.completed}/{v.expected}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {summary.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.help}>No users summarized</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}