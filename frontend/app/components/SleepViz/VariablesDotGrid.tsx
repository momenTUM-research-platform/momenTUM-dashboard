"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SleepVizPanel.module.css";
import { VarRow } from "../../lib/types";
import { hashColor } from "../../lib/vizUtils";

type Props = {
  rows: VarRow[];
  mapping?: Record<string, string>;
  maxCols?: number;
  maxUsers?: number;
};

export default function VariablesDotGrid({
  rows,
  mapping,
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
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, maxUsers);
  }, [rows, maxUsers]);

  const varMeta = useMemo(() => {
    const labelByVar = new Map<string, string>();
    for (const r of rows) if (!labelByVar.has(r.varId)) labelByVar.set(r.varId, r.label || r.varId);
    const order = Array.from(labelByVar.keys()).sort((a, b) =>
      (labelByVar.get(a) || a).localeCompare(labelByVar.get(b) || b)
    );
    return { labelByVar, order };
  }, [rows]);

  const PANEL_W = Math.max(520, Math.floor((w - (maxCols - 1) * 16) / Math.max(1, maxCols)));
  const LEFT = 44, RIGHT = 14, TOP = 8, BOT = 28;
  const PW = PANEL_W - LEFT - RIGHT;
  const PH = 220;

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

          const minT = arr[0]?.t ?? Date.now();
          const maxT = arr[arr.length - 1]?.t ?? minT + 1;
          const x = (t: number) => LEFT + (PW * (t - minT)) / Math.max(1, maxT - minT);

          const byVar = new Map<string, { t: number; v: number }[]>();
          for (const r of arr) {
            if (!byVar.has(r.varId)) byVar.set(r.varId, []);
            byVar.get(r.varId)!.push({ t: r.t, v: r.value });
          }
          for (const [, pts] of byVar) pts.sort((a, b) => a.t - b.t);

          const allVals: number[] = [];
          for (const pts of byVar.values()) for (const p of pts) allVals.push(p.v);
          const vMin = Number.isFinite(Math.min(...allVals)) ? Math.floor(Math.min(...allVals)) : 0;
          const vMax = Number.isFinite(Math.max(...allVals)) ? Math.ceil(Math.max(...allVals)) : 1;
          const y = (v: number) => TOP + PH - (PH * (v - vMin)) / Math.max(1e-6, vMax - vMin || 1);
          const intTicks: number[] = [];
          for (let v = vMin; v <= vMax; v++) intTicks.push(v);

          const timeTicks: number[] = (() => {
            const n = 6, T = Math.max(1, maxT - minT), out: number[] = [];
            for (let i = 0; i <= n; i++) out.push(minT + (T * i) / n);
            return out;
          })();

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

                {Array.from(byVar.entries()).map(([vid, pts]) => {
                  const stroke = hashColor(vid);
                  return (
                    <g key={vid}>
                      {pts.map((p, j) => (
                        <circle key={j} cx={x(p.t)} cy={y(p.v)} r={2.8} fill={stroke} opacity={0.95} />
                      ))}
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