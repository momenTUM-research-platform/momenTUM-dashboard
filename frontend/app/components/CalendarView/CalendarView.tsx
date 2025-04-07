"use client";

import React, { useMemo, useState } from "react";
import FullCalendar, { EventClickArg } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import EventDetail, { ExtendedEventProps } from "../EventDetail/EventDetail";
import styles from "./CalendarView.module.css";

// --- Types ---
export interface GroupedBySection {
  section_name: string;
  // Each question maps to an array of responses,
  // where each response object has an answer and a response_time.
  qa: Record<string, { answer: any; response_time: string }[]>;
}

export interface GroupedByModule {
  module_name: string;
  sections: {
    [sectionIndex: string]: GroupedBySection;
  };
}

export interface GroupedResponses {
  [userId: string]: {
    [moduleId: string]:
      | GroupedByModule
      | { module_name: string; raw_responses: any[] }
      | any; // may include extra primitive like extracted_study_id
  } & { extracted_study_id?: string };
}

export interface StudyData {
  study_id: string;
  grouped_responses: GroupedResponses;
}

// Utility: Generate a hash code for a string (used for color selection)
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

// Returns a color from the palette based on the participant ID.
function getColorForParticipant(participantId: string): string {
  const index = Math.abs(hashCode(participantId)) % colorPalette.length;
  return colorPalette[index];
}

// Helper to extract participant’s study ID from the modules.
// If an "extracted_study_id" property exists, use it; otherwise, fall back to the userId.
function getExtractedStudyId(
  userId: string,
  modules: GroupedResponses[string]
): string {
  if (modules && typeof modules === "object" && "extracted_study_id" in modules) {
    const id = modules["extracted_study_id"];
    return typeof id === "string" ? id : String(id);
  }
  return userId;
}

interface CalendarViewProps {
  data: StudyData;
}

const CalendarView: React.FC<CalendarViewProps> = ({ data }) => {
  const [selectedEvent, setSelectedEvent] = useState<ExtendedEventProps | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);

  const events = useMemo(() => {
    const eventList: any[] = [];

    Object.entries(data.grouped_responses).forEach(([userId, modules]) => {
      const participantId = getExtractedStudyId(userId, modules);
      const color = getColorForParticipant(participantId);

      Object.entries(modules).forEach(([moduleId, moduleData]) => {
        // Skip non-object values (e.g. the extracted_study_id field)
        if (moduleId === "extracted_study_id" || typeof moduleData !== "object" || moduleData === null)
          return;

        // CASE 1: Raw responses – each response becomes its own event.
        if ("raw_responses" in moduleData) {
          const fallback = moduleData as { module_name: string; raw_responses: any[] };
          fallback.raw_responses.forEach((resp) => {
            if (resp.response_time) {
              eventList.push({
                title: `${fallback.module_name} (raw)`,
                start: new Date(resp.response_time).toISOString(),
                end: new Date(resp.response_time).toISOString(),
                color,
                textColor: "#fff",
                extendedProps: {
                  extractedStudyId: participantId,
                  moduleName: fallback.module_name,
                  details: resp,
                  responseTime: resp.response_time,
                  type: "raw",
                } as ExtendedEventProps,
              });
            }
          });
        } else {
          // CASE 2: Structured module with sections containing QA arrays.
          // Instead of aggregating everything into one event,
          // group answers by calendar day.
          const modData = moduleData as GroupedByModule;
          const dayGroups: {
            [day: string]: {
              aggregatedQA: Record<string, { answers: any[]; responseTimes: string[] }>;
              representativeTime: Date;
            };
          } = {};
          if (modData.sections) {
            Object.values(modData.sections).forEach((section) => {
              Object.entries(section.qa).forEach(([question, responses]) => {
                if (!Array.isArray(responses)) return;
                responses.forEach((entry) => {
                  const dt = new Date(entry.response_time);
                  const dayStr = dt.toISOString().split("T")[0]; // e.g. "2025-04-07"
                  if (!dayGroups[dayStr]) {
                    dayGroups[dayStr] = {
                      aggregatedQA: {},
                      representativeTime: dt,
                    };
                  }
                  if (dt < dayGroups[dayStr].representativeTime) {
                    dayGroups[dayStr].representativeTime = dt;
                  }
                  if (!(question in dayGroups[dayStr].aggregatedQA)) {
                    dayGroups[dayStr].aggregatedQA[question] = { answers: [], responseTimes: [] };
                  }
                  dayGroups[dayStr].aggregatedQA[question].answers.push(entry.answer);
                  dayGroups[dayStr].aggregatedQA[question].responseTimes.push(entry.response_time);
                });
              });
            });
          }
          // Create one event per day for this module.
          Object.entries(dayGroups).forEach(([dayStr, groupData]) => {
            const repTimeISO = groupData.representativeTime.toISOString();
            eventList.push({
              title: `${modData.module_name} - ${dayStr}`,
              start: repTimeISO,
              end: repTimeISO,
              color,
              textColor: "#fff",
              extendedProps: {
                extractedStudyId: participantId,
                moduleName: modData.module_name,
                // For grouped events, we aggregate all QA data for that day
                details: groupData.aggregatedQA,
                responseTime: repTimeISO,
                type: "structured",
              } as ExtendedEventProps,
            });
          });
        }
      });
    });

    return eventList;
  }, [data]);

  const handleEventClick = (clickInfo: EventClickArg) => {
    setSelectedEvent(clickInfo.event.extendedProps as ExtendedEventProps);
    setModalOpen(true);
  };

  return (
    <div className={styles.wrapper}>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={events}
        height="80vh"
        eventClick={handleEventClick}
      />
      <EventDetail
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        eventData={selectedEvent || null}
      />
    </div>
  );
};

export default CalendarView;