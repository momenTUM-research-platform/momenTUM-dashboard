"use client";

import { useMemo, useState } from "react";
import styles from "./SleepVizPanel.module.css";
import { useStudyQuestions } from "../../hooks/useStudyQuestions";
import { useSleep } from "../../hooks/useSleep";
import { useVariables } from "../../hooks/useVariables";
import { InferredStudyQuestion, RoleKey } from "../../lib/types";
import { isDate, isSchemaNumeric, isTime } from "../../lib/vizUtils";
import { RoleSelect } from "./RoleSelect";
import { SleepRibbon } from "./SleepRibbon";
import { SleepStats } from "./SleepStats";
import VariablesDotGrid from "./VariablesDotGrid";

type Props = {
  studyId: string;
  userIds?: string[];
  from?: string;
  to?: string;
  mapping?: Record<string, string>;
  mappingName?: string;
};

export default function SleepVizPanel({
  studyId, userIds, from, to, mapping, mappingName = "Mapped ID",
}: Props) {
  const { questions, loading: loadingQ } = useStudyQuestions(studyId);

  const [activeTab, setActiveTab] = useState<"sleep" | "variables">("sleep");

  const [roles, setRoles] = useState<Record<RoleKey, string>>({
    bedtime: "", risetime: "", diaryDate: "", awakenings: "", napMinutes: "",
  });
  const { canQuery: canSleep, loading: loadingSleep, load: loadSleep, normalized } =
    useSleep(studyId, roles, { userIds, from, to });

  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const { selectable, canQuery: canVars, loading: loadingVars, load: loadVars, rows } =
    useVariables(studyId, questions, selectedVars, { userIds, from, to, binning: "none", zscore: false });

  const grouped = useMemo(() => {
    if (!questions) return [] as Array<{ module_id: string; module_name: string; items: InferredStudyQuestion[] }>;
    const by = new Map<string, { module_id: string; module_name: string; items: InferredStudyQuestion[] }>();
    for (const q of questions) {
      if (!by.has(q.module_id)) by.set(q.module_id, { module_id: q.module_id, module_name: q.module_name, items: [] });
      by.get(q.module_id)!.items.push(q);
    }
    const list = Array.from(by.values());
    list.sort((a, b) => (a.module_name || a.module_id).localeCompare(b.module_name || b.module_id));
    list.forEach((g) => g.items.sort((a, b) => (a.question_text || "").localeCompare(b.question_text || "")));
    return list;
  }, [questions]);

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === "sleep" ? styles.tabActive : ""}`} onClick={() => setActiveTab("sleep")}>Sleep</button>
        <button className={`${styles.tab} ${activeTab === "variables" ? styles.tabActive : ""}`} onClick={() => setActiveTab("variables")}>Variables</button>
      </div>

      {activeTab === "sleep" ? (
        <>
          <div className={styles.roles}>
            <RoleSelect title="Bedtime (time)" value={roles.bedtime} setValue={(v) => setRoles((s) => ({ ...s, bedtime: v }))} groups={grouped} filter={isTime} placeholder="Select bedtime question" />
            <RoleSelect title="Risetime (time)" value={roles.risetime} setValue={(v) => setRoles((s) => ({ ...s, risetime: v }))} groups={grouped} filter={isTime} placeholder="Select risetime question" />
            <RoleSelect title="Diary Date (optional)" value={roles.diaryDate} setValue={(v) => setRoles((s) => ({ ...s, diaryDate: v }))} groups={grouped} filter={isDate} placeholder="Select date question" optional />
            <RoleSelect title="Awakenings (optional)" value={roles.awakenings} setValue={(v) => setRoles((s) => ({ ...s, awakenings: v }))} groups={grouped} filter={isSchemaNumeric} placeholder="Select awakenings count" optional />
            <RoleSelect title="Nap minutes (optional)" value={roles.napMinutes} setValue={(v) => setRoles((s) => ({ ...s, napMinutes: v }))} groups={grouped} filter={isSchemaNumeric} placeholder="Select total nap minutes" optional />
            <div className={styles.actions}>
              <button className={styles.btn} disabled={!canSleep || loadingQ || loadingSleep} onClick={loadSleep}>
                {loadingSleep ? "Loading…" : "Load"}
              </button>
            </div>
          </div>

          {mapping && <div className={styles.legend}>Using <strong>{mappingName}</strong> where available; falling back to <code>user_id</code>.</div>}

          <SleepRibbon data={normalized} mapping={mapping} mappingName={mappingName} />
          <SleepStats data={normalized} mapping={mapping} mappingName={mappingName} />
        </>
      ) : (
        <>
          <div className={styles.varsControls}>
            <div className="field">
              <label>Variables</label>
              <select
                multiple
                className={styles.inputMulti}
                value={selectedVars}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setSelectedVars(opts);
                }}
              >
                {selectable.map((q) => {
                  const varId = `${q.module_id}:${q.question_id}`;
                  return (
                    <option key={varId} value={varId}>
                      {(q.module_name || q.module_id) + " · " + (q.question_text || q.question_id)}
                    </option>
                  );
                })}
              </select>
              <div className={styles.help}>Tip: ⌘/Ctrl + click to multi-select</div>
            </div>

            <div className="field">
              <label>Actions</label>
              <div className={styles.actionsInline}>
                <button className={styles.btn} disabled={!selectedVars.length || loadingQ || loadingVars} onClick={loadVars}>
                  {loadingVars ? "Loading…" : "Load"}
                </button>
              </div>
            </div>
          </div>

          {mapping && <div className={styles.legend}>Using <strong>{mappingName}</strong> where available; falling back to <code>user_id</code>.</div>}

          <VariablesDotGrid rows={rows} mapping={mapping} maxCols={2} maxUsers={100} />
        </>
      )}
    </div>
  );
}