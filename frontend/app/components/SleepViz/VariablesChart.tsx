"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SleepVizPanel.module.css";
import { VarRow } from "../../lib/types";
import { hashColor } from "../../lib/vizUtils";

type Props = {
  rows: VarRow[];
  mapping?: Record<string, string>;
  chartType?: "line" | "scatter";
  smoothingWindow?: number;
  gapHours?: number;
  maxCols?: number;
  maxUsers?: number;
};

export function VariablesChart({
  rows,
  mapping,
  chartType = "line",
  smoothingWindow = 0,
  gapHours = 6,
  maxCols = 2,
  maxUsers = 100,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byUser = useMemo(() => {
    const m = new Map<string, VarRow[]>();
    for (const r of rows) {
      if (!m.has(r.user_id)) m.set(r.user_id, []);
      m.get(r.user_id)!.push(r);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.t - b.t);
    return Array.from(m.entries())
      .sort((a, b) => (mapping?.[a[0]] ?? a[0]).localeCompare(mapping?.[b[0]] ?? b[0]))
      .slice(0, maxUsers);
  }, [rows, maxUsers, mapping]);

  const varMeta = useMemo(() => {
    const labelByVar = new Map<string, string>();
    for (const r of rows) if (!labelByVar.has(r.varId)) labelByVar.set(r.varId, r.label || r.varId);
    const order = Array.from(labelByVar.keys()).sort((a, b) =>
      (labelByVar.get(a) || a).localeCompare(labelByVar.get(b) || b)
    );
    return { labelByVar, order };
  }, [rows]);

  const gapMs = gapHours * 3600_000;

  const smooth = (pts: { t: number; v: number }[], win: number) => {
    if (!win || win <= 1) return pts;
    const N = Math.max(1, Math.floor(win));
    const out: { t: number; v: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const s = Math.max(0, i - (N - 1));
      const slice = pts.slice(s, i + 1);
      const mean = slice.reduce((a, p) => a + p.v, 0) / slice.length;
      out.push({ t: pts[i].t, v: mean });
    }
    return out;
  };

  const PANEL_W = Math.max(520, Math.floor((w - (maxCols - 1) * 16) / Math.max(1, maxCols)));
  const LEFT = 44, RIGHT = 14, TOP = 8, BOT = 28;
  const PW = PANEL_W - LEFT - RIGHT;
  const PH = 220;

  const globalMinT = rows.length ? Math.min(...rows.map((r) => r.t)) : Date.now();
  const globalMaxT = rows.length ? Math.max(...rows.map((r) => r.t)) : globalMinT + 3600_000;

  const x = (t: number) => LEFT + (PW * (t - globalMinT)) / Math.max(1, globalMaxT - globalMinT);

  const timeTicks = useMemo(() => {
    const T = globalMaxT - globalMinT || 1;
    const n = 6;
    const arr: number[] = [];
    for (let i = 0; i <= n; i++) arr.push(globalMinT + (T * i) / n);
    return arr;
  }, [globalMinT, globalMaxT]);

  const fmtTime = (ms: number) => {
    const d = new Date(ms);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}/${dd} ${hh}:${mi}`;
  };

  return (
    <div ref={ref}>
      <div className={styles.axisHeader} style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div className={styles.varsLegendWrap}>
          {varMeta.order.map((vid) => (
            <span key={vid} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: hashColor(vid) }} />
              {varMeta.labelByVar.get(vid) || vid}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(maxCols, Math.max(1, byUser.length))}, ${PANEL_W}px)`,
          gap: 16,
          paddingTop: 12,
        }}
      >
        {byUser.map(([uid, arr]) => {
          const userLabel = mapping?.[uid] ?? uid;

          const byVar = new Map<string, { t: number; v: number }[]>();
          for (const r of arr) {
            if (!byVar.has(r.varId)) byVar.set(r.varId, []);
            byVar.get(r.varId)!.push({ t: r.t, v: r.value });
          }
          for (const [, pts] of byVar) pts.sort((a, b) => a.t - b.t);

          const allVals: number[] = [];
          for (const pts of byVar.values()) for (const p of pts) allVals.push(p.v);
          const vMin = allVals.length ? Math.floor(Math.min(...allVals)) : 0;
          const vMax = allVals.length ? Math.ceil(Math.max(...allVals)) : 1;
          const y = (v: number) => TOP + PH - (PH * (v - vMin)) / Math.max(1e-6, vMax - vMin || 1);

          const intTicks: number[] = [];
          for (let v = vMin; v <= vMax; v++) intTicks.push(v);

          return (
            <div key={uid} className={styles.canvasCard}>
              <div className={styles.statTitle} style={{ padding: "8px 12px" }}>
                {userLabel}{userLabel !== uid ? ` (${uid})` : ""}
              </div>

              <svg width={PANEL_W} height={TOP + PH + BOT}>
                {timeTicks.map((t) => (
                  <line key={t} x1={x(t)} y1={TOP} x2={x(t)} y2={TOP + PH} stroke="#e5e7eb" />
                ))}
                {intTicks.map((v) => (
                  <line key={v} x1={LEFT} y1={y(v)} x2={LEFT + PW} y2={y(v)} stroke="#f1f5f9" />
                ))}

                <line x1={LEFT} y1={TOP} x2={LEFT} y2={TOP + PH} stroke="#9ca3af" />
                <line x1={LEFT} y1={TOP + PH} x2={LEFT + PW} y2={TOP + PH} stroke="#9ca3af" />

                {timeTicks.map((t, i) => (
                  <text key={i} x={x(t)} y={TOP + PH + 18} fontSize="10" fill="#6b7280" textAnchor="middle">
                    {fmtTime(t)}
                  </text>
                ))}
                {intTicks.map((v, i) => (
                  <text key={i} x={LEFT - 6} y={y(v) + 3} fontSize="10" fill="#6b7280" textAnchor="end">
                    {v}
                  </text>
                ))}

                {Array.from(byVar.keys())
                  .sort((a, b) => (varMeta.labelByVar.get(a)! || a).localeCompare(varMeta.labelByVar.get(b)! || b))
                  .map((vid) => {
                    const pts0 = byVar.get(vid) || [];
                    const pts = smooth(pts0, smoothingWindow);
                    const stroke = hashColor(vid);

                    if (chartType === "scatter") {
                      return (
                        <g key={vid}>
                          {pts.map((p, j) => (
                            <circle key={j} cx={x(p.t)} cy={y(p.v)} r={2.8} fill={stroke} opacity={0.95} />
                          ))}
                        </g>
                      );
                    }

                    const segs: string[] = [];
                    for (let i = 0; i < pts.length; i++) {
                      const a = pts[i];
                      if (i === 0) {
                        segs.push(`M ${x(a.t)} ${y(a.v)}`);
                      } else {
                        const b = pts[i - 1];
                        if (a.t - b.t > gapMs) {
                          segs.push(`M ${x(a.t)} ${y(a.v)}`);
                        } else {
                          segs.push(`L ${x(a.t)} ${y(a.v)}`);
                        }
                      }
                    }
                    return (
                      <g key={vid}>
                        <path d={segs.join(" ")} fill="none" stroke={stroke} strokeWidth={1.8} opacity={0.95} />
                      </g>
                    );
                  })}
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}