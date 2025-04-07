import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import styles from "./NoteModal.module.css";

const NoteModal = ({ isOpen, onClose, onSave, users, selectedDate }: any) => {
  const [note, setNote] = useState("");
  const [user, setUser] = useState(users[0] || "");

  useEffect(() => {
    setUser(users[0] || "");
  }, [users]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          x
        </button>
        <h3>Add Note for {selectedDate}</h3>
        <label className={styles.label}>User</label>
        <select
          className={styles.select}
          value={user}
          onChange={(e) => setUser(e.target.value)}
        >
          {users.map((u: string) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <label className={styles.label}>Note</label>
        <textarea
          className={styles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className={styles.saveButton} onClick={() => onSave(user, note)}>
          Save Note
        </button>
      </div>
    </div>,
    document.body
  );
};

export default NoteModal;