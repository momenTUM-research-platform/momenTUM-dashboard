"use client";

import React, { useState } from "react";
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

// Helper function to extract Study ID from a user’s modules.
// We assume that the module with module_name "Study ID" holds the participant’s entered ID.
const getStudyIdForUser = (modules: GroupedResponses[string]) => {
  let studyId = "";
  Object.entries(modules).forEach(([moduleId, moduleData]) => {
    if (!("raw_responses" in moduleData)) {
      const modData = moduleData as GroupedByModule;
      if (modData.module_name.trim() === "Study ID") {
        const section = modData.sections["0"];
        if (section && section.qa) {
          const answers = Object.values(section.qa);
          if (answers.length > 0) {
            studyId = String(answers[0]).trim();
          }
        }
      }
    }
  });
  return studyId || "Unknown";
};

// Modified renderRows now accepts an optional prefix to ensure keys are unique across users.
const renderRows = (modules: GroupedResponses[string], prefix: string = "") => {
  const rows: JSX.Element[] = [];
  const unknownRows: JSX.Element[] = [];

  Object.entries(modules).forEach(([moduleId, moduleData]) => {
    if ("raw_responses" in moduleData) {
      const fallback = moduleData as { module_name: string; raw_responses: any[] };
      fallback.raw_responses.forEach((resp, idx) => {
        unknownRows.push(
          <tr key={`${prefix}${moduleId}-fallback-${idx}`}>
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
          const isEmpty =
            answer === "" ||
            answer === null ||
            (Array.isArray(answer) && answer.length === 0);
          rows.push(
            <tr key={`${prefix}${moduleId}-${secKey}-${idx}`}>
              <td className={styles.cell}>{modData.module_name}</td>
              <td className={styles.cell}>{section.section_name}</td>
              <td className={styles.cell}>{question}</td>
              <td className={`${styles.cell} ${isEmpty ? styles.answerEmpty : styles.answerFilled}`}>
                {Array.isArray(answer) ? answer.join(", ") : answer}
              </td>
              <td className={styles.cell}>{section.response_time || "Unknown"}</td>
            </tr>
          );
        });
      });
    }
  });
  return [...rows, ...unknownRows];
};

interface TableViewProps {
  data: StudyData;
}

const TableView: React.FC<TableViewProps> = ({ data }) => {
  // State to switch grouping: false = group by App ID, true = group by Study ID.
  const [groupByStudyId, setGroupByStudyId] = useState(false);

  // Render grouped by App ID (original behavior)
  const renderByAppId = () => {
    return Object.entries(data.grouped_responses).map(([userId, modules]) => (
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
          <tbody>{renderRows(modules)}</tbody>
        </table>
      </div>
    ));
  };

  // Render grouped by Study ID: group responses from all app IDs sharing the same Study ID.
  const renderByStudyId = () => {
    const groups: { [studyId: string]: { userId: string; modules: GroupedResponses[string] }[] } = {};
    Object.entries(data.grouped_responses).forEach(([userId, modules]) => {
      const studyId = getStudyIdForUser(modules);
      if (!groups[studyId]) {
        groups[studyId] = [];
      }
      groups[studyId].push({ userId, modules });
    });

    return Object.entries(groups).map(([studyId, group]) => {
      const combinedRows: JSX.Element[] = [];
      group.forEach(({ userId, modules }) => {
        combinedRows.push(
          <tr key={`${userId}-header`}>
            <td className={styles.cell} colSpan={5}>
              <em>Responses from user: {userId}</em>
            </td>
          </tr>
        );
        // Pass a prefix based on the user ID to ensure unique keys.
        combinedRows.push(...renderRows(modules, `${userId}-`));
      });
      return (
        <div key={studyId} className={styles.userBlock}>
          <h3>Study ID: {studyId}</h3>
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
            <tbody>{combinedRows}</tbody>
          </table>
        </div>
      );
    });
  };

  return (
    <div className={styles.wrapper}>
      <h2>Table View</h2>
      <div className={styles.groupToggle}>
        <button
          className={`${styles.groupToggleButton} ${!groupByStudyId ? styles.active : ""}`}
          onClick={() => setGroupByStudyId(false)}
        >
          Group by App ID
        </button>
        <button
          className={`${styles.groupToggleButton} ${groupByStudyId ? styles.active : ""}`}
          onClick={() => setGroupByStudyId(true)}
        >
          Group by Study ID
        </button>
      </div>
      {Object.keys(data.grouped_responses).length === 0 ? (
        <p>No structured responses available.</p>
      ) : groupByStudyId ? (
        renderByStudyId()
      ) : (
        renderByAppId()
      )}
    </div>
  );
};

export default TableView;