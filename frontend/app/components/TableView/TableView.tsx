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
      | { module_name: string; raw_responses: any[] }
      | any;
  };
}

export interface StudyData {
  study_id: string;
  grouped_responses: GroupedResponses;
}

const getStudyIdForUser = (modules: GroupedResponses[string]): string => {
  if ("extracted_study_id" in modules && typeof modules["extracted_study_id"] === "string") {
    return modules["extracted_study_id"];
  }
  let studyId = "";
  Object.entries(modules).forEach(([moduleId, moduleData]) => {
    if (typeof moduleData !== "object" || moduleData === null) return;
    if (moduleId === "extracted_study_id") return;
    const modData = moduleData as GroupedByModule;
    if (modData.module_name.trim() === "Study ID") {
      const section = modData.sections["0"];
      if (section && section.qa) {
        const keys = Object.keys(section.qa);
        if (keys.length > 0) {
          const answerArray = section.qa[keys[0]];
          if (Array.isArray(answerArray) && answerArray.length > 0) {
            studyId = String(answerArray[0].answer).trim();
          }
        }
      }
    }
  });
  return studyId || "Unknown";
};

const isAnswerEmpty = (ans: any) => {
  return ans === null || ans === undefined || ans === "" || (Array.isArray(ans) && ans.length === 0);
};

const TableView: React.FC<{ data: StudyData }> = ({ data }) => {
  const [groupByStudyId, setGroupByStudyId] = useState(false);

  const renderRows = (modules: GroupedResponses[string], prefix = ""): JSX.Element[] => {
    const rows: JSX.Element[] = [];

    Object.entries(modules).forEach(([moduleId, moduleData]) => {
      if (typeof moduleData !== "object" || moduleData === null || moduleId === "extracted_study_id") return;

      if ("raw_responses" in moduleData) {
        const fallback = moduleData as { module_name: string; raw_responses: any[] };
        fallback.raw_responses.forEach((resp, idx) => {
          const answer = resp.answer !== undefined ? String(resp.answer) : "";
          const respTime = resp.response_time || "";
          rows.push(
            <tr key={`${prefix}${moduleId}-fallback-${idx}-${respTime}`}>
              <td className={styles.cell}>{fallback.module_name}</td>
              <td className={styles.cell}>-</td>
              <td className={styles.cell}>Full Response</td>
              <td className={`${styles.cell} ${isAnswerEmpty(answer) ? styles.answerEmpty : styles.answerFilled}`}>{answer}</td>
              <td className={styles.cell}>{respTime}</td>
            </tr>
          );
        });
      } else {
        const modData = moduleData as GroupedByModule;
        Object.entries(modData.sections).forEach(([secKey, section]) => {
          Object.entries(section.qa).forEach(([question, answers]) => {
            const responses = Array.isArray(answers) ? answers : [{ answer: answers }];

            responses.forEach((response, idx) => {
              const ansText = response.answer !== undefined ? String(response.answer) : "";
              const respTime = response.response_time || section.response_time || "";
              const showMeta = idx === 0;
              const key = `${prefix}${moduleId}-${secKey}-${question}-${idx}`;

              rows.push(
                <tr key={key}>
                  <td className={styles.cell}>{showMeta ? modData.module_name : ""}</td>
                  <td className={styles.cell}>{showMeta ? section.section_name : ""}</td>
                  <td className={styles.cell}>{showMeta ? question : ""}</td>
                  <td className={`${styles.cell} ${isAnswerEmpty(ansText) ? styles.answerEmpty : styles.answerFilled}`}>{ansText}</td>
                  <td className={styles.cell}>{respTime}</td>
                </tr>
              );
            });
          });
        });
      }
    });

    return rows;
  };

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

  const renderByStudyId = () => {
    const groups: { [studyId: string]: { userId: string; modules: GroupedResponses[string] }[] } = {};
    Object.entries(data.grouped_responses).forEach(([userId, modules]) => {
      const studyId = getStudyIdForUser(modules);
      if (!groups[studyId]) groups[studyId] = [];
      groups[studyId].push({ userId, modules });
    });

    return Object.entries(groups).map(([studyId, group]) => (
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
          <tbody>
            {group.flatMap(({ userId, modules }) => [
              <tr key={`${userId}-header`}>
                <td className={styles.cell} colSpan={5}>
                  <em>Responses from user: {userId}</em>
                </td>
              </tr>,
              ...renderRows(modules, `${userId}-`),
            ])}
          </tbody>
        </table>
      </div>
    ));
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
