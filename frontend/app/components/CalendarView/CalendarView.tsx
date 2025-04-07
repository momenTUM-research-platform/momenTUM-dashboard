"use client";

import React, { useMemo, useState, useEffect } from "react";
import FullCalendar, { EventClickArg } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import EventDetail, { ExtendedEventProps } from "../EventDetail/EventDetail";
import NoteModal from "../NoteModal/NoteModal";
import NoteViewerModal from "../NoteModal/NoteViewerModal";
import styles from "./CalendarView.module.css";

export interface GroupedBySection {
  section_name: string;
  qa: Record<string, { answer: any; response_time: string }[]>;
}

export interface GroupedByModule {
  module_name: string;
  sections: Record<string, GroupedBySection>;
}

export interface GroupedResponses {
  [userId: string]: Record<
    string,
    GroupedByModule | { module_name: string; raw_responses: any[] } | any
  > & {
    extracted_study_id?: string;
  };
}

export interface StudyData {
  study_id: string;
  grouped_responses: GroupedResponses;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

const colorPalette = [
  "#2f80ed",
  "#e53e3e",
  "#38a169",
  "#d69e2e",
  "#805ad5",
  "#dd6b20",
];

function getColorForParticipant(participantId: string): string {
  const index = Math.abs(hashCode(participantId)) % colorPalette.length;
  return colorPalette[index];
}

/**
 * Always return a user key in the format "study_id (user_id)".
 */
function getUserKey(userId: string, modules: GroupedResponses[string]): string {
  return typeof modules.extracted_study_id === "string"
    ? `${modules.extracted_study_id} (${userId})`
    : userId;
}

const CalendarView: React.FC<{ data: StudyData }> = ({ data }) => {
  const [selectedEvent, setSelectedEvent] =
    useState<ExtendedEventProps | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedViewerNote, setSelectedViewerNote] = useState<{
    user: string;
    note: string;
  } | null>(null);
  const [notes, setNotes] = useState<Record<string, { [user: string]: string }>>({});
  const [allUsers, setAllUsers] = useState<string[]>([]);

  // Load stored notes and transform keys if needed.
  useEffect(() => {
    const stored = localStorage.getItem("calendarNotes");
    if (stored) {
      let parsed = JSON.parse(stored);
      let updated = false;
      for (const date in parsed) {
        const dayNotes = parsed[date];
        for (const key in dayNotes) {
          // If key is not in the "study_id (user_id)" format, update it.
          if (!key.includes("(")) {
            if (data.grouped_responses[key]) {
              const newKey = getUserKey(key, data.grouped_responses[key]);
              dayNotes[newKey] = dayNotes[key];
              delete dayNotes[key];
              updated = true;
            }
          }
        }
      }
      if (updated) {
        localStorage.setItem("calendarNotes", JSON.stringify(parsed));
      }
      setNotes(parsed);
    }
  }, [data]);

  // Build list of users in proper format for the NoteModal.
  useEffect(() => {
    const users = Object.entries(data.grouped_responses).map(([uid, modules]) =>
      getUserKey(uid, modules)
    );
    setAllUsers(users);
  }, [data]);

  const saveNote = (user: string, date: string, noteText: string) => {
    const updated = { ...notes };
    if (!updated[date]) updated[date] = {};
    updated[date][user] = noteText;
    setNotes(updated);
    localStorage.setItem("calendarNotes", JSON.stringify(updated));
  };

  const deleteNote = (user: string, date: string) => {
    const updated = { ...notes };
    if (updated[date]) {
      delete updated[date][user];
      if (Object.keys(updated[date]).length === 0) {
        delete updated[date];
      }
      setNotes(updated);
      localStorage.setItem("calendarNotes", JSON.stringify(updated));
    }
  };

  // Generate events as before.
  const events = useMemo(() => {
    const eventList: any[] = [];
    Object.entries(data.grouped_responses).forEach(([userId, modules]) => {
      const participantId = getUserKey(userId, modules);
      const color = getColorForParticipant(participantId);
      Object.entries(modules).forEach(([moduleId, moduleData]) => {
        if (moduleId === "extracted_study_id" || typeof moduleData !== "object")
          return;
        if ("raw_responses" in moduleData) {
          const fallback = moduleData as {
            module_name: string;
            raw_responses: any[];
          };
          fallback.raw_responses.forEach((resp) => {
            if (resp.response_time) {
              eventList.push({
                title: `${fallback.module_name} (raw)`,
                start: new Date(resp.response_time).toISOString(),
                color,
                textColor: "#fff",
                extendedProps: {
                  extractedStudyId: participantId,
                  moduleName: fallback.module_name,
                  details: resp,
                  responseTime: resp.response_time,
                  type: "raw",
                },
              });
            }
          });
        } else {
          const modData = moduleData as GroupedByModule;
          const dayGroups: Record<string, any> = {};
          Object.values(modData.sections).forEach((section) => {
            Object.entries(section.qa).forEach(([question, responses]) => {
              responses.forEach((entry) => {
                const dt = new Date(entry.response_time);
                const dayStr = dt.toISOString().split("T")[0];
                if (!dayGroups[dayStr]) {
                  dayGroups[dayStr] = {
                    aggregatedQA: {},
                    representativeTime: dt,
                  };
                }
                if (!(question in dayGroups[dayStr].aggregatedQA)) {
                  dayGroups[dayStr].aggregatedQA[question] = {
                    answers: [],
                    responseTimes: [],
                  };
                }
                dayGroups[dayStr].aggregatedQA[question].answers.push(entry.answer);
                dayGroups[dayStr].aggregatedQA[question].responseTimes.push(entry.response_time);
              });
            });
          });
          Object.entries(dayGroups).forEach(([dayStr, groupData]) => {
            const repTimeISO = groupData.representativeTime.toISOString();
            eventList.push({
              title: `${modData.module_name} - ${dayStr}`,
              start: repTimeISO,
              color,
              textColor: "#fff",
              extendedProps: {
                extractedStudyId: participantId,
                moduleName: modData.module_name,
                details: groupData.aggregatedQA,
                responseTime: repTimeISO,
                type: "structured",
              },
            });
          });
        }
      });
    });
    return eventList;
  }, [data]);

  return (
    <div className={styles.wrapper}>
      <FullCalendar
        key={JSON.stringify(notes)} // re-render when notes update
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={events}
        height="80vh"
        eventClick={(e: EventClickArg) => {
          setSelectedEvent(e.event.extendedProps as ExtendedEventProps);
          setModalOpen(true);
        }}
        dayCellContent={(arg) => {
          const dateStr = arg.date.toISOString().split("T")[0];
          const dayNotes = notes[dateStr] || {};
          const noteEntries = Object.entries(dayNotes);
          return (
            <div className={styles.dayCellContent}>
              <div className={styles.dayNumber}>{arg.dayNumberText}</div>
              {/* + Note button is now handled via CSS hover */}
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
              {/* Display saved notes */}
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
                    >
                      <span>Additional note for {userKey}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      />

      <EventDetail
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        eventData={selectedEvent || null}
      />

      <NoteModal
        isOpen={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        onSave={(user: string, note: string) => {
          if (selectedDate) {
            saveNote(user, selectedDate, note);
            setNoteModalOpen(false);
          }
        }}
        users={allUsers}
        selectedDate={selectedDate}
      />

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
};

export default CalendarView;