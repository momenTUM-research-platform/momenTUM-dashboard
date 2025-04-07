"use client";

import React from "react";
import styles from "./EventDetail.module.css";

// Define the extended event properties to be used by the event detail modal.
export interface ExtendedEventProps {
  extractedStudyId: string;
  moduleName: string;
  sectionName?: string;
  responseTime?: string;
  details?: Record<string, any>;
  type: "raw" | "structured";
}

// Helper function to check if an answer is empty.
const isAnswerEmpty = (answer: any): boolean => {
  return (
    answer === "" ||
    answer === null ||
    (Array.isArray(answer) && answer.length === 0)
  );
};

// Helper to format a date string in a readable format.
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleString();
};

interface EventDetailProps {
  isOpen: boolean;
  onClose: () => void;
  eventData: ExtendedEventProps | null;
}

const EventDetail: React.FC<EventDetailProps> = ({ isOpen, onClose, eventData }) => {
  if (!isOpen || !eventData) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          &times;
        </button>
        <h3 className={styles.title}>Event Details</h3>
        <table className={styles.detailsTable}>
          <tbody>
            <tr>
              <th>Participant ID</th>
              <td>{eventData.extractedStudyId}</td>
            </tr>
            <tr>
              <th>Module</th>
              <td>{eventData.moduleName}</td>
            </tr>
            {eventData.sectionName && (
              <tr>
                <th>Section</th>
                <td>{eventData.sectionName}</td>
              </tr>
            )}
            {eventData.responseTime && (
              <tr>
                <th>Response Time</th>
                <td>{formatDate(eventData.responseTime)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <h4 className={styles.detailsHeader}>Questions &amp; Answers</h4>
        {eventData.details ? (
          <table className={styles.detailsTable}>
            <thead>
              <tr>
                <th>Question</th>
                <th>Answer(s)</th>
                <th>Response Time</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(eventData.details).map(([question, value]) => {
                // If the value is an aggregated QA object with arrays of answers:
                if (
                  typeof value === "object" &&
                  value !== null &&
                  "answers" in value &&
                  Array.isArray(value.answers)
                ) {
                  const answers = value.answers;
                  const responseTimes = value.responseTimes || [];
                  return (
                    <React.Fragment key={question}>
                      <tr>
                        <td rowSpan={answers.length}>{question}</td>
                        <td
                          className={
                            isAnswerEmpty(answers[0])
                              ? styles.answerMissing
                              : styles.answerFilled
                          }
                        >
                          {Array.isArray(answers[0])
                            ? answers[0].join(", ")
                            : String(answers[0])}
                        </td>
                        <td>
                          {responseTimes[0]
                            ? formatDate(responseTimes[0])
                            : ""}
                        </td>
                      </tr>
                      {answers.slice(1).map((ans, idx) => (
                        <tr key={idx}>
                          <td
                            className={
                              isAnswerEmpty(ans)
                                ? styles.answerMissing
                                : styles.answerFilled
                            }
                          >
                            {Array.isArray(ans) ? ans.join(", ") : String(ans)}
                          </td>
                          <td>
                            {responseTimes[idx + 1]
                              ? formatDate(responseTimes[idx + 1])
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                } else {
                  // For a single answer (or if value is not an aggregated QA object)
                  const answer = Array.isArray(value)
                    ? value.join(", ")
                    : String(value);
                  return (
                    <tr key={question}>
                      <td>{question}</td>
                      <td
                        className={
                          isAnswerEmpty(value)
                            ? styles.answerMissing
                            : styles.answerFilled
                        }
                      >
                        {answer}
                      </td>
                      <td></td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        ) : (
          <p>No detailed responses available.</p>
        )}
      </div>
    </div>
  );
};

export default EventDetail;