"use client";

import React from "react";
import styles from "./EventDetail.module.css";

// Define the extended event properties to be used by the event detail modal.
export interface ExtendedEventProps {
  extractedStudyId: string;
  moduleName: string;
  sectionName?: string;
  responseTime?: string;
  details: Record<string, any>;
  type: "raw" | "structured";
}

interface EventDetailProps {
  isOpen: boolean;
  onClose: () => void;
  eventData: ExtendedEventProps | null;
}

// Helper function to check if an answer is empty.
const isAnswerEmpty = (answer: any): boolean => {
  return (
    answer === "" ||
    answer === null ||
    (Array.isArray(answer) && answer.length === 0)
  );
};

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
                <td>{eventData.responseTime}</td>
              </tr>
            )}
          </tbody>
        </table>
        <h4 className={styles.detailsHeader}>Q &amp; A</h4>
        <table className={styles.detailsTable}>
          <thead>
            <tr>
              <th>Question</th>
              <th>Answer</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(eventData.details).map(([question, answer]) => (
              <tr key={question}>
                <td>{question}</td>
                <td
                  className={
                    isAnswerEmpty(answer)
                      ? styles.answerMissing
                      : styles.answerFilled
                  }
                >
                  {Array.isArray(answer) ? answer.join(", ") : String(answer)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EventDetail;