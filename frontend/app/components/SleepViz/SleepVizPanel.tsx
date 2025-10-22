"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchStudyQuestions,
  fetchLabeledResponses,
  StudyQuestion,
} from "@/app/lib/responses";
import { LabeledSurveyResponseOut } from "@/app/types/schemas";
import styles from "./SleepVizPanel.module.css";

/** Props: reuse the same filters user picked in the main view */
type Props = {
  studyId: string;
  userIds?: string[];
  from?: string;
  to?: string;
  /** Optional user_id -> pretty label mapping (e.g., participant ID) */
  mapping?: Record<string, string>;
  /** UI label for mapping (shown in legend), defaults to "Mapped ID" */
  mappingName?: string;
};

type RoleKey = "bedtime" | "risetime" | "diaryDate" | "awakenings" | "napMinutes";

/** Helpers: filter questions by kind  */
const isTime = (q: StudyQuestion) => q.type === "datetime" && q.subtype === "time";
const isDate = (q: StudyQuestion) => q.type === "datetime" && q.subtype === "date";
const isNumeric = (q: StudyQuestion) =>
  (q.type === "text" && q.subtype === "numeric") || q.type === "number";

/** Parse utils */
const toDate = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(+d) ? null : d;
};
const toInt = (v: unknown) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

/** A normalized record per (user, date) for plotting */
type SleepRow = {
  user_id: string;
  date: string;              // YYYY-MM-DD (local)
  bedtime?: Date | null;
  risetime?: Date | null;
  durationMin?: number | null; // if both present
  awakenings?: number | null;
  napMinutes?: number | null;
};

export default function SleepVizPanel({
  studyId,
  userIds,
  from,
  to,
  mapping,
  mappingName = "Mapped ID",
}: Props) {
  const [questions, setQuestions] = useState<StudyQuestion[] | null>(null);
  const [loadingQ, setLoadingQ] = useState(false);

  // Role selection (module_id:question_id)
  const [roles, setRoles] = useState<Record<RoleKey, string>>({
    bedtime: "",
    risetime: "",
    diaryDate: "",
    awakenings: "",
    napMinutes: "",
  });

  const [loadingData, setLoadingData] = useState(false);
  const [rows, setRows] = useState<LabeledSurveyResponseOut[]>([]);
  const [normalized, setNormalized] = useState<SleepRow[]>([]);

  // 1) load questions once
  useEffect(() => {
    (async () => {
      setLoadingQ(true);
      try {
        const qs = await fetchStudyQuestions(studyId);
        setQuestions(qs);
      } finally {
        setLoadingQ(false);
      }
    })();
  }, [studyId]);

  // Group questions by module
  const grouped = useMemo(() => {
    if (!questions) return [];
    const byMod = new Map<
      string,
      { module_id: string; module_name: string; items: StudyQuestion[] }
    >();
    for (const q of questions) {
      if (!byMod.has(q.module_id))
        byMod.set(q.module_id, {
          module_id: q.module_id,
          module_name: q.module_name,
          items: [],
        });
      byMod.get(q.module_id)!.items.push(q);
    }
    const list = Array.from(byMod.values());
    list.sort((a, b) =>
      (a.module_name || a.module_id).localeCompare(b.module_name || b.module_id)
    );
    list.forEach((g) =>
      g.items.sort((a, b) =>
        (a.question_text || "").localeCompare(b.question_text || "")
      )
    );
    return list;
  }, [questions]);

  // 2) fetch raw labeled responses for all selected modules (from the chosen roles)
  const chosenModules = useMemo(() => {
    const mods = new Set<string>();
    Object.values(roles).forEach((key) => {
      if (!key) return;
      const [mid] = key.split(":");
      if (mid) mods.add(mid);
    });
    return Array.from(mods);
  }, [roles]);

  const canQuery = chosenModules.length > 0 && (roles.bedtime || roles.risetime);

  const fetchData = async () => {
    if (!canQuery) {
      setRows([]);
      setNormalized([]);
      return;
    }
    setLoadingData(true);
    try {
      const res = await fetchLabeledResponses(studyId, {
        user_id: userIds && userIds.length ? userIds : undefined,
        module_id: chosenModules,
        from: from || undefined,
        to: to || undefined,
        sort: "desc",
        limit: 5000,
      });
      setRows(res);
    } finally {
      setLoadingData(false);
    }
  };

  // 3) normalize into SleepRow[]
  useEffect(() => {
    if (!rows?.length) {
      setNormalized([]);
      return;
    }
    const toQid = (k: string) => (k ? k.split(":")[1] : "");

    const btQ = toQid(roles.bedtime);
    const rtQ = toQid(roles.risetime);
    const ddQ = toQid(roles.diaryDate);
    const awQ = toQid(roles.awakenings);
    const npQ = toQid(roles.napMinutes);

    const bucket = new Map<string, SleepRow>(); // key = user_id|YYYY-MM-DD

    for (const r of rows) {
      const ans = r.responses || {};
      const bedtime = btQ ? toDate(ans[btQ]) : null;
      const risetime = rtQ ? toDate(ans[rtQ]) : null;
      const awakenings = awQ ? toInt(ans[awQ]) : null;
      const napMinutes = npQ ? toInt(ans[npQ]) : null;

      // derive the day label:
      // 1) if diaryDate exists -> that (normalized to local YYYY-MM-DD)
      // 2) else use local date of risetime
      // 3) else local date of response_time
      const pickDay = () => {
        let d = ddQ ? toDate(ans[ddQ]) : null;
        if (!d && risetime) d = risetime;
        if (!d) d = new Date(r.response_time);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${da}`;
      };

      const yyyyMmDd = pickDay();
      const key = `${r.user_id}|${yyyyMmDd}`;
      if (!bucket.has(key)) {
        bucket.set(key, {
          user_id: r.user_id,
          date: yyyyMmDd,
          bedtime: null,
          risetime: null,
          awakenings: null,
          napMinutes: null,
          durationMin: null,
        });
      }
      const row = bucket.get(key)!;

      // Prefer last non-null we see (responses are sorted desc by time)
      if (bedtime && !row.bedtime) row.bedtime = bedtime;
      if (risetime && !row.risetime) row.risetime = risetime;
      if (awakenings !== null && row.awakenings == null) row.awakenings = awakenings;
      if (napMinutes !== null && row.napMinutes == null) row.napMinutes = napMinutes;
    }

    // compute duration
    for (const r of bucket.values()) {
      if (r.bedtime && r.risetime) {
        let dt = (r.risetime.getTime() - r.bedtime.getTime()) / 60000; // minutes
        if (dt < 0) dt += 24 * 60; // cross-midnight
        r.durationMin = Math.round(dt);
      }
    }

    // sort by user, then date
    const arr = Array.from(bucket.values()).sort((a, b) =>
      a.user_id === b.user_id ? a.date.localeCompare(b.date) : a.user_id.localeCompare(b.user_id)
    );
    setNormalized(arr);
  }, [rows, roles]);

  return (
    <div className={styles.wrap}>
      {/* Role pickers */}
      <div className={styles.roles}>
        <RoleSelect
          title="Bedtime (time)"
          value={roles.bedtime}
          setValue={(v) => setRoles((s) => ({ ...s, bedtime: v }))}
          groups={grouped}
          filter={isTime}
          placeholder="Select bedtime question"
        />
        <RoleSelect
          title="Risetime (time)"
          value={roles.risetime}
          setValue={(v) => setRoles((s) => ({ ...s, risetime: v }))}
          groups={grouped}
          filter={isTime}
          placeholder="Select risetime question"
        />
        <RoleSelect
          title="Diary Date (optional)"
          value={roles.diaryDate}
          setValue={(v) => setRoles((s) => ({ ...s, diaryDate: v }))}
          groups={grouped}
          filter={isDate}
          placeholder="Select date question"
          optional
        />
        <RoleSelect
          title="Awakenings (optional)"
          value={roles.awakenings}
          setValue={(v) => setRoles((s) => ({ ...s, awakenings: v }))}
          groups={grouped}
          filter={isNumeric}
          placeholder="Select awakenings count"
          optional
        />
        <RoleSelect
          title="Nap minutes (optional)"
          value={roles.napMinutes}
          setValue={(v) => setRoles((s) => ({ ...s, napMinutes: v }))}
          groups={grouped}
          filter={isNumeric}
          placeholder="Select total nap minutes"
          optional
        />
        <div className={styles.actions}>
          <button
            className={styles.btn}
            disabled={!canQuery || loadingQ || loadingData}
            onClick={fetchData}
          >
            {loadingData ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      {/* Legend when mapping is active */}
      {mapping && (
        <div className={styles.legend}>
          Using <strong>{mappingName}</strong> where available; falling back to <code>user_id</code>.
        </div>
      )}

      {/* Chart + stats */}
      <SleepRibbon data={normalized} mapping={mapping} mappingName={mappingName} />
      <SleepStats data={normalized} mapping={mapping} mappingName={mappingName} />
    </div>
  );
}

/** RoleSelect: reuses your grouped questions and filters by type/subtype */
function RoleSelect(props: {
  title: string;
  value: string;
  setValue: (v: string) => void;
  groups: Array<{ module_id: string; module_name: string; items: StudyQuestion[] }>;
  filter: (q: StudyQuestion) => boolean;
  placeholder: string;
  optional?: boolean;
}) {
  const { title, value, setValue, groups, filter, placeholder, optional } = props;
  return (
    <div className="field">
      <label>{title}</label>
      <select
        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">{optional ? "— None —" : placeholder}</option>
        {groups.map((g) => (
          <optgroup key={g.module_id} label={g.module_name || g.module_id}>
            {g.items.filter(filter).map((q) => {
              const val = `${q.module_id}:${q.question_id}`;
              return (
                <option key={val} value={val}>
                  {q.question_text}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** SleepRibbon: “night window” */
function SleepRibbon({
  data,
  mapping,
  mappingName = "Mapped ID",
  durationBands = { shortMaxMin: 360, longMinMin: 540 }, // <6h short, >9h long
}: {
  data: SleepRow[];
  mapping?: Record<string, string>;
  mappingName?: string;
  /** thresholds in minutes: short < shortMaxMin, normal in [shortMaxMin, longMinMin], long > longMinMin */
  durationBands?: { shortMaxMin: number; longMinMin: number };
}) {
  // Duration categories (fill color)
  const DUR_COLORS = {
    short: "#ef4444",  // red-500
    normal: "#22c55e", // green-500
    long: "#f59e0b",   // amber-500
    missing: "#9ca3af" // gray-400
  };
  const categoryForDuration = (mins: number | null | undefined) => {
    if (mins == null) return "missing" as const;
    if (mins < durationBands.shortMaxMin) return "short" as const;
    if (mins > durationBands.longMinMin) return "long" as const;
    return "normal" as const;
  };
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // display helper
  const displayId = (uid: string) => mapping?.[uid] ?? uid;

  // Group by raw user (stable); only change the label via mapping
  const byUser = useMemo(() => {
    const m = new Map<string, SleepRow[]>();
    for (const r of data) {
      if (!m.has(r.user_id)) m.set(r.user_id, []);
      m.get(r.user_id)!.push(r);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.date.localeCompare(b.date));
    return Array.from(m.entries());
  }, [data]);

  // Layout constants
  const LEFT_LABEL_W = 140;               // px for date labels column
  const AXIS_W = Math.max(640, w - 24);   // total svg width (inside container)
  const PLOT_W = Math.max(420, AXIS_W - LEFT_LABEL_W);
  const HROW = 22;
  const GAP = 6;

  // Night window: 20:00 → 14:00 (next day)
  const START_MIN = 20 * 60;  // 1200
  const END_MIN = 38 * 60;    // 2280
  const MINUTES_SPAN = END_MIN - START_MIN; // 1080
  const xForMin = (m: number) => ((m - START_MIN + 1440) % 1440) / MINUTES_SPAN * PLOT_W;

  const toSegs = (bt?: Date | null, rt?: Date | null) => {
    if (!bt || !rt) return [];
    let start = bt.getHours() * 60 + bt.getMinutes();
    let end = rt.getHours() * 60 + rt.getMinutes();
    if (end < start) end += 24 * 60; // cross midnight

    const segs: Array<{ s: number; e: number }> = [];
    const clamp = (v: number) => Math.min(END_MIN, Math.max(START_MIN, v));

    const S = start < START_MIN ? start + 1440 : start; // shift into [1080, 2520)
    const E = end   < START_MIN ? end   + 1440 : end;

    const overlapS = clamp(Math.max(S, START_MIN));
    const overlapE = clamp(Math.min(E, END_MIN));
    if (overlapE > overlapS) segs.push({ s: overlapS, e: overlapE });

    return segs;
  };

  const ticks = [
    { t: 20 * 60, label: "20:00" },
    { t: 23 * 60, label: "23:00" },
    { t: 26 * 60, label: "02:00" },
    { t: 29 * 60, label: "05:00" },
    { t: 32 * 60, label: "08:00" },
    { t: 35 * 60, label: "11:00" },
    { t: 38 * 60, label: "14:00" },
  ];

  // simple, consistent color by mapped label (or user fallback)
  const colors = ["#0ea5e9","#22c55e","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4"];
  const colorFor = (uid: string) => {
    const key = displayId(uid);
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h << 5) - h + key.charCodeAt(i);
    return colors[Math.abs(h) % colors.length];
  };

  return (
    <div ref={ref} className={styles.ribbonWrap}>
      {byUser.map(([user, rows]) => {
        const pretty = displayId(user);
        const showRaw = pretty !== user;
        const userColor = colorFor(user);

        return (
          <div key={user} className={styles.userBlock}>
            <div className={styles.userHeader}>
              <div className={styles.userChip} style={{ borderColor: userColor, color: userColor }}>
                {pretty}
              </div>
              {showRaw && <div className={styles.userSub}>{mappingName}: <code>{pretty}</code> <span className={styles.rawGray}>({user})</span></div>}
              {!showRaw && <div className={styles.userSub}><code>{user}</code></div>}
            </div>

            <div className={styles.canvasCard}>
              {/* header axis */}
              <div className={styles.axisHeader}>
                <div style={{ width: LEFT_LABEL_W }} />
                <div style={{ width: PLOT_W, position: "relative", height: 16 }}>
                  {ticks.map((tk) => (
                    <div
                      key={tk.t}
                      style={{
                        position: "absolute",
                        left: xForMin(tk.t),
                        top: 0,
                        transform: "translateX(-50%)",
                      }}
                    >
                      {tk.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.durationLegend}>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: DUR_COLORS.short }} /> Short (&lt;{Math.round(durationBands.shortMaxMin/60)}h)
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: DUR_COLORS.normal }} /> Normal ({Math.round(durationBands.shortMaxMin/60)}–{Math.round(durationBands.longMinMin/60)}h)
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: DUR_COLORS.long }} /> Long (&gt;{Math.round(durationBands.longMinMin/60)}h)
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: DUR_COLORS.missing }} /> Missing
                </span>
              </div>

              {/* grid + bars */}
              <svg width={LEFT_LABEL_W + PLOT_W} height={rows.length * (HROW + GAP) + 6}>
                {/* grid lines */}
                {ticks.map((tk, i) => (
                  <line
                    key={i}
                    x1={LEFT_LABEL_W + xForMin(tk.t)}
                    y1={0}
                    x2={LEFT_LABEL_W + xForMin(tk.t)}
                    y2={rows.length * (HROW + GAP) + 6}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                ))}

                {rows.map((r, i) => {
                  const y = i * (HROW + GAP) + 4;
                  const segs = toSegs(r.bedtime, r.risetime);

                  return (
                    <g key={`${r.date}-${i}`} transform={`translate(0, ${y})`}>
                      {/* date label */}
                      <text x={8} y={HROW - 6} fontSize="11" fill="#374151">
                        {r.date}
                      </text>

                      {/* bars */}
                      {segs.map((seg, j) => {
                        const x = LEFT_LABEL_W + xForMin(seg.s);
                        const w = Math.max(3, xForMin(seg.e) - xForMin(seg.s));
                        return (
                          <rect
                            key={j}
                            x={x}
                            y={2}
                            width={w}
                            height={HROW - 6}
                            rx={4}
                            fill={DUR_COLORS[categoryForDuration(r.durationMin)]}
                            stroke={userColor}
                            strokeWidth={1}
                            opacity={0.95}
                          />
                        );
                      })}

                      {/* badges on the right */}
                      <text
                        x={LEFT_LABEL_W + PLOT_W - 8}
                        y={HROW - 6}
                        fontSize="10"
                        fill="#6b7280"
                        textAnchor="end"
                      >
                        {r.durationMin != null
                          ? `${Math.round(r.durationMin / 60)}h${String(
                              r.durationMin % 60
                            ).padStart(2, "0")}m`
                          : "—"}
                        {r.awakenings != null ? ` · wakes:${r.awakenings}` : ""}
                        {r.napMinutes != null ? ` · naps:${r.napMinutes}m` : ""}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Simple per-user stats (avg duration, median bed/risetime) – uses mapped label in headings */
function SleepStats({
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

  const fmtHM = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  };

  const timeToMins = (d: Date) => d.getHours() * 60 + d.getMinutes();

  const median = (nums: number[]) => {
    if (!nums.length) return null;
    const a = [...nums].sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
  };

  const fmtClock = (mins: number | null) => {
    if (mins == null) return "—";
    const m = (mins + 24 * 60) % (24 * 60);
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  return (
    <div className={styles.statsGrid}>
      {byUser.map(([user, rows]) => {
        const durations = rows
          .map((r) => r.durationMin)
          .filter((x): x is number => x != null);
        const avgDur = durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null;

        const bedMins = rows
          .map((r) => r.bedtime)
          .filter((d): d is Date => !!d)
          .map(timeToMins);
        const riseMins = rows
          .map((r) => r.risetime)
          .filter((d): d is Date => !!d)
          .map(timeToMins);

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
              <div>
                Avg duration:{" "}
                <span className={styles.statStrong}>
                  {avgDur != null ? fmtHM(avgDur) : "—"}
                </span>
              </div>
              <div>
                Median bedtime:{" "}
                <span className={styles.statStrong}>{fmtClock(medBed)}</span>
              </div>
              <div>
                Median risetime:{" "}
                <span className={styles.statStrong}>{fmtClock(medRise)}</span>
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