"use client";

import { useEffect, useMemo, useState } from "react";
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
  moduleIds?: string[];
  from?: string; // optional date/datetime; used only for response fetch + facets
  to?: string;   // optional date/datetime; used only for response fetch + facets
  mapping?: Record<string, string>;
  mappingName?: string;
};

type UserSummary = {
  user_id: string;
  label: string;
  expected: number;
  completed: number;
  completion: number;
  perModule: Record<string, { module_name: string; expected: number; completed: number }>;
};

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function pctClass(p: number) {
  if (p >= 70) return styles.pctGood;
  if (p >= 40) return styles.pctMid;
  return styles.pctLow;
}

function parseAnyTime(r: LabeledSurveyResponseOut): number | null {
  const s = (r.alert_time ?? r.response_time) as any;
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export default function AdherencePanel({
  studyId,
  userIds,
  moduleIds,
  from,
  to,
  mapping,
  mappingName = "Mapped ID",
}: Props) {
  const [rows, setRows] = useState<LabeledSurveyResponseOut[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);

  const [studyDays, setStudyDays] = useState<number>(7);
  const [maxOffsetDays, setMaxOffsetDays] = useState<number>(0); // ✅ restore offset support
  const [structurePerModule, setStructurePerModule] = useState<Record<string, number>>({});
  const [moduleMeta, setModuleMeta] = useState<Record<string, ModuleMeta>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UserSummary[]>([]);
  const tz = safeTZ();

  const moduleFilterSet = useMemo(() => {
    return moduleIds && moduleIds.length ? new Set(moduleIds) : null;
  }, [JSON.stringify(moduleIds)]);

  // Load responses (already filtered by userIds + from/to)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchLabeledResponses(studyId, {
          user_id: userIds && userIds.length ? userIds : undefined,
          from: from || undefined,
          to: to || undefined,
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
  }, [studyId, JSON.stringify(userIds), from, to]);

  // Load facets (same filters as responses list)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await fetchFacets(studyId, {
          user_id: userIds && userIds.length ? userIds : undefined,
          from: from || undefined,
          to: to || undefined,
        });
        if (!cancelled) setFacets(f);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studyId, JSON.stringify(userIds), from, to]);

  // Load study structure counts + meta (includes max_offset_days)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sc = await fetchAdherenceStructureCount(studyId);
        if (!cancelled) {
          setStudyDays(sc.study_days);
          setStructurePerModule(sc.per_module || {});
          setModuleMeta(sc.per_module_meta || {});
          setMaxOffsetDays(Number.isFinite(sc.max_offset_days) ? sc.max_offset_days : 0); // ✅
        }
      } catch (e) {
        console.error("structure-count failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studyId]);

  // Build per-user adherence summary
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const explicit = userIds && userIds.length ? userIds : [];
      const fromRows = Array.from(new Set(rows.map((r) => r.user_id)));
      const fromFacets = facets?.users ?? [];
      const users = Array.from(new Set([...explicit, ...fromRows, ...fromFacets])).filter(Boolean);

      if (!users.length) {
        if (!cancelled) setSummary([]);
        return;
      }

      const earliestByUser: Record<string, number> = {};
      const actualByUser: Record<string, Record<string, number[]>> = {};

      for (const r of rows) {
        const t = parseAnyTime(r);
        if (t == null) continue;

        const uid = r.user_id;
        if (earliestByUser[uid] == null || t < earliestByUser[uid]) earliestByUser[uid] = t;

        (actualByUser[uid] ||= {});
        (actualByUser[uid][r.module_id] ||= []).push(t);
      }

      for (const uid of Object.keys(actualByUser)) {
        for (const mid of Object.keys(actualByUser[uid])) {
          actualByUser[uid][mid].sort((a, b) => a - b);
        }
      }

      const out: UserSummary[] = [];
      const days = Math.max(1, studyDays);
      const offsetPad = Math.max(0, maxOffsetDays); // ✅ extend expected window for late-start modules

      for (const uid of users) {
        const baseTs = earliestByUser[uid];
        if (baseTs == null) continue;

        const baseline = new Date(baseTs);

        // ✅ IMPORTANT: extend expected window by max_offset_days
        const endDate = addDays(baseline, (days - 1) + offsetPad);

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

        if (moduleFilterSet) {
          expectedOccs = expectedOccs.filter((o) => moduleFilterSet.has(o.module_id));
        }

        const perModule: Record<string, { module_name: string; expected: number; completed: number }> =
          {};

        // seed expected with structure counts (then overwrite daily counts from expectedOccs)
        for (const [mid, expCount] of Object.entries(structurePerModule)) {
          if (moduleFilterSet && !moduleFilterSet.has(mid)) continue;
          perModule[mid] = {
            module_name: moduleMeta[mid]?.module_name || mid,
            expected: expCount,
            completed: 0,
          };
        }

        const userActual = actualByUser[uid] || {};
        let completedTotal = 0;

        // one-off ("never") modules: count at most 1 completion if any response exists
        for (const mid of Object.keys(perModule)) {
          const mm = moduleMeta[mid];
          if (mm?.repeat === "never") {
            const hits = (userActual[mid] || []).length;
            if (hits > 0) {
              const inc = 1;
              perModule[mid].completed = Math.min(inc, perModule[mid].expected || 1);
              completedTotal += perModule[mid].completed;
            }
          }
        }

        // derive expected counts per module from expectedOccs for daily modules
        const expectedCountsByModule: Record<string, number> = {};
        for (const occ of expectedOccs) {
          const mid = occ.module_id;
          const mm = moduleMeta[mid];
          if (mm?.repeat === "never") continue;
          expectedCountsByModule[mid] = (expectedCountsByModule[mid] || 0) + 1;
        }

        for (const [mid, exp] of Object.entries(expectedCountsByModule)) {
          if (!perModule[mid]) {
            perModule[mid] = {
              module_name: moduleMeta[mid]?.module_name || mid,
              expected: exp,
              completed: 0,
            };
          } else {
            perModule[mid].expected = exp;
            if (perModule[mid].module_name === mid) {
              perModule[mid].module_name = moduleMeta[mid]?.module_name || mid;
            }
          }
        }

        // match actual timestamps to expected windows (greedy per module)
        const counted: Record<string, number> = {};

        for (const occ of expectedOccs) {
          const mid = occ.module_id;
          const mm = moduleMeta[mid];
          if (mm?.repeat === "never") continue;

          const startT = Date.parse(occ.start);
          const endT = Date.parse(occ.end);
          if (!Number.isFinite(startT) || !Number.isFinite(endT)) continue;

          const times = userActual[mid] || [];
          const idx = counted[mid] || 0;

          let hit = false;
          for (let i = idx; i < times.length; i++) {
            const t = times[i];
            if (t < startT) continue;
            if (t > endT) break;
            hit = true;
            counted[mid] = i + 1;
            break;
          }

          if (hit) {
            if (!perModule[mid]) {
              perModule[mid] = {
                module_name: moduleMeta[mid]?.module_name || occ.module_name || mid,
                expected: 0,
                completed: 0,
              };
            }
            perModule[mid].completed += 1;
            completedTotal += 1;
          }
        }

        // safety clamp
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
    JSON.stringify(moduleIds),
    from,
    to,
    rows,
    facets,
    studyDays,
    maxOffsetDays, // ✅ make sure recalculates when offset arrives
    JSON.stringify(structurePerModule),
    JSON.stringify(moduleMeta),
    tz,
    JSON.stringify(mapping),
  ]);

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
            {maxOffsetDays > 0 ? (
              <> (offset-aware: +{maxOffsetDays} days)</>
            ) : null}
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