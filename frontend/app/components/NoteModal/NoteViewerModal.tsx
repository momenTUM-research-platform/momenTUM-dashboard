"use client";

import React from "react";
import ReactDOM from "react-dom";
import styles from "./NoteModal.module.css";

interface NoteViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: string;
  date: string;
  note: string;
  onDelete: () => void;
}

const NoteViewerModal: React.FC<NoteViewerModalProps> = ({
  isOpen,
  onClose,
  user,
  date,
  note,
  onDelete,
}) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          x
        </button>
        <h3>
          Note for {user} on {date}
        </h3>
        <p>{note}</p>
        <button onClick={onDelete} className={styles.deleteNote}>
          Delete Note
        </button>
      </div>
    </div>,
    document.body
  );
};

export default NoteViewerModal;