"use client";

import React, { useMemo, useState } from "react";
import FullCalendar, { EventClickArg } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import styles from "./CalendarView.module.css";

// --- Types from your TableView ---
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
      | {
          module_name: string;
          raw_responses: any[];
        };
  };
}

export interface StudyData {
  study_id: string;
  grouped_responses: GroupedResponses;
}

// --- Extended event props to store extra data ---
interface ExtendedEventProps {
  userId: string;
  moduleId: string;
  sectionKey?: string;
  details: any;
  responseTime?: string;
  type: "raw" | "structured";
}

interface CalendarViewProps {
  data: StudyData;
}

// --- Modal component to show event details ---
const EventDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  eventData: ExtendedEventProps | null;
}> = ({ isOpen, onClose, eventData }) => {
  if (!isOpen || !eventData) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <button onClick={onClose} className={styles.closeButton}>
          Close
        </button>
        <h3>Event Details</h3>
        <p>
          <strong>User ID:</strong> {eventData.userId}
        </p>
        <p>
          <strong>Module ID:</strong> {eventData.moduleId}
        </p>
        {eventData.sectionKey && (
          <p>
            <strong>Section:</strong> {eventData.sectionKey}
          </p>
        )}
        {eventData.responseTime && (
          <p>
            <strong>Response Time:</strong> {eventData.responseTime}
          </p>
        )}
        <h4>Details:</h4>
        <pre className={styles.jsonBlock}>
          {JSON.stringify(eventData.details, null, 2)}
        </pre>
      </div>
    </div>
  );
};

const CalendarView: React.FC<CalendarViewProps> = ({ data }) => {
  const [selectedEvent, setSelectedEvent] =
    useState<ExtendedEventProps | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);

  // Map study data into FullCalendar event objects.
  const events = useMemo(() => {
    const eventList: any[] = [];
    Object.entries(data.grouped_responses).forEach(([userId, modules]) => {
      Object.entries(modules).forEach(([moduleId, moduleData]) => {
        if ("raw_responses" in moduleData) {
          // Process raw responses
          (moduleData.raw_responses as any[]).forEach((resp) => {
            if (resp.response_time) {
              eventList.push({
                title: `${moduleData.module_name} (raw)`,
                start: new Date(resp.response_time).toISOString(),
                end: new Date(resp.response_time).toISOString(),
                extendedProps: {
                  userId,
                  moduleId,
                  details: resp,
                  type: "raw",
                },
              });
            }
          });
        } else {
          // Process structured responses
          const modData = moduleData as GroupedByModule;
          Object.entries(modData.sections).forEach(([sectionKey, section]) => {
            if (section.response_time) {
              eventList.push({
                title: `${modData.module_name} - ${section.section_name}`,
                start: new Date(section.response_time).toISOString(),
                end: new Date(section.response_time).toISOString(),
                extendedProps: {
                  userId,
                  moduleId,
                  sectionKey,
                  details: section.qa,
                  responseTime: section.response_time,
                  type: "structured",
                },
              });
            }
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
      <EventDetailModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        eventData={selectedEvent}
      />
    </div>
  );
};

export default CalendarView;