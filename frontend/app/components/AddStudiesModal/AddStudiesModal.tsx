"use client";

import React, { useState, useEffect } from "react";
import styles from "./AddStudiesModal.module.css";

interface Study {
  id: number;
  title: string;
  description: string;
}

interface AddStudiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const AddStudiesModal: React.FC<AddStudiesModalProps> = ({ isOpen, onClose, onSave }) => {
  const [availableStudies, setAvailableStudies] = useState<Study[]>([]);
  const [selectedStudies, setSelectedStudies] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch("/api/studies")
        .then((res) => res.json())
        .then((data) => {
          setAvailableStudies(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching studies", err);
          setError("Error fetching studies");
          setLoading(false);
        });
    }
  }, [isOpen]);

  const handleCheckboxChange = (studyId: number) => {
    setSelectedStudies((prev) => {
      if (prev.includes(studyId)) {
        return prev.filter((id) => id !== studyId);
      } else {
        return [...prev, studyId];
      }
    });
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/user/studies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ study_ids: selectedStudies }),
      });
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.detail || "Error saving studies");
      } else {
        onSave();
        onClose();
      }
    } catch (err) {
      setError("Error saving studies");
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Add Studies</h2>
        {loading && <p>Loading studies...</p>}
        {error && <p className={styles.error}>{error}</p>}
        {!loading && availableStudies.length > 0 && (
          <div className={styles.studyList}>
            {availableStudies.map((study) => (
              <label key={study.id} className={styles.studyItem}>
                <input
                  type="checkbox"
                  checked={selectedStudies.includes(study.id)}
                  onChange={() => handleCheckboxChange(study.id)}
                />
                <span className={styles.studyTitle}>{study.title}</span>
                <p className={styles.studyDesc}>{study.description}</p>
              </label>
            ))}
          </div>
        )}
        <div className={styles.modalActions}>
          <button className={styles.button} onClick={handleSave} disabled={selectedStudies.length === 0}>
            Save
          </button>
          <button className={styles.buttonSecondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddStudiesModal;