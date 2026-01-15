"use client";

import React, { useMemo, useState, useEffect } from "react";
import FullCalendar, { EventClickArg } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import styles from "./CalendarViewV2.module.css";
import { LabeledSurveyResponseOut } from "@/app/types/schemas";

import EventDetail, { ExtendedEventProps } from "../EventDetail/EventDetail";
import NoteModal from "../NoteModal/NoteModal";
import NoteViewerModal from "../NoteModal/NoteViewerModal";

/**
 * Calendar view for labeled schema (v2).
 * - Group by (user_id, module_id, YYYY-MM-DD).
 * - Optionally display a mapped label for each user (e.g., participant_id).
 * - Clicking an event opens EventDetail (with per-question answer arrays and timestamps).
 * - Day cells support per-date notes per participant (stored in localStorage).
 */

type Mapping = Record<string, string>;

type Props = {
  rows: LabeledSurveyResponseOut[];
  mapping?: Mapping;           // user_id -> pretty label
  mappingName?: string;        // e.g. "Participant ID"
};

type Bucket = {
  user_id: string;
  mapped_label: string | null;
  module_id: string;
  module_name: string;
  date: string; // YYYY-MM-DD
  // aggregated QA: question -> { answers: any[], responseTimes: string[] }
  aggregated: Record<string, { answers: any[]; responseTimes: string[] }>;
  // representative times (for info)
  response_times: string[];
};

const palette = ["#2f80ed","#e53e3e","#38a169","#d69e2e","#805ad5","#dd6b20","#0ea5e9","#14b8a6"];
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
};
const colorKeyFor = (userId: string, mapped?: string | null) => mapped ?? userId;
const colorFor = (key: string) => palette[hash(key) % palette.length];

// Notes storage key (v2 to avoid collisions with older view)
const NOTES_KEY = "calendarNotesV2";

/** Build the display key for a user for the notes UI. */
const userDisplayKey = (userId: string, mapped?: string | null) =>
  mapped ? `${mapped} (${userId})` : userId;

/** Convert a bucket to EventDetail payload. */
const bucketToExtended = (b: Bucket): ExtendedEventProps => {
  const details: Record<string, any> = {};
  // Pass the aggregated shape that EventDetail understands (answers[] + responseTimes[])
  for (const [q, agg] of Object.entries(b.aggregated)) {
    details[q] = {
      answers: agg.answers,
      responseTimes: agg.responseTimes,
    };
  }
  // Use the *latest* response_time as representative
  const responseTime = (() => {
    if (!b.response_times.length) return undefined;
    const latest = b.response_times
      .map((t) => new Date(t).getTime())
      .reduce((a, b) => Math.max(a, b), 0);
    return new Date(latest).toISOString();
  })();

  return {
    extractedStudyId: b.mapped_label ?? b.user_id,
    moduleName: b.module_name,
    responseTime,
    details,
    type: "structured",
  };
};

export default function CalendarViewV2({ rows, mapping, mappingName = "Mapped ID" }: Props) {
  // Event detail modal state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<ExtendedEventProps | null>(null);

  // Notes modal state
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedViewerNote, setSelectedViewerNote] = useState<{ user: string; note: string } | null>(null);
  const [notes, setNotes] = useState<Record<string, { [user: string]: string }>>({});
  const [allUsers, setAllUsers] = useState<string[]>([]); // for NoteModal selector

  // Load/save notes
  useEffect(() => {
    const raw = localStorage.getItem(NOTES_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, { [user: string]: string }>;
        setNotes(parsed);
      } catch {
        // ignore parse errors
      }
    }
  }, []);
  const saveNotes = (obj: typeof notes) => {
    setNotes(obj);
    localStorage.setItem(NOTES_KEY, JSON.stringify(obj));
  };

  // Build the list of available user display keys for NoteModal (based on rows in view)
  useEffect(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const display = userDisplayKey(r.user_id, mapping?.[r.user_id] ?? null);
      set.add(display);
    }
    setAllUsers(Array.from(set).sort());
  }, [rows, mapping]);

  // Build calendar events (grouped buckets)
  const events = useMemo(() => {
    const buckets = new Map<string, Bucket>(); // key = user|module|YYYY-MM-DD

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
          aggregated: {},
          response_times: [],
        });
      }
      const b = buckets.get(key)!;
      if (!b.mapped_label && mappedLabel) b.mapped_label = mappedLabel;

      // Aggregate Q&A: keep arrays of answers and responseTimes per question
      for (const a of r.answers) {
        const q = a.question_text ?? a.question_id;
        if (!b.aggregated[q]) b.aggregated[q] = { answers: [], responseTimes: [] };
        b.aggregated[q].answers.push(a.answer);
        b.aggregated[q].responseTimes.push(String(r.response_time));
      }
      b.response_times.push(String(r.response_time));
    }

    return Array.from(buckets.values()).map((b) => {
      const displayId = b.mapped_label ?? b.user_id;
      const colorKey = colorKeyFor(b.user_id, b.mapped_label ?? null);

      // derive latest time string for the chip
      const latestMs = b.response_times.length
        ? b.response_times.map((t) => +new Date(t)).reduce((a, c) => Math.max(a, c), 0)
        : null;
      const latestTimeStr = latestMs
        ? new Date(latestMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";

      const submissionCount = b.response_times.length;

      return {
        title: `${b.module_name} • ${displayId}`,
        start: b.date,          // date-only ISO
        allDay: true,           // <-- all-day event, no "12p"
        color: colorFor(colorKey),
        textColor: "#fff",
        extendedProps: b,       // keep bucket for the modal
        submissionCount,
        latestTimeStr,
      };
    });
  }, [rows, mapping]);

  // Click opens EventDetail
  const handleEventClick = (arg: EventClickArg) => {
    const b = arg.event.extendedProps as Bucket;
    setDetailData(bucketToExtended(b));
    setDetailOpen(true);
  };

  // Helpers for notes
  const addNote = (userKey: string, date: string, noteText: string) => {
    const updated = { ...notes };
    if (!updated[date]) updated[date] = {};
    updated[date][userKey] = noteText;
    saveNotes(updated);
  };
  const deleteNote = (userKey: string, date: string) => {
    const updated = { ...notes };
    if (updated[date]) {
      delete updated[date][userKey];
      if (Object.keys(updated[date]).length === 0) delete updated[date];
      saveNotes(updated);
    }
  };

  return (
    <div className={styles.wrapper}>
      <FullCalendar
        key={JSON.stringify(notes)} // re-render day cells when notes change
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        height="80vh"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={events}
        eventClick={handleEventClick}
        dayMaxEventRows={3}
        eventContent={(arg) => {
          const count =
            (arg.event as any).submissionCount ??
            (arg.event.extendedProps as any)?.response_times?.length ??
            1;
          const latest = (arg.event as any).latestTimeStr || "";
          return {
            html: `
              <div class="${styles.fcChip}">
                <div class="${styles.fcTitle}">${arg.event.title}</div>
                <div class="${styles.fcMeta}">
                  ${count} ${count === 1 ? "submission" : "submissions"}${
              latest ? ` · latest ${latest}` : ""
            }
                </div>
              </div>
            `,
          };
        }}
        dayCellContent={(arg) => {
          const dateStr = arg.date.toISOString().split("T")[0];
          const dayNotes = notes[dateStr] || {};
          const noteEntries = Object.entries(dayNotes);

          return (
            <div className={styles.dayCellContent}>
              <div className={styles.dayNumber}>{arg.dayNumberText}</div>

              <button
                className={styles.addNoteButton}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDate(dateStr);
                  setNoteModalOpen(true);
                }}
              >
                + Note
              </button>

              {noteEntries.length > 0 && (
                <div className={styles.note}>
                  {noteEntries.map(([userKey, noteText]) => (
                    <div
                      key={userKey}
                      className={styles.noteEntry}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedViewerNote({ user: userKey, note: noteText });
                        setSelectedDate(dateStr);
                        setViewerModalOpen(true);
                      }}
                      title={noteText}
                    >
                      <span>Note for {userKey}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      />

      {/* legend chip when mapping is active */}
      {mapping && (
        <div className="mt-2 text-xs text-gray-600">
          Coloring &amp; titles use <span className="font-medium">{mappingName}</span> when available; otherwise <code>user_id</code>.
        </div>
      )}

      {/* Event details modal */}
      <EventDetail
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        eventData={detailData}
      />

      {/* Add note modal */}
      <NoteModal
        isOpen={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        onSave={(user: string, note: string) => {
          if (selectedDate) {
            addNote(user, selectedDate, note);
            setNoteModalOpen(false);
          }
        }}
        users={allUsers}
        selectedDate={selectedDate}
      />

      {/* View/delete note modal */}
      <NoteViewerModal
        isOpen={viewerModalOpen}
        onClose={() => setViewerModalOpen(false)}
        user={selectedViewerNote?.user || ""}
        note={selectedViewerNote?.note || ""}
        date={selectedDate || ""}
        onDelete={() => {
          if (selectedDate && selectedViewerNote?.user) {
            deleteNote(selectedViewerNote.user, selectedDate);
            setViewerModalOpen(false);
          }
        }}
      />
    </div>
  );
}