"use client";

import { useEffect, useState, useMemo } from "react";
import {
  fetchAdherenceExpected,
  fetchAdherenceStructureCount,
  OccurrenceOut,
  safeTZ,
  toYMD,
  ModuleMeta,
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
  expected: number;
  completed: number;
  completion: number; // %
  perModule: Record<string, { module_name: string; expected: number; completed: number }>;
};

function minDateISO(dates: string[]): Date | null {
  const ts = dates
    .map((s) => {
      const t = Date.parse(s);
      return Number.isFinite(t) ? t : NaN;
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

// visual class for progress (%)
function pctClass(p: number) {
  if (p >= 70) return styles.pctGood;
  if (p >= 40) return styles.pctMid;
  return styles.pctLow;
}

export default function AdherencePanel({
  studyId,
  userIds,
  mapping,
  mappingName = "Mapped ID",
}: Props) {
  const [rows, setRows] = useState<LabeledSurveyResponseOut[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);

  const [studyDays, setStudyDays] = useState<number>(7);
  const [structureTotal, setStructureTotal] = useState<number>(0);
  const [structurePerModule, setStructurePerModule] = useState<Record<string, number>>({});
  const [moduleMeta, setModuleMeta] = useState<Record<string, ModuleMeta>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UserSummary[]>([]);
  const tz = safeTZ();

  // Load ALL responses
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
    return () => {
      cancelled = true;
    };
  }, [studyId, JSON.stringify(userIds)]);

  // Facets
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await fetchFacets(studyId, {});
        if (!cancelled) setFacets(f);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studyId]);

  // Structure + meta
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sc = await fetchAdherenceStructureCount(studyId);
        if (!cancelled) {
          setStudyDays(sc.study_days);
          setStructureTotal(sc.total);
          setStructurePerModule(sc.per_module || {});
          // @ts-ignore: meta is present in backend response
          setModuleMeta(sc.per_module_meta || {});
        }
      } catch (e) {
        console.error("structure-count failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const explicit = userIds && userIds.length ? userIds : [];
      const fromRows = Array.from(new Set(rows.map((r) => r.user_id)));
      const fromFacets = facets?.users ?? [];
      const users = Array.from(new Set([...explicit, ...fromRows, ...fromFacets])).filter(
        Boolean
      );

      if (!users.length) {
        if (!cancelled) setSummary([]);
        return;
      }

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
        const t = Date.parse(r.response_time as any);
        if (!Number.isFinite(t)) continue;
        (actualByUser[r.user_id] ||= {});
        (actualByUser[r.user_id][r.module_id] ||= []).push(t);
      }

      const out: UserSummary[] = [];

      for (const uid of users) {
        const baseline = earliestByUser[uid];
        if (!baseline) continue;

        const endDate = addDays(baseline, Math.max(1, studyDays) + 1);
        const fromY = toYMD(baseline);
        const toY = toYMD(endDate);

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

        const perModule: Record<
          string,
          { module_name: string; expected: number; completed: number }
        > = {};
        for (const [mid, expCount] of Object.entries(structurePerModule)) {
          perModule[mid] = {
            module_name: moduleMeta[mid]?.module_name || mid,
            expected: expCount,
            completed: 0,
          };
        }

        const userActual = actualByUser[uid] || {};
        let completedTotal = 0;

        // NEVER modules: “ever” rule
        for (const mid of Object.keys(perModule)) {
          const mm = moduleMeta[mid];
          if (mm && mm.repeat === "never") {
            const hits = (userActual[mid] || []).length;
            if (hits > 0) {
              const inc = Math.min(hits, perModule[mid].expected || 1);
              perModule[mid].completed = inc;
              completedTotal += inc;
            }
          }
        }

        // DAILY modules: window matching
        for (const occ of expectedOccs) {
          const mid = occ.module_id;
          const mm = moduleMeta[mid];
          if (mm && mm.repeat === "never") {
            // upgrade name if needed
            if (perModule[mid] && perModule[mid].module_name === mid) {
              perModule[mid].module_name = mm.module_name || occ.module_name || mid;
            }
            continue;
          }
          if (!perModule[mid]) {
            perModule[mid] = {
              module_name: mm?.module_name || occ.module_name || mid,
              expected: 0,
              completed: 0,
            };
          } else if (perModule[mid].module_name === mid) {
            perModule[mid].module_name = mm?.module_name || occ.module_name || mid;
          }

          const startT = Date.parse(occ.start);
          const endT = Date.parse(occ.end);
          const times = userActual[mid] || [];
          const hit = times.some((t) => t >= startT && t <= endT);
          if (hit) {
            perModule[mid].completed += 1;
            completedTotal += 1;
          }
        }

        for (const v of Object.values(perModule)) {
          if (v.completed > v.expected) v.completed = v.expected;
        }

        const expectedTotal = Object.values(perModule).reduce((s, v) => s + v.expected, 0);
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

    return () => {
      cancelled = true;
    };
  }, [
    studyId,
    JSON.stringify(userIds),
    rows,
    facets,
    studyDays,
    JSON.stringify(structurePerModule),
    JSON.stringify(moduleMeta),
    structureTotal,
    tz,
    JSON.stringify(mapping),
  ]);

  // small overall header stats (purely visual)
  const overall = useMemo(() => {
    if (!summary.length) return null;
    const exp = summary.reduce((s, u) => s + u.expected, 0);
    const done = summary.reduce((s, u) => s + u.completed, 0);
    const pct = exp ? Math.round((done / exp) * 100) : 0;
    return { participants: summary.length, exp, done, pct };
  }, [summary]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.h3}>Adherence</h3>
          <p className={styles.subtle}>
            Study-wide per participant (baseline → baseline + {studyDays} days). Labels use “{mappingName}”.
          </p>
        </div>
        {overall && (
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Participants</div>
              <div className={styles.kValue}>{overall.participants}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Completed / Expected</div>
              <div className={styles.kValue}>
                {overall.done} / {overall.exp}
              </div>
            </div>
            <div className={styles.kpiWide}>
              <div className={styles.kLabel}>Overall</div>
              <div className={styles.progress}>
                <div
                  className={`${styles.progressBar} ${pctClass(overall.pct)}`}
                  style={{ width: `${overall.pct}%` }}
                />
              </div>
              <div className={styles.kPct}>{overall.pct}%</div>
            </div>
          </div>
        )}
      </div>

      {loading && <div className={styles.help}>Loading…</div>}
      {error && <div className={styles.err}>{error}</div>}

      {!loading && !error && summary.length === 0 && (
        <div className={styles.help}>No users summarized</div>
      )}

      {!loading && !error && summary.length > 0 && (
        <div className={styles.grid}>
          {summary.map((s) => (
            <div key={s.user_id} className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.user}>{s.label}</div>
                <div className={styles.counts}>
                  <span className={styles.countNum}>{s.completed}</span>
                  <span className={styles.countSep}>/</span>
                  <span className={styles.countDen}>{s.expected}</span>
                </div>
              </div>

              <div className={styles.progressRow}>
                <div className={styles.progress}>
                  <div
                    className={`${styles.progressBar} ${pctClass(s.completion)}`}
                    style={{ width: `${s.completion}%` }}
                  />
                </div>
                <div className={styles.pct}>{s.completion}%</div>
              </div>

              <div className={styles.modList}>
                {Object.entries(s.perModule).map(([mid, v]) => {
                  const pct = v.expected ? Math.round((v.completed / v.expected) * 100) : 0;
                  return (
                    <div key={mid} className={styles.modItem} title={`${v.completed}/${v.expected}`}>
                      <div className={styles.modTitle}>{v.module_name}</div>
                      <div className={styles.modBarWrap}>
                        <div className={styles.modBar}>
                          <div
                            className={`${styles.modBarFill} ${pctClass(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className={styles.modCounts}>
                          {v.completed}/{v.expected}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}