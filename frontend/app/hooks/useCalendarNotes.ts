// hooks/useCalendarNotes.ts
import { useState, useEffect } from "react";

export const useCalendarNotes = () => {
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const stored = localStorage.getItem("calendarNotes");
    if (stored) setNotes(JSON.parse(stored));
  }, []);

  const addNote = (key: string, note: string) => {
    const updated = { ...notes, [key]: note };
    setNotes(updated);
    localStorage.setItem("calendarNotes", JSON.stringify(updated));
  };

  return { notes, addNote };
};