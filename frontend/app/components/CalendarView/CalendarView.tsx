"use client";

import React, { useMemo, useState } from "react";
import FullCalendar, { EventClickArg } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import EventDetail, { ExtendedEventProps } from "../EventDetail/EventDetail";
import styles from "./CalendarView.module.css";

// --- Types (from TableView) ---
export interface GroupedBySection {
  section_name: string;
  qa: Record<string, any>;
  response_time: string;
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
      | any; // may include a primitive like extracted_study_id
  } & { extracted_study_id?: string };
}

export interface StudyData {
  study_id: string;
  grouped_responses: GroupedResponses;
}

// Extended event properties
// (Matches what's used in EventDetail)
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

// Return a color from the palette based on the participant id
function getColorForParticipant(participantId: string): string {
  const index = Math.abs(hashCode(participantId)) % colorPalette.length;
  return colorPalette[index];
}

// Helper to extract participant’s study ID
// or fall back to userId if `extracted_study_id` is missing
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
  const [selectedEvent, setSelectedEvent] = useState<ExtendedEventProps | null>(
    null
  );
  const [isModalOpen, setModalOpen] = useState(false);

  const events = useMemo(() => {
    const eventList: any[] = [];

    Object.entries(data.grouped_responses).forEach(([userId, modules]) => {
      const participantId = getExtractedStudyId(userId, modules);
      // Choose a color for all events from this participant
      const color = getColorForParticipant(participantId);

      Object.entries(modules).forEach(([moduleId, moduleData]) => {
        // skip the "extracted_study_id" property itself
        if (moduleId === "extracted_study_id") return;
        if (typeof moduleData !== "object" || moduleData === null) return;

        // Case 1: raw_responses
        if ("raw_responses" in moduleData) {
          const fallback = moduleData as { module_name: string; raw_responses: any[] };
          fallback.raw_responses.forEach((resp) => {
            if (resp.response_time) {
              eventList.push({
                title: `${fallback.module_name} (raw)`,
                start: new Date(resp.response_time).toISOString(),
                end: new Date(resp.response_time).toISOString(),
                color, // sets background & border
                textColor: "#fff",
                extendedProps: {
                  extractedStudyId: participantId,
                  moduleName: fallback.module_name,
                  details: resp,
                  type: "raw",
                },
              });
            }
          });
        } 
        // Case 2: structured module with sections
        else {
          const modData = moduleData as GroupedByModule;
          if (modData.sections) {
            Object.entries(modData.sections).forEach(([sectionKey, section]) => {
              if (section.response_time) {
                eventList.push({
                  title: `${modData.module_name} - ${section.section_name}`,
                  start: new Date(section.response_time).toISOString(),
                  end: new Date(section.response_time).toISOString(),
                  color,
                  textColor: "#fff",
                  extendedProps: {
                    extractedStudyId: participantId,
                    moduleName: modData.module_name,
                    sectionName: section.section_name,
                    responseTime: section.response_time,
                    details: section.qa,
                    type: "structured",
                  },
                });
              }
            });
          }
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