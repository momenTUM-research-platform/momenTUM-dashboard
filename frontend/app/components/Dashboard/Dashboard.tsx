"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./Dashboard.module.css";

interface DashboardProps {
  user: any;
  dashboardData: any; // dashboardData.surveys is an array of study IDs (strings)
}

const Dashboard: React.FC<DashboardProps> = ({ user, dashboardData }) => {
  const [deleteMessage, setDeleteMessage] = useState("");

  const handleDeleteStudy = async (studyId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/user/studies", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ study_id: studyId }),
      });
      if (!res.ok) {
        const errData = await res.json();
        setDeleteMessage(
          typeof errData.detail === "string"
            ? errData.detail
            : JSON.stringify(errData.detail)
        );
      } else {
        setDeleteMessage("Study deleted successfully!");
        // Refresh the dashboard (this reloads the page)
        window.location.reload();
      }
    } catch (error) {
      setDeleteMessage("Error deleting study");
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.header}>Dashboard</h1>
      <p className={styles.welcome}>Welcome, {user.username}!</p>

      <div className={styles.studySection}>
        <h2>Your Studies</h2>
        {dashboardData?.surveys && dashboardData.surveys.length > 0 ? (
          <ul className={styles.studyList}>
            {dashboardData.surveys.map((studyId: string) => (
              <li key={studyId} className={styles.studyItem}>
                <Link href={`/study/${studyId}`} className={styles.studyLink}>
                  {studyId}
                </Link>
                <button
                  className={styles.deleteButton}
                  onClick={() => handleDeleteStudy(studyId)}
                  title="Delete Study"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.noStudies}>No studies associated.</p>
        )}
        {deleteMessage && (
          <p className={styles.deleteMessage}>{deleteMessage}</p>
        )}
        <div className={styles.buttonGroup}>
          <Link href="/retrieve-study">
            <button className={styles.button}>Add/Search Studies</button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;