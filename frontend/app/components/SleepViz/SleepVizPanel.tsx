// components/SleepVizPanel/SleepVizPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./SleepVizPanel.module.css";
import { useStudyQuestions } from "../../hooks/useStudyQuestions";
import { useSleep } from "../../hooks/useSleep";
import { InferredStudyQuestion, RoleKey } from "../../lib/types";
import { isSchemaNumeric, isTime } from "../../lib/vizUtils";
import { RoleSelect } from "./RoleSelect";
import { SleepRibbon } from "./SleepRibbon";
import { SleepStats } from "./SleepStats";

type Props = {
  studyId: string;
  userIds?: string[];
  from?: string;
  to?: string;
  mapping?: Record<string, string>;
  mappingName?: string;
};

type PersistedState = {
  activeTab?: "sleep" | "variables";
  roles?: Record<RoleKey, string>;
  selectedVars?: string[];
};

const defaultRoles: Record<RoleKey, string> = {
  trySleepTime: "",
  outOfBedTime: "",
  sleepLatencyMin: "",
  finalAwakeningTime: "",
  awakeningsCount: "",
  awakeningsDurationMin: "",
  napMinutes: "",
  napCount: "",
};

function readPersisted(key: string): { roles: Record<RoleKey, string> } | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed || typeof parsed !== "object") return null;

    const roles = { ...defaultRoles, ...(parsed.roles ?? {}) } as Record<RoleKey, string>;
    return { roles };
  } catch {
    return null;
  }
}

function writePersisted(key: string, roles: Record<RoleKey, string>) {
  try {
    const state: PersistedState = { activeTab: "sleep", roles, selectedVars: [] };
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {}
}

export default function SleepVizPanel({
  studyId,
  userIds,
  from,
  to,
  mapping,
  mappingName = "Mapped ID",
}: Props) {
  const persistKey = `sleepviz:${studyId}`;

  const { questions, loading: loadingQ } = useStudyQuestions(studyId);

  const [roles, setRoles] = useState<Record<RoleKey, string>>(defaultRoles);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = readPersisted(persistKey);
    if (saved) setRoles(saved.roles);
    setHydrated(true);
  }, [persistKey]);

  useEffect(() => {
    if (!hydrated) return;
    writePersisted(persistKey, roles);
  }, [persistKey, roles, hydrated]);

  const { canQuery: canSleep, loading: loadingSleep, load: loadSleep, normalized } = useSleep(
    studyId,
    roles,
    { userIds, from, to }
  );

  const grouped = useMemo(() => {
    if (!questions) {
      return [] as Array<{ module_id: string; module_name: string; items: InferredStudyQuestion[] }>;
    }

    const by = new Map<string, { module_id: string; module_name: string; items: InferredStudyQuestion[] }>();

    for (const q of questions) {
      if (!by.has(q.module_id)) {
        by.set(q.module_id, { module_id: q.module_id, module_name: q.module_name, items: [] });
      }
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
        <button className={`${styles.tab} ${styles.tabActive}`} type="button">
          Sleep
        </button>
      </div>

      <div className={styles.roles}>
        <RoleSelect
          title="Try to sleep (time)"
          value={roles.trySleepTime}
          setValue={(v) => setRoles((s) => ({ ...s, trySleepTime: v }))}
          groups={grouped}
          filter={isTime}
          placeholder="Select try-to-sleep question"
        />

        <RoleSelect
          title="Out of bed (time)"
          value={roles.outOfBedTime}
          setValue={(v) => setRoles((s) => ({ ...s, outOfBedTime: v }))}
          groups={grouped}
          filter={isTime}
          placeholder="Select out-of-bed question"
        />

        <RoleSelect
          title="Sleep latency (min)"
          value={roles.sleepLatencyMin}
          setValue={(v) => setRoles((s) => ({ ...s, sleepLatencyMin: v }))}
          groups={grouped}
          filter={isSchemaNumeric}
          placeholder="Select sleep latency (minutes)"
          optional
        />

        <RoleSelect
          title="Final awakening (time)"
          value={roles.finalAwakeningTime}
          setValue={(v) => setRoles((s) => ({ ...s, finalAwakeningTime: v }))}
          groups={grouped}
          filter={isTime}
          placeholder="Select final awakening time"
          optional
        />

        <RoleSelect
          title="Awakenings count"
          value={roles.awakeningsCount}
          setValue={(v) => setRoles((s) => ({ ...s, awakeningsCount: v }))}
          groups={grouped}
          filter={isSchemaNumeric}
          placeholder="Select awakenings count"
          optional
        />

        <RoleSelect
          title="Awake minutes (WASO)"
          value={roles.awakeningsDurationMin}
          setValue={(v) => setRoles((s) => ({ ...s, awakeningsDurationMin: v }))}
          groups={grouped}
          filter={isSchemaNumeric}
          placeholder="Select total awake minutes"
          optional
        />

        <RoleSelect
          title="Nap minutes"
          value={roles.napMinutes}
          setValue={(v) => setRoles((s) => ({ ...s, napMinutes: v }))}
          groups={grouped}
          filter={isSchemaNumeric}
          placeholder="Select total nap minutes"
          optional
        />

        <RoleSelect
          title="Nap count"
          value={roles.napCount}
          setValue={(v) => setRoles((s) => ({ ...s, napCount: v }))}
          groups={grouped}
          filter={isSchemaNumeric}
          placeholder="Select nap count"
          optional
        />

        <div className={styles.actions}>
          <button className={styles.btn} disabled={!canSleep || loadingQ || loadingSleep} onClick={loadSleep}>
            {loadingSleep ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      {mapping && (
        <div className={styles.legend}>
          Using <strong>{mappingName}</strong> where available; falling back to <code>user_id</code>.
        </div>
      )}

      <SleepRibbon data={normalized} mapping={mapping} mappingName={mappingName} />
      <SleepStats data={normalized} mapping={mapping} mappingName={mappingName} />
    </div>
  );
}