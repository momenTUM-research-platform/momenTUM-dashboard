"use client";

import { useMemo, useState } from "react";
import styles from "./TableViewV2.module.css";
import { LabeledSurveyResponseOut } from "@/app/types/schemas";

type Mapping = Record<string, string>;

type Props = {
  rows: LabeledSurveyResponseOut[];          // from /responses:labeled
  mapping?: Mapping;                          // optional user_id -> label (e.g., participant_id)
  mappingName?: string;                       // UI label for mapping (defaults to "Mapped ID")
};

function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export default function TableViewV2({ rows, mapping, mappingName = "Mapped ID" }: Props) {
  type GroupKey = "none" | "user" | "module" | "mapped";
  const [groupBy, setGroupBy] = useState<GroupKey>("none");

  // helper: prefer mapped label, fallback to user_id
  const displayIdFor = (userId: string) => mapping?.[userId] ?? userId;
  const hasMapping = !!mapping && Object.keys(mapping).length > 0;

  const groups = useMemo(() => {
    if (groupBy === "none") return { All: rows };

    const map = new Map<string, LabeledSurveyResponseOut[]>();

    for (const r of rows) {
      let key: string;
      if (groupBy === "module") {
        key = r.module_name ?? r.module_id ?? "Unknown Module";
      } else if (groupBy === "mapped") {
        // Use mapped label; if not present for this user, show “[unmapped] user_id”
        key = mapping?.[r.user_id] ?? `[unmapped] ${r.user_id}`;
      } else {
        // "user"
        key = r.user_id;
      }

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }

    // Stable-ish sorting of group headers
    const entries = Array.from(map.entries());
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return Object.fromEntries(entries);
  }, [rows, groupBy, mapping]);

  return (
    <div className={styles.wrapper}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.groupToggle} role="tablist" aria-label="Grouping">
          <button
            className={`${styles.toggleBtn} ${groupBy === "none" ? styles.active : ""}`}
            onClick={() => setGroupBy("none")}
            role="tab"
            aria-selected={groupBy === "none"}
          >
            No Grouping
          </button>
          <button
            className={`${styles.toggleBtn} ${groupBy === "user" ? styles.active : ""}`}
            onClick={() => setGroupBy("user")}
            role="tab"
            aria-selected={groupBy === "user"}
          >
            Group by User
          </button>
          <button
            className={`${styles.toggleBtn} ${groupBy === "module" ? styles.active : ""}`}
            onClick={() => setGroupBy("module")}
            role="tab"
            aria-selected={groupBy === "module"}
          >
            Group by Module
          </button>
          {hasMapping && (
            <button
              className={`${styles.toggleBtn} ${groupBy === "mapped" ? styles.active : ""}`}
              onClick={() => setGroupBy("mapped")}
              role="tab"
              aria-selected={groupBy === "mapped"}
              title={`Group by ${mappingName}`}
            >
              Group by {mappingName}
            </button>
          )}
        </div>
      </div>

      {/* Groups */}
      {Object.entries(groups).map(([label, items]) => (
        <div key={label} className={styles.block}>
          {groupBy !== "none" && (
            <h3 className={styles.blockTitle}>
              {label}
              {groupBy === "mapped" && hasMapping && (
                <span className="ml-2 text-xs text-gray-500">({mappingName})</span>
              )}
            </h3>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Time</th>
                  <th className={styles.th}>
                    {hasMapping ? `${mappingName} (User)` : "User"}
                  </th>
                  <th className={styles.th}>Module</th>
                  <th className={styles.th}>Answers</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const mapped = mapping?.[r.user_id];
                  const userCell = hasMapping
                    ? (mapped ? `${mapped} (${r.user_id})` : r.user_id)
                    : r.user_id;

                  return (
                    <tr
                      key={`${r.user_id}-${r.module_id}-${r.response_time}`}
                      className={styles.row}
                    >
                      <td className={styles.td}>
                        {new Date(r.response_time).toLocaleString()}
                      </td>

                      <td className={styles.td}>
                        {userCell}
                      </td>

                      <td className={styles.td}>
                        {r.module_name ?? r.module_id}
                      </td>

                      <td className={styles.td}>
                        <ul className={styles.answerList}>
                          {r.answers.map((a) => {
                            const empty = isEmpty(a.answer);
                            return (
                              <li
                                key={a.question_id}
                                className={`${styles.answerItem} ${
                                  empty ? styles.answerEmpty : styles.answerFilled
                                }`}
                              >
                                <span className={styles.qLabel}>
                                  {a.question_text ?? a.question_id}:
                                </span>{" "}
                                <span className={styles.qValue}>
                                  {empty ? "—" : String(a.answer)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  );
                })}

                {items.length === 0 && (
                  <tr>
                    <td className={styles.td} colSpan={4}>
                      No results
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}