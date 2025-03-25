"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { Calendar, dateFnsLocalizer, type Event } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import styles from "./CalendarView.module.css";
import { StudyData } from "../TableView/TableView";

const locales = {
  "en-US": enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

interface CalendarViewProps {
  data: StudyData;
}

const CalendarView: React.FC<CalendarViewProps> = ({ data }) => {
  const events: Event[] = useMemo(() => {
    const eventList: Event[] = [];

    Object.entries(data.grouped_responses).forEach(([userId, modules]) => {
      Object.entries(modules).forEach(([_, moduleData]) => {
        if ("raw_responses" in moduleData) {
          moduleData.raw_responses.forEach((resp: any) => {
            if (resp.response_time) {
              eventList.push({
                title: `${moduleData.module_name} (raw)`,
                start: new Date(resp.response_time),
                end: new Date(resp.response_time),
                allDay: false,
              });
            }
          });
        } else {
          Object.values(moduleData.sections).forEach((section: any) => {
            if (section.response_time) {
              const questions = Object.entries(section.qa)
                .map(([q, a]) => `${q}: ${a}`)
                .join(" | ");
              eventList.push({
                title: `${moduleData.module_name} - ${section.section_name} | ${questions}`,
                start: new Date(section.response_time),
                end: new Date(section.response_time),
                allDay: false,
              });
            }
          });
        }
      });
    });

    return eventList;
  }, [data]);

  return (
    <div className={styles.wrapper} suppressHydrationWarning>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        defaultView="month"
        views={["month", "week", "day", "agenda"]}
        style={{ height: "80vh", marginTop: "1rem" }}
        tooltipAccessor="title"
      />
    </div>
  );
};

export default CalendarView;