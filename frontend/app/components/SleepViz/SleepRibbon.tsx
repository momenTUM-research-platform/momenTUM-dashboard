"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { SleepRow } from "../../lib/types";
import { hashColor, median } from "../../lib/vizUtils";
import styles from "./SleepVizPanel.module.css";

export function SleepRibbon({
  data,
  mapping,
  mappingName = "Mapped ID",
  durationBands = { shortMaxMin: 360, longMinMin: 540 },
}: {
  data: SleepRow[];
  mapping?: Record<string, string>;
  mappingName?: string;
  durationBands?: { shortMaxMin: number; longMinMin: number };
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
  const timeToMins = (d: Date) => d.getHours() * 60 + d.getMinutes();

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
  const HROW = 22, GAP = 6;

  const START_MIN = 20 * 60, END_MIN = 38 * 60;
  const MINUTES_SPAN = END_MIN - START_MIN;
  const xForMin = (m: number) => (((m - START_MIN + 1440) % 1440) / MINUTES_SPAN) * PLOT_W;

  const ticks = [
    { t: 20 * 60, label: "20:00" }, { t: 23 * 60, label: "23:00" }, { t: 26 * 60, label: "02:00" },
    { t: 29 * 60, label: "05:00" }, { t: 32 * 60, label: "08:00" }, { t: 35 * 60, label: "11:00" },
    { t: 38 * 60, label: "14:00" },
  ];

  const categoryForDuration = (mins?: number | null) => {
    if (mins == null) return "missing" as const;
    if (mins < durationBands.shortMaxMin) return "short" as const;
    if (mins > durationBands.longMinMin) return "long" as const;
    return "normal" as const;
  };

  return (
    <div ref={ref} className={styles.ribbonWrap}>
      {groups.map(([user, rows]) => {
        const pretty = displayId(user);
        const showRaw = pretty !== user;
        const userColor = hashColor(pretty);

        const bedMins = rows.map(r => r.bedtime).filter((d): d is Date => !!d).map(timeToMins);
        const riseMins = rows.map(r => r.risetime).filter((d): d is Date => !!d).map(timeToMins);
        const medBed = median(bedMins), medRise = median(riseMins);

        const svgH = rows.length * (HROW + GAP) + 6;
        const bandRects: Array<{ x: number; w: number }> = [];
        if (medBed != null && medRise != null) {
          const B = medBed < START_MIN ? medBed + 1440 : medBed;
          const R = medRise < START_MIN ? medRise + 1440 : medRise;
          const segs = R >= B ? [{ s: B, e: R }] : [{ s: B, e: END_MIN }, { s: START_MIN, e: R }];
          segs.forEach(({ s, e }) => {
            const x = LEFT_LABEL_W + xForMin(s);
            const w = Math.max(1, xForMin(e) - xForMin(s));
            bandRects.push({ x, w });
          });
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
                <div className={styles.userSub}><code>{user}</code></div>
              )}
            </div>

            <div className={styles.canvasCard}>
              <div className={styles.axisHeader}>
                <div style={{ width: LEFT_LABEL_W }} />
                <div style={{ width: Math.max(420, AXIS_W - LEFT_LABEL_W), position: "relative", height: 16 }}>
                  {ticks.map((tk) => (
                    <div key={tk.t} style={{ position: "absolute", left: xForMin(tk.t), top: 0, transform: "translateX(-50%)" }}>
                      {tk.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.durationLegend}>
                <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "#ef4444" }} /> Short (&lt;{Math.round(durationBands.shortMaxMin/60)}h)</span>
                <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "#22c55e" }} /> Normal ({Math.round(durationBands.shortMaxMin/60)}–{Math.round(durationBands.longMinMin/60)}h)</span>
                <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "#f59e0b" }} /> Long (&gt;{Math.round(durationBands.longMinMin/60)}h)</span>
                <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "#9ca3af" }} /> Missing</span>
                <span className={`${styles.legendItem} ${styles.overlayLegend}`}>
                  <span className={styles.swatch} style={{ background: "#11182710", boxShadow: "none", border: "1px dashed #11182740" }} />
                  Median band &nbsp;|&nbsp;
                  <span className={styles.swatch} style={{ background: "transparent", boxShadow: "none", border: "1px dashed #111827" }} />
                  Median bedtime/risetime
                </span>
              </div>

              <svg width={LEFT_LABEL_W + Math.max(420, AXIS_W - LEFT_LABEL_W)} height={svgH}>
                {ticks.map((tk, i) => (
                  <line key={i} x1={LEFT_LABEL_W + xForMin(tk.t)} y1={0} x2={LEFT_LABEL_W + xForMin(tk.t)} y2={svgH} stroke="#e5e7eb" strokeWidth={1} />
                ))}

                {bandRects.map((b, i) => (
                  <rect key={`band-${i}`} x={b.x} y={0} width={b.w} height={svgH} fill="#11182710" stroke="#11182740" strokeDasharray="4 4" rx={2} />
                ))}

                {rows.map((r, i) => {
                  const y = i * (HROW + GAP) + 4;
                  const timeToM = (d: Date) => d.getHours() * 60 + d.getMinutes();
                  const segs = (() => {
                    if (!r.bedtime || !r.risetime) return [];
                    let s = timeToM(r.bedtime), e = timeToM(r.risetime);
                    if (e < s) e += 24 * 60;
                    const clamp = (v: number) => Math.min(END_MIN, Math.max(START_MIN, v));
                    const S = s < START_MIN ? s + 1440 : s;
                    const E = e < START_MIN ? e + 1440 : e;
                    const oS = clamp(Math.max(S, START_MIN));
                    const oE = clamp(Math.min(E, END_MIN));
                    return oE > oS ? [{ s: oS, e: oE }] : [];
                  })();

                  return (
                    <g key={`${r.date}-${i}`} transform={`translate(0, ${y})`}>
                      <text x={8} y={HROW - 6} fontSize="11" fill="#374151">{r.date}</text>
                      {segs.map((seg, j) => {
                        const x = LEFT_LABEL_W + xForMin(seg.s);
                        const w = Math.max(3, xForMin(seg.e) - xForMin(seg.s));
                        const cat = categoryForDuration(r.durationMin);
                        const fill = cat === "short" ? "#ef4444" : cat === "long" ? "#f59e0b" : cat === "normal" ? "#22c55e" : "#9ca3af";
                        return <rect key={j} x={x} y={2} width={w} height={HROW - 6} rx={4} fill={fill} stroke={userColor} strokeWidth={1} opacity={0.95} />;
                      })}
                      <text x={LEFT_LABEL_W + Math.max(420, AXIS_W - LEFT_LABEL_W) - 8} y={HROW - 6} fontSize="10" fill="#6b7280" textAnchor="end">
                        {r.durationMin != null ? `${Math.round(r.durationMin / 60)}h${String(r.durationMin % 60).padStart(2, "0")}m` : "—"}
                        {r.awakenings != null ? ` · wakes:${r.awakenings}` : ""}
                        {r.napMinutes != null ? ` · naps:${r.napMinutes}m` : ""}
                      </text>
                    </g>
                  );
                })}

                {medBed != null && <line x1={LEFT_LABEL_W + xForMin(medBed)} y1={0} x2={LEFT_LABEL_W + xForMin(medBed)} y2={svgH} stroke="#111827" strokeWidth={1} strokeDasharray="4 4" />}
                {medRise != null && <line x1={LEFT_LABEL_W + xForMin(medRise)} y1={0} x2={LEFT_LABEL_W + xForMin(medRise)} y2={svgH} stroke="#111827" strokeWidth={1} strokeDasharray="4 4" />}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}