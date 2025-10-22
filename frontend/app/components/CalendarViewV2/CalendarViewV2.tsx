"use client";

import { useMemo, useState } from "react";
import FullCalendar, { EventClickArg } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin2 from "@fullcalendar/timegrid"; // alias kept for clarity if you split later
import styles from "./CalendarViewV2.module.css";
import { LabeledSurveyResponseOut } from "@/app/types/schemas";

/**
 * Calendar view for labeled schema.
 * - Group by (user_id, module_id, YYYY-MM-DD).
 * - Optionally display a mapped label for each user (e.g., participant_id).
 */

type Mapping = Record<string, string>;

type Props = {
  rows: LabeledSurveyResponseOut[];
  /** Optional mapping of user_id -> label (e.g., participant_id). */
  mapping?: Mapping;
  /** Human label for the mapping shown in UI (e.g., "Participant ID"). */
  mappingName?: string;
};

type EventDetails = {
  user_id: string;
  mapped_label: string | null;
  module_id: string;
  module_name: string;
  date: string; // YYYY-MM-DD
  responses: Array<{ question: string; answer: string }>;
  response_times: string[];
};

const palette = ["#2f80ed","#e53e3e","#38a169","#d69e2e","#805ad5","#dd6b20","#0ea5e9","#14b8a6"];
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
};

// If mapping exists, color by mapped label to visually group the same participant across devices/users.
// Otherwise color by user_id.
const colorKeyFor = (userId: string, mapped?: string | null) => mapped ?? userId;
const colorFor = (key: string) => palette[hash(key) % palette.length];

export default function CalendarViewV2({ rows, mapping, mappingName = "Mapped ID" }: Props) {
  const [selected, setSelected] = useState<EventDetails | null>(null);

  const events = useMemo(() => {
    // key = user|module|YYYY-MM-DD (bucketing always by raw user to avoid accidental cross-user merge)
    const buckets = new Map<string, EventDetails>();

    for (const r of rows) {
      const date = new Date(r.response_time).toISOString().slice(0, 10);
      const key = `${r.user_id}|${r.module_id}|${date}`;

      const mappedLabel = mapping ? (mapping[r.user_id] ?? null) : null;

      if (!buckets.has(key)) {
        buckets.set(key, {
          user_id: r.user_id,
          mapped_label: mappedLabel,
          module_id: r.module_id,
          module_name: r.module_name,
          date,
          responses: [],
          response_times: [],
        });
      }

      const b = buckets.get(key)!;
      // (If the first row had no mapping but a later row does, keep the label)
      if (!b.mapped_label && mappedLabel) b.mapped_label = mappedLabel;

      for (const a of r.answers) {
        b.responses.push({
          question: a.question_text ?? a.question_id,
          answer: String(a.answer),
        });
      }
      b.response_times.push(String(r.response_time));
    }

    // Produce FullCalendar events
    return Array.from(buckets.values()).map((b) => {
      const displayId = b.mapped_label ?? b.user_id;
      const title = b.mapped_label
        ? `${b.module_name} • ${displayId}`
        : `${b.module_name} • ${b.user_id}`;

      const colorKey = colorKeyFor(b.user_id, b.mapped_label ?? null);

      return {
        title,
        start: `${b.date}T12:00:00`, // representative time for the day
        color: colorFor(colorKey),
        textColor: "#fff",
        extendedProps: b,
      };
    });
  }, [rows, mapping]);

  return (
    <div className={styles.wrapper}>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        height="80vh"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={events}
        eventClick={(arg: EventClickArg) => {
          setSelected(arg.event.extendedProps as EventDetails);
        }}
      />

      {/* legend chip when mapping is active */}
      {mapping && (
        <div className="mt-2 text-xs text-gray-600">
          Coloring & titles use <span className="font-medium">{mappingName}</span> when available; otherwise <code>user_id</code>.
        </div>
      )}

      {selected && (
        <div className={styles.modalBackdrop} onClick={() => setSelected(null)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="font-semibold">
                {selected.module_name} —{" "}
                {selected.mapped_label ? (
                  <>
                    {selected.mapped_label} <span className="text-gray-400">({selected.user_id})</span>
                  </>
                ) : (
                  selected.user_id
                )}{" "}
                <span className="text-gray-500">({selected.date})</span>
              </h3>
              <button
                className={styles.closeBtn}
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              {selected.mapped_label && (
                <div className="text-xs text-gray-500 mb-1">
                  {mappingName}: <span className="font-medium">{selected.mapped_label}</span>
                </div>
              )}
              <div className="text-xs text-gray-500 mb-2">
                {selected.response_times.length} submission(s)
              </div>
              <ul className={styles.qaList}>
                {selected.responses.map((qa, idx) => (
                  <li key={idx}>
                    <span className={styles.q}>{qa.question}</span>{" "}
                    <span className={styles.a}>{qa.answer}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}