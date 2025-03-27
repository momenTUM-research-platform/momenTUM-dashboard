"use client";

import { useState } from "react";
import styles from "./PasswordInput.module.css";

export default function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);

  return (
    <div className={styles.passwordInput}>
      <input
        {...props}
        type={show ? "text" : "password"}
        className={styles.passwordInputField}
      />
      <button
        type="button"
        className={styles.passwordInputToggle}
        onClick={() => setShow(!show)}
      >
        {show ? (
          // "Eye Closed" icon
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 4C7 4 2.73 7.11 1 11.5c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.11 17 4 12 4M12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4Z" />
            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2"/>
          </svg>
        ) : (
          // "Eye Open" icon
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12,6A9.77,9.77,0,0,1,21,11.5C19.27,15.89,15,19,12,19s-7.27-3.11-9-7.5A9.77,9.77,0,0,1,12,6M12,8A3.5,3.5,0,1,0,15.5,11.5,3.5,3.5,0,0,0,12,8Z" />
          </svg>
        )}
      </button>
    </div>
  );
}