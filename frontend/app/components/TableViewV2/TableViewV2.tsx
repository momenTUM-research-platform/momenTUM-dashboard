"use client";

import { useMemo, useState } from "react";
import styles from "./TableViewV2.module.css";
import { LabeledSurveyResponseOut } from "@/app/types/schemas";

type Mapping = Record<string, string>;

type Props = {
  rows: LabeledSurveyResponseOut[];
  mapping?: Mapping;
  mappingName?: string;
};

type ViewMode = "response" | "question";
type GroupKey = "none" | "user" | "module" | "mapped" | "question";

function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

type FlatRow = {
  response_time: string;
  user_id: string;
  module_name: string;
  question_text: string;
  question_id: string;
  answer: unknown;
};

function groupLabelForResponseRow(
  r: LabeledSurveyResponseOut,
  key: GroupKey,
  mapping?: Mapping
) {
  if (key === "none") return "All";
  if (key === "module") return r.module_name ?? r.module_id ?? "Unknown Module";
  if (key === "mapped") return mapping?.[r.user_id] ?? `[unmapped] ${r.user_id}`;
  return r.user_id;
}

function groupLabelForFlatRow(r: FlatRow, key: GroupKey, mapping?: Mapping) {
  if (key === "none") return "All";
  if (key === "question") return r.question_text;
  if (key === "module") return r.module_name ?? "Unknown Module";
  if (key === "mapped") return mapping?.[r.user_id] ?? `[unmapped] ${r.user_id}`;
  return r.user_id;
}

function sortGroupEntries<T>(map: Map<string, T[]>) {
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export default function TableViewV2({
  rows,
  mapping,
  mappingName = "Mapped ID",
}: Props) {
  const hasMapping = !!mapping && Object.keys(mapping).length > 0;

  const [viewMode, setViewMode] = useState<ViewMode>("response");
  const [primaryGroupBy, setPrimaryGroupBy] = useState<GroupKey>("none");
  const [secondaryGroupBy, setSecondaryGroupBy] = useState<GroupKey>("none");

  const flatRows: FlatRow[] = useMemo(() => {
    if (viewMode === "response") return [];
    return rows.flatMap((r) =>
      r.answers.map((a) => ({
        response_time: r.response_time,
        user_id: r.user_id,
        module_name: r.module_name ?? r.module_id,
        question_text: a.question_text ?? a.question_id,
        question_id: a.question_id,
        answer: a.answer,
      }))
    );
  }, [rows, viewMode]);

  const groupOptions = useMemo(() => {
    const base: { value: GroupKey; label: string; hidden?: boolean }[] = [
      { value: "none", label: "None" },
      { value: "user", label: "User" },
      { value: "module", label: "Module" },
      { value: "mapped", label: mappingName, hidden: !hasMapping },
      { value: "question", label: "Question", hidden: viewMode !== "question" },
    ];
    return base.filter((x) => !x.hidden);
  }, [hasMapping, mappingName, viewMode]);

  const effectiveSecondary = useMemo(() => {
    if (primaryGroupBy === "none") return "none";
    if (secondaryGroupBy === primaryGroupBy) return "none";
    if (viewMode !== "question" && secondaryGroupBy === "question") return "none";
    if (!hasMapping && secondaryGroupBy === "mapped") return "none";
    return secondaryGroupBy;
  }, [primaryGroupBy, secondaryGroupBy, viewMode, hasMapping]);

  const grouped = useMemo(() => {
    if (viewMode === "response") {
      const primary = new Map<string, LabeledSurveyResponseOut[]>();

      for (const r of rows) {
        const p = groupLabelForResponseRow(r, primaryGroupBy, mapping);
        if (!primary.has(p)) primary.set(p, []);
        primary.get(p)!.push(r);
      }

      const out: Array<{
        label: string;
        items: LabeledSurveyResponseOut[] | Map<string, LabeledSurveyResponseOut[]>;
        isNested: boolean;
      }> = [];

      for (const [pLabel, pItems] of sortGroupEntries(primary)) {
        if (effectiveSecondary === "none") {
          out.push({ label: pLabel, items: pItems, isNested: false });
          continue;
        }

        const secondary = new Map<string, LabeledSurveyResponseOut[]>();
        for (const r of pItems) {
          const s = groupLabelForResponseRow(r, effectiveSecondary, mapping);
          if (!secondary.has(s)) secondary.set(s, []);
          secondary.get(s)!.push(r);
        }

        out.push({ label: pLabel, items: secondary, isNested: true });
      }

      return out;
    }

    const primary = new Map<string, FlatRow[]>();

    for (const r of flatRows) {
      const p = groupLabelForFlatRow(r, primaryGroupBy, mapping);
      if (!primary.has(p)) primary.set(p, []);
      primary.get(p)!.push(r);
    }

    const out: Array<{
      label: string;
      items: FlatRow[] | Map<string, FlatRow[]>;
      isNested: boolean;
    }> = [];

    for (const [pLabel, pItems] of sortGroupEntries(primary)) {
      if (effectiveSecondary === "none") {
        out.push({ label: pLabel, items: pItems, isNested: false });
        continue;
      }

      const secondary = new Map<string, FlatRow[]>();
      for (const r of pItems) {
        const s = groupLabelForFlatRow(r, effectiveSecondary, mapping);
        if (!secondary.has(s)) secondary.set(s, []);
        secondary.get(s)!.push(r);
      }

      out.push({ label: pLabel, items: secondary, isNested: true });
    }

    return out;
  }, [rows, flatRows, viewMode, primaryGroupBy, effectiveSecondary, mapping]);

  const setMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === "response") {
      setPrimaryGroupBy("none");
      setSecondaryGroupBy("none");
    } else {
      setPrimaryGroupBy("question");
      setSecondaryGroupBy(hasMapping ? "mapped" : "user");
    }
  };

  const renderResponseTable = (items: LabeledSurveyResponseOut[]) => (
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
              ? mapped
                ? `${mapped} (${r.user_id})`
                : r.user_id
              : r.user_id;

            return (
              <tr key={`${r.user_id}-${r.module_id}-${r.response_time}`}>
                <td className={styles.td}>
                  {new Date(r.response_time).toLocaleString()}
                </td>
                <td className={styles.td}>{userCell}</td>
                <td className={styles.td}>{r.module_name ?? r.module_id}</td>
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
        </tbody>
      </table>
    </div>
  );

  const renderQuestionTable = (items: FlatRow[]) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Time</th>
            <th className={styles.th}>
              {hasMapping ? `${mappingName} (User)` : "User"}
            </th>
            <th className={styles.th}>Module</th>
            <th className={styles.th}>Question</th>
            <th className={styles.th}>Answer</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => {
            const mapped = mapping?.[r.user_id];
            const userCell = hasMapping
              ? mapped
                ? `${mapped} (${r.user_id})`
                : r.user_id
              : r.user_id;

            const empty = isEmpty(r.answer);

            return (
              <tr key={`${r.user_id}-${r.question_id}-${r.response_time}-${i}`}>
                <td className={styles.td}>
                  {new Date(r.response_time).toLocaleString()}
                </td>
                <td className={styles.td}>{userCell}</td>
                <td className={styles.td}>{r.module_name}</td>
                <td className={styles.td}>{r.question_text}</td>
                <td
                  className={`${styles.td} ${
                    empty ? styles.answerEmpty : styles.answerFilled
                  }`}
                >
                  {empty ? "—" : String(r.answer)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.controlBlock}>
          <div className={styles.controlLabel}>Display Mode</div>
          <div className={styles.segment}>
            <button
              className={`${styles.segmentBtn} ${
                viewMode === "response" ? styles.active : ""
              }`}
              onClick={() => setMode("response")}
            >
              Response View
            </button>
            <button
              className={`${styles.segmentBtn} ${
                viewMode === "question" ? styles.active : ""
              }`}
              onClick={() => setMode("question")}
            >
              Question View
            </button>
          </div>
        </div>

        <div className={styles.controlBlock}>
          <div className={styles.controlLabel}>Group By</div>
          <div className={styles.groupRow}>
            <div className={styles.selectGroup}>
              <div className={styles.selectLabel}>Primary</div>
              <select
                className={styles.select}
                value={primaryGroupBy}
                onChange={(e) => {
                  const v = e.target.value as GroupKey;
                  setPrimaryGroupBy(v);
                  if (v === "none") setSecondaryGroupBy("none");
                }}
              >
                {groupOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.selectGroup}>
              <div className={styles.selectLabel}>Then</div>
              <select
                className={styles.select}
                value={effectiveSecondary}
                onChange={(e) => setSecondaryGroupBy(e.target.value as GroupKey)}
                disabled={primaryGroupBy === "none"}
              >
                {groupOptions
                  .filter((o) => o.value !== "none")
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                <option value="none">None</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {grouped.map((block) => (
        <div key={block.label} className={styles.block}>
          {primaryGroupBy !== "none" && (
            <h3 className={styles.blockTitle}>{block.label}</h3>
          )}

          {block.isNested ? (
            <div className={styles.nested}>
              {Array.from(block.items as Map<string, any[]>)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([subLabel, subItems]) => (
                  <div key={subLabel} className={styles.subBlock}>
                    <div className={styles.subTitle}>{subLabel}</div>
                    {viewMode === "response"
                      ? renderResponseTable(subItems as LabeledSurveyResponseOut[])
                      : renderQuestionTable(subItems as FlatRow[])}
                  </div>
                ))}
            </div>
          ) : viewMode === "response" ? (
            renderResponseTable(block.items as LabeledSurveyResponseOut[])
          ) : (
            renderQuestionTable(block.items as FlatRow[])
          )}
        </div>
      ))}
    </div>
  );
}