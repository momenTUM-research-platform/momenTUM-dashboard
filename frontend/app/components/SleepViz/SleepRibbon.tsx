"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SleepRow } from "../../lib/types";
import { hashColor, median } from "../../lib/vizUtils";
import styles from "./SleepVizPanel.module.css";

type DurationBands = { shortMaxMin: number; longMinMin: number };
type DurationCategory = "missing" | "short" | "normal" | "long";

export function SleepRibbon({
  data,
  mapping,
  mappingName = "Mapped ID",
  durationBands = { shortMaxMin: 360, longMinMin: 540 },
}: {
  data: SleepRow[];
  mapping?: Record<string, string>;
  mappingName?: string;
  durationBands?: DurationBands;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(900);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayId = (uid: string) => mapping?.[uid] ?? uid;

  const groups = useMemo(() => {
    const m = new Map<string, SleepRow[]>();
    for (const r of data) {
      if (!m.has(r.user_id)) m.set(r.user_id, []);
      m.get(r.user_id)!.push(r);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.date.localeCompare(b.date));
    return Array.from(m.entries());
  }, [data]);

  const LEFT_LABEL_W = 140;
  const AXIS_W = Math.max(640, w - 24);
  const PLOT_W = Math.max(420, AXIS_W - LEFT_LABEL_W);
  const HROW = 22;
  const GAP = 6;

  const START_MIN = 20 * 60;
  const END_MIN = 38 * 60;
  const MINUTES_SPAN = END_MIN - START_MIN;

  const timeToMins = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const addMinutes = (d: Date, mins: number) => new Date(d.getTime() + mins * 60_000);

  const diffMinutes = (start: Date, end: Date) => {
    let dt = (end.getTime() - start.getTime()) / 60000;
    if (dt < 0) dt += 24 * 60;
    return Math.round(dt);
  };

  const clampToWindow = (mins: number) => Math.min(END_MIN, Math.max(START_MIN, mins));
  const normalizeToPlotDay = (mins: number) => (mins < START_MIN ? mins + 1440 : mins);

  const xForMin = (m: number) => (((m - START_MIN + 1440) % 1440) / MINUTES_SPAN) * PLOT_W;

  const ticks = [
    { t: 20 * 60, label: "20:00" },
    { t: 23 * 60, label: "23:00" },
    { t: 26 * 60, label: "02:00" },
    { t: 29 * 60, label: "05:00" },
    { t: 32 * 60, label: "08:00" },
    { t: 35 * 60, label: "11:00" },
    { t: 38 * 60, label: "14:00" },
  ];

  const segmentFor = (start: Date, end: Date) => {
    let s = timeToMins(start);
    let e = timeToMins(end);
    if (e < s) e += 24 * 60;

    const S = normalizeToPlotDay(s);
    const E = normalizeToPlotDay(e);

    const oS = clampToWindow(Math.max(S, START_MIN));
    const oE = clampToWindow(Math.min(E, END_MIN));

    return oE > oS ? [{ s: oS, e: oE }] : [];
  };

  const categoryForDuration = (mins?: number | null): DurationCategory => {
    if (mins == null) return "missing";
    if (mins < durationBands.shortMaxMin) return "short";
    if (mins > durationBands.longMinMin) return "long";
    return "normal";
  };

  const fillForCategory = (cat: DurationCategory) => {
    if (cat === "short") return "#ef4444";
    if (cat === "long") return "#f59e0b";
    if (cat === "normal") return "#22c55e";
    return "#9ca3af";
  };

  const fmtDuration = (mins: number) => `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}m`;

  return (
    <div ref={ref} className={styles.ribbonWrap}>
      {groups.map(([user, rows]) => {
        const pretty = displayId(user);
        const showRaw = pretty !== user;
        const userColor = hashColor(pretty);

        const startMins = rows
          .map((r) => (r.trySleepTime ? timeToMins(r.trySleepTime) : null))
          .filter((x): x is number => x != null);

        const endMins = rows
          .map((r) => {
            const end = r.finalAwakeningTime ?? r.outOfBedTime ?? null;
            return end ? timeToMins(end) : null;
          })
          .filter((x): x is number => x != null);

        const medStart = median(startMins);
        const medEnd = median(endMins);

        const svgH = rows.length * (HROW + GAP) + 6;
        const svgW = LEFT_LABEL_W + Math.max(420, AXIS_W - LEFT_LABEL_W);

        const bandRects: Array<{ x: number; w: number }> = [];
        if (medStart != null && medEnd != null) {
          const S = normalizeToPlotDay(medStart);
          const E = normalizeToPlotDay(medEnd);
          const segs = E >= S ? [{ s: S, e: E }] : [{ s: S, e: END_MIN }, { s: START_MIN, e: E }];

          for (const seg of segs) {
            const x = LEFT_LABEL_W + xForMin(seg.s);
            const w = Math.max(1, xForMin(seg.e) - xForMin(seg.s));
            bandRects.push({ x, w });
          }
        }

        return (
          <div key={user} className={styles.userBlock}>
            <div className={styles.userHeader}>
              <div className={styles.userChip} style={{ borderColor: userColor, color: userColor }}>
                {pretty}
              </div>
              {showRaw ? (
                <div className={styles.userSub}>
                  {mappingName}: <code>{pretty}</code> <span className={styles.rawGray}>({user})</span>
                </div>
              ) : (
                <div className={styles.userSub}>
                  <code>{user}</code>
                </div>
              )}
            </div>

            <div className={styles.canvasCard}>
              <div className={styles.axisHeader}>
                <div style={{ width: LEFT_LABEL_W }} />
                <div style={{ width: Math.max(420, AXIS_W - LEFT_LABEL_W), position: "relative", height: 16 }}>
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

              <div className={styles.legendWrap}>
                <div className={styles.legendSection}>
                  <div className={styles.legendTitle}>Layers</div>
                  <div className={styles.legendRow}>
                    <span className={styles.legendItem}>
                      <span
                        className={styles.swatch}
                        style={{ background: "#11182714", border: "1px solid #11182733", boxShadow: "none" }}
                      />
                      Try sleep → out of bed (window)
                    </span>
                    <span className={styles.legendItem}>
                      <span
                        className={styles.swatch}
                        style={{ background: "#111827", border: "1px solid #111827", boxShadow: "none" }}
                      />
                      Sleep onset (dot)
                    </span>
                    <span className={styles.legendItem}>
                      <span className={styles.swatch} style={{ background: "#22c55e" }} />
                      Asleep (onset → end), colored by TST
                    </span>
                  </div>
                </div>

                <div className={styles.legendSection}>
                  <div className={styles.legendTitle}>TST categories</div>
                  <div className={styles.legendRow}>
                    <span className={styles.legendItem}>
                      <span className={styles.swatch} style={{ background: "#ef4444" }} /> Short (&lt;
                      {Math.round(durationBands.shortMaxMin / 60)}h)
                    </span>
                    <span className={styles.legendItem}>
                      <span className={styles.swatch} style={{ background: "#22c55e" }} /> Normal (
                      {Math.round(durationBands.shortMaxMin / 60)}–{Math.round(durationBands.longMinMin / 60)}h)
                    </span>
                    <span className={styles.legendItem}>
                      <span className={styles.swatch} style={{ background: "#f59e0b" }} /> Long (&gt;
                      {Math.round(durationBands.longMinMin / 60)}h)
                    </span>
                    <span className={styles.legendItem}>
                      <span className={styles.swatch} style={{ background: "#9ca3af" }} /> Missing
                    </span>
                  </div>
                </div>

                <div className={styles.legendSection}>
                  <div className={styles.legendTitle}>Overlays</div>
                  <div className={styles.legendRow}>
                    <span className={styles.legendItem}>
                      <span
                        className={styles.swatch}
                        style={{ background: "#11182710", boxShadow: "none", border: "1px dashed #11182740" }}
                      />
                      Median window (band)
                    </span>
                    <span className={styles.legendItem}>
                      <span
                        className={styles.swatch}
                        style={{ background: "transparent", boxShadow: "none", border: "1px dashed #111827" }}
                      />
                      Median try-sleep & end (dashed lines)
                    </span>
                  </div>
                </div>
              </div>

              <svg width={svgW} height={svgH}>
                {ticks.map((tk, i) => (
                  <line
                    key={i}
                    x1={LEFT_LABEL_W + xForMin(tk.t)}
                    y1={0}
                    x2={LEFT_LABEL_W + xForMin(tk.t)}
                    y2={svgH}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                ))}

                {bandRects.map((b, i) => (
                  <rect
                    key={`band-${i}`}
                    x={b.x}
                    y={0}
                    width={b.w}
                    height={svgH}
                    fill="#11182710"
                    stroke="#11182740"
                    strokeDasharray="4 4"
                    rx={2}
                  />
                ))}

                {rows.map((r, i) => {
                  const y = i * (HROW + GAP) + 4;

                  const onset =
                    r.sleepOnsetTime ??
                    (r.trySleepTime && r.sleepLatencyMin != null ? addMinutes(r.trySleepTime, r.sleepLatencyMin) : null);

                  const end = r.finalAwakeningTime ?? r.outOfBedTime ?? null;

                  const windowSegs = r.trySleepTime && r.outOfBedTime ? segmentFor(r.trySleepTime, r.outOfBedTime) : [];
                  const asleepSegs = onset && end ? segmentFor(onset, end) : [];

                  const sleepPeriodMin = onset && end ? diffMinutes(onset, end) : null;
                  const wasoMin = r.awakeningsDurationMin ?? null;

                  const tstMin =
                    sleepPeriodMin == null ? null : wasoMin == null ? sleepPeriodMin : Math.max(0, sleepPeriodMin - wasoMin);

                  const inclNapsMin = tstMin == null ? null : r.napMinutes == null ? tstMin : tstMin + r.napMinutes;

                  const cat = categoryForDuration(tstMin);
                  const fill = fillForCategory(cat);

                  return (
                    <g key={`${r.date}-${i}`} transform={`translate(0, ${y})`}>
                      <text x={8} y={HROW - 6} fontSize="11" fill="#374151">
                        {r.date}
                      </text>

                      {windowSegs.map((seg, j) => {
                        const x = LEFT_LABEL_W + xForMin(seg.s);
                        const w = Math.max(3, xForMin(seg.e) - xForMin(seg.s));
                        return (
                          <rect
                            key={`window-${j}`}
                            x={x}
                            y={2}
                            width={w}
                            height={HROW - 6}
                            rx={4}
                            fill="#11182714"
                            stroke={userColor}
                            strokeWidth={1}
                            opacity={0.9}
                          />
                        );
                      })}

                      {asleepSegs.map((seg, j) => {
                        const x = LEFT_LABEL_W + xForMin(seg.s);
                        const w = Math.max(3, xForMin(seg.e) - xForMin(seg.s));
                        return (
                          <rect
                            key={`sleep-${j}`}
                            x={x}
                            y={5}
                            width={w}
                            height={HROW - 12}
                            rx={4}
                            fill={fill}
                            stroke={userColor}
                            strokeWidth={1}
                            opacity={0.95}
                          />
                        );
                      })}

                      {onset && (
                        <circle
                          cx={LEFT_LABEL_W + xForMin(normalizeToPlotDay(timeToMins(onset)))}
                          cy={(HROW - 6) / 2 + 2}
                          r={3}
                          fill="#111827"
                          opacity={0.85}
                        />
                      )}

                      <text x={svgW - 8} y={HROW - 6} fontSize="10" fill="#6b7280" textAnchor="end">
                        {tstMin != null ? `TST ${fmtDuration(tstMin)}` : "TST —"}
                        {wasoMin != null ? ` · WASO ${wasoMin}m` : ""}
                        {sleepPeriodMin != null ? ` · period ${fmtDuration(sleepPeriodMin)}` : ""}
                        {r.napMinutes != null ? ` · naps ${r.napMinutes}m` : ""}
                        {r.napCount != null ? ` · n ${r.napCount}` : ""}
                        {inclNapsMin != null && r.napMinutes != null ? ` · incl ${fmtDuration(inclNapsMin)}` : ""}
                      </text>
                    </g>
                  );
                })}

                {medStart != null && (
                  <line
                    x1={LEFT_LABEL_W + xForMin(normalizeToPlotDay(medStart))}
                    y1={0}
                    x2={LEFT_LABEL_W + xForMin(normalizeToPlotDay(medStart))}
                    y2={svgH}
                    stroke="#111827"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                )}
                {medEnd != null && (
                  <line
                    x1={LEFT_LABEL_W + xForMin(normalizeToPlotDay(medEnd))}
                    y1={0}
                    x2={LEFT_LABEL_W + xForMin(normalizeToPlotDay(medEnd))}
                    y2={svgH}
                    stroke="#111827"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                )}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}