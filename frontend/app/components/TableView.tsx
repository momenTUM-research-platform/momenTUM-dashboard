"use client";

import React from "react";

// Type definitions for structured study responses.
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
    [moduleId: string]: GroupedByModule | {
      module_name: string;
      raw_responses: any[];
    };
  };
}

export interface StudyData {
  study_id: string;
  grouped_responses: GroupedResponses;
}

interface TableViewProps {
  data: StudyData;
}

/**
 * TableView renders structured study responses in a table format.
 * The table layout is fixed to fit within the outer container,
 * reducing unnecessary whitespace and minimizing horizontal scrolling.
 */
const TableView: React.FC<TableViewProps> = ({ data }) => {
  // Define a fixed cell style. Adjust padding and set wordWrap for proper text wrapping.
  const cellStyle: React.CSSProperties = {
    border: "1px solid #ccc",
    padding: "0.3rem 0.5rem",
    whiteSpace: "normal",
    wordWrap: "break-word",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  // Container style for each user block.
  const userContainerStyle: React.CSSProperties = {
    marginBottom: "2rem",
    backgroundColor: "#f9f9f9",
    padding: "0.75rem",
    borderRadius: "4px",
  };

  // Table style using fixed layout so columns have equal widths.
  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  };

  // Render blocks for each user.
  const userBlocks = Object.entries(data.grouped_responses).map(([userId, modules], userIndex) => {
    const rows: JSX.Element[] = [];
    const unknownRows: JSX.Element[] = [];

    Object.entries(modules).forEach(([moduleId, moduleData]) => {
      if ("raw_responses" in moduleData) {
        const fallback = moduleData as { module_name: string; raw_responses: any[] };
        fallback.raw_responses.forEach((resp, idx) => {
          unknownRows.push(
            <tr key={`${moduleId}-fallback-${idx}`}>
              <td style={{ ...cellStyle, textAlign: "left" }} colSpan={5}>
                <strong>{fallback.module_name}</strong> – Full Response:
                <pre style={{ margin: "0", fontSize: "0.75rem" }}>
                  {JSON.stringify(resp, null, 2)}
                </pre>
              </td>
            </tr>
          );
        });
      } else {
        const modData = moduleData as GroupedByModule;
        Object.entries(modData.sections).forEach(([secKey, section]) => {
          Object.entries(section.qa).forEach(([question, answer], idx) => {
            rows.push(
              <tr key={`${moduleId}-${secKey}-${idx}`}>
                <td style={cellStyle}>{modData.module_name}</td>
                <td style={cellStyle}>{section.section_name}</td>
                <td style={cellStyle}>{question}</td>
                <td style={cellStyle}>{answer}</td>
                <td style={cellStyle}>{section.response_time || "Unknown"}</td>
              </tr>
            );
          });
        });
      }
    });

    return (
      <div key={userId} style={userContainerStyle}>
        <h3>User: {userId}</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>Module</th>
              <th style={cellStyle}>Section</th>
              <th style={cellStyle}>Question</th>
              <th style={cellStyle}>Answer</th>
              <th style={cellStyle}>Response Time</th>
            </tr>
          </thead>
          <tbody>
            {rows}
            {unknownRows}
          </tbody>
        </table>
      </div>
    );
  });

  return (
    <div className="table-container" style={{ marginTop: "2rem", padding: "0 1rem" }}>
      <h2>Table View</h2>
      {userBlocks.length === 0 ? <p>No structured responses available.</p> : userBlocks}
    </div>
  );
};

export default TableView;