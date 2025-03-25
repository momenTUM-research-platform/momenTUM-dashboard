"use client";

import React from "react";
import styles from "./TableView.module.css";

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

interface TableViewProps {
  data: StudyData;
}

const TableView: React.FC<TableViewProps> = ({ data }) => {
  const userBlocks = Object.entries(data.grouped_responses).map(([userId, modules]) => {
    const rows: JSX.Element[] = [];
    const unknownRows: JSX.Element[] = [];

    Object.entries(modules).forEach(([moduleId, moduleData]) => {
      if ("raw_responses" in moduleData) {
        const fallback = moduleData as { module_name: string; raw_responses: any[] };
        fallback.raw_responses.forEach((resp, idx) => {
          unknownRows.push(
            <tr key={`${moduleId}-fallback-${idx}`}>
              <td className={styles.cell} colSpan={5}>
                <strong>{fallback.module_name}</strong> – Full Response:
                <pre className={styles.jsonBlock}>{JSON.stringify(resp, null, 2)}</pre>
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
                <td className={styles.cell}>{modData.module_name}</td>
                <td className={styles.cell}>{section.section_name}</td>
                <td className={styles.cell}>{question}</td>
                <td className={styles.cell}>{answer}</td>
                <td className={styles.cell}>{section.response_time || "Unknown"}</td>
              </tr>
            );
          });
        });
      }
    });

    return (
      <div key={userId} className={styles.userBlock}>
        <h3>User: {userId}</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.cell}>Module</th>
              <th className={styles.cell}>Section</th>
              <th className={styles.cell}>Question</th>
              <th className={styles.cell}>Answer</th>
              <th className={styles.cell}>Response Time</th>
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
    <div className={styles.wrapper}>
      <h2>Table View</h2>
      {userBlocks.length === 0 ? <p>No structured responses available.</p> : userBlocks}
    </div>
  );
};

export default TableView;