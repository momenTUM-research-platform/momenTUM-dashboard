// components/TimelineView.tsx
"use client";

import React from "react";
import { StudyData } from "./TableView/TableView";

interface TimelineItem {
  userId: string;
  module: string;
  section: string;
  qa: Record<string, any>;
  response_time: string;
}

interface TimelineViewProps {
  data: StudyData;
}

/**
 * TimelineView renders study responses as a vertical timeline.
 * For each user, timeline items are sorted by response time.
 * Known modules are rendered with detailed information; fallback items display full JSON.
 */
const TimelineView: React.FC<TimelineViewProps> = ({ data }) => {
  const timelineByUser: { [userId: string]: TimelineItem[] } = {};

  Object.entries(data.grouped_responses).forEach(([userId, modules]) => {
    timelineByUser[userId] = [];
    Object.entries(modules).forEach(([moduleId, moduleData]) => {
      if ("raw_responses" in moduleData) {
        const fallback = moduleData as { module_name: string; raw_responses: any[] };
        fallback.raw_responses.forEach((resp) => {
          timelineByUser[userId].push({
            userId,
            module: fallback.module_name + " (Unknown)",
            section: "Full Response",
            qa: { "Full JSON": JSON.stringify(resp, null, 2) },
            response_time: resp.response_time || "Unknown",
          });
        });
      } else {
        const modData = moduleData as { module_name: string; sections: { [sectionIndex: string]: { section_name: string; qa: Record<string, any>; response_time: string } } };
        Object.entries(modData.sections).forEach(([_, section]) => {
          timelineByUser[userId].push({
            userId,
            module: modData.module_name,
            section: section.section_name,
            qa: section.qa,
            response_time: section.response_time || "Unknown",
          });
        });
      }
    });
    timelineByUser[userId].sort((a, b) => {
      const tA = new Date(a.response_time).getTime() || 0;
      const tB = new Date(b.response_time).getTime() || 0;
      return tA - tB;
    });
  });

  const timelineItemStyle: React.CSSProperties = {
    position: "relative",
    paddingLeft: "20px",
    marginBottom: "20px",
  };

  const dotStyle: React.CSSProperties = {
    position: "absolute",
    left: "-10px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: "#2F80ED",
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#fff",
    padding: "10px",
    borderRadius: "4px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  };

  const headerStyle: React.CSSProperties = {
    fontWeight: "bold",
    marginBottom: "5px",
  };

  return (
    <div>
      <h2>Timeline View</h2>
      {Object.keys(timelineByUser).length === 0 ? (
        <p>No timeline responses available.</p>
      ) : (
        Object.entries(timelineByUser).map(([userId, items]) => (
          <div key={userId} style={{ marginBottom: "2rem", backgroundColor: "#f9f9f9", padding: "1rem", borderRadius: "4px" }}>
            <h3>User: {userId}</h3>
            <div style={{ marginLeft: "1rem" }}>
              {items.map((item, idx) => (
                <div key={idx} style={timelineItemStyle}>
                  <div style={dotStyle}></div>
                  <div style={cardStyle}>
                    <div style={headerStyle}>
                      {item.response_time !== "Unknown"
                        ? new Date(item.response_time).toLocaleString()
                        : "Unknown Time"}{" "}
                      - {item.module} / {item.section}
                    </div>
                    <ul style={{ paddingLeft: "20px", margin: 0 }}>
                      {Object.entries(item.qa).map(([question, answer], qIdx) => (
                        <li key={qIdx}>
                          <strong>{question}:</strong> {answer}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default TimelineView;