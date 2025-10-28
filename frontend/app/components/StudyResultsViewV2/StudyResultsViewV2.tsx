"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchLabeledResponses,
  fetchFacets,
  fetchStudyQuestions,
  fetchUserMapping,
  Facets,
  StudyQuestion,
  MappingMode,
} from "@/app/lib/responses";
import { LabeledSurveyResponseOut } from "@/app/types/schemas";
import TableViewV2 from "@/app/components/TableViewV2/TableViewV2";
import CalendarViewV2 from "@/app/components/CalendarViewV2/CalendarViewV2";
import SleepVizPanel from "@/app/components/SleepViz/SleepVizPanel";
import AdherencePanel from "../AdherencePanel/AdherencePanel";
import styles from "./StudyResultsViewV2.module.css";

type Props = { studyId: string };

export default function StudyResultsViewV2({ studyId }: Props) {
  // data
  const [rows, setRows] = useState<LabeledSurveyResponseOut[] | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [questions, setQuestions] = useState<StudyQuestion[] | null>(null);

  // ui state
  const [loading, setLoading] = useState(false);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [userIds, setUserIds] = useState<string[]>([]);
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // mapping selection
  const [mapKey, setMapKey] = useState<string>("");              // `${module_id}:${question_id}`
  const [mapMode, setMapMode] = useState<MappingMode>("latest"); // "latest" | "earliest"
  const [userMap, setUserMap] = useState<Record<string, string> | null>(null);

  // view + paging
  const [activeView, setActiveView] = useState<"table" | "calendar" | "visualize" | "adherence">("table");
  const [page, setPage] = useState(1);
  const TABLE_PAGE_SIZE = 100;
  const CALENDAR_LIMIT = 5000;

  const distinctUsers = useMemo(() => facets?.users ?? [], [facets]);
  const distinctModules = useMemo(() => facets?.modules ?? [], [facets]);

  const selectedQuestion: StudyQuestion | null = useMemo(() => {
    if (!questions || !mapKey) return null;
    const [mid, qid] = mapKey.split(":");
    return questions.find((q) => q.module_id === mid && q.question_id === qid) ?? null;
  }, [questions, mapKey]);

  async function load(pageArg = page) {
    setLoading(true);
    setError(null);
    try {
      const isCalendar = activeView === "calendar";
      const res = await fetchLabeledResponses(studyId, {
        user_id: userIds.length ? userIds : undefined,
        module_id: moduleIds.length ? moduleIds : undefined,
        from: from || undefined,
        to: to || undefined,
        sort: "desc",
        skip: isCalendar ? 0 : (pageArg - 1) * TABLE_PAGE_SIZE,
        limit: isCalendar ? CALENDAR_LIMIT : TABLE_PAGE_SIZE,
      });
      setRows(res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadFacets() {
    setFacetsLoading(true);
    try {
      const f = await fetchFacets(studyId, {
        user_id: userIds.length ? userIds : undefined,
        module_id: moduleIds.length ? moduleIds : undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setFacets(f);
    } finally {
      setFacetsLoading(false);
    }
  }

  async function loadQuestions() {
    setQuestionsLoading(true);
    try {
      const q = await fetchStudyQuestions(studyId);
      setQuestions(q);
      // keep selection if still valid
      setMapKey((prev) => {
        if (!prev) return "";
        const [mid, qid] = prev.split(":");
        return q.some((x) => x.module_id === mid && x.question_id === qid) ? prev : "";
      });
    } finally {
      setQuestionsLoading(false);
    }
  }

  async function loadMapping() {
    if (!mapKey) {
      setUserMap(null);
      return;
    }
    const [module_id, question_id] = mapKey.split(":");
    if (!module_id || !question_id) return;

    setMappingLoading(true);
    try {
      const m = await fetchUserMapping(studyId, { module_id, question_id, mode: mapMode });
      setUserMap(m);
    } catch (e) {
      console.error(e);
      setUserMap(null);
    } finally {
      setMappingLoading(false);
    }
  }

  // reload on filters/view change
  useEffect(() => {
    setPage(1);
    loadFacets();
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, JSON.stringify(userIds), JSON.stringify(moduleIds), from, to, activeView]);

  // fetch questions when study changes
  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  // fetch mapping whenever selection/mode changes
  useEffect(() => {
    loadMapping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, mapKey, mapMode]);

  const toggleUser = (v: string) =>
    setUserIds((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  const toggleModule = (v: string) =>
    setModuleIds((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const chevronBg =
    "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 8l4 4 4-4' stroke='%236b7280' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

  // group questions by module for a tidy select
  const questionsByModule = useMemo(() => {
    if (!questions) return [];
    const map = new Map<string, { module_id: string; module_name: string; items: StudyQuestion[] }>();
    for (const q of questions) {
      if (!map.has(q.module_id)) {
        map.set(q.module_id, { module_id: q.module_id, module_name: q.module_name, items: [] });
      }
      map.get(q.module_id)!.items.push(q);
    }
    const groups = Array.from(map.values()).sort((a, b) =>
      (a.module_name || "").localeCompare(b.module_name || "")
    );
    groups.forEach((g) =>
      g.items.sort((a, b) => (a.question_text || "").localeCompare(b.question_text || ""))
    );
    return groups;
  }, [questions]);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-1">Filters</h2>
        <p className="text-sm text-gray-600">
          Refine by users, modules, and time range. Calendar loads a larger batch automatically.
        </p>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.segment} role="tablist" aria-label="View">
          <button
            role="tab"
            aria-selected={activeView === "table"}
            onClick={() => setActiveView("table")}
            className={`${styles.segmentBtn} ${activeView === "table" ? styles.segmentBtnActive : ""}`}
          >
            Table
          </button>
          <button
            role="tab"
            aria-selected={activeView === "calendar"}
            onClick={() => setActiveView("calendar")}
            className={`${styles.segmentBtn} ${activeView === "calendar" ? styles.segmentBtnActive : ""}`}
          >
            Calendar
          </button>
          <button
            role="tab"
            aria-selected={activeView === "visualize"}
            onClick={() => setActiveView("visualize")}
            className={`${styles.segmentBtn} ${activeView === "visualize" ? styles.segmentBtnActive : ""}`}
          >
            Visualize
          </button>

          <button
            role="tab"
            aria-selected={activeView === "adherence"}
            onClick={() => setActiveView("adherence")}
            className={`${styles.segmentBtn} ${activeView === "adherence" ? styles.segmentBtnActive : ""}`}
          >
            Adherence
          </button>
        </div>

        <button
          className={styles.btn}
          onClick={() => load(activeView === "calendar" ? 1 : page)}
          disabled={loading}
        >
          Apply / Refresh
        </button>
        <button
          className={styles.btn}
          onClick={() => {
            setUserIds([]);
            setModuleIds([]);
            setFrom("");
            setTo("");
          }}
          disabled={loading || facetsLoading}
        >
          Reset
        </button>

        <div className={styles.count}>
          {rows ? `Loaded ${rows.length} record${rows.length !== 1 ? "s" : ""}` : ""}
        </div>
      </div>

      {/* Mapping + Filters */}
      <div className={styles.filters}>
        {/* Mapping selector */}
        <div className="field">
          <label>Mapping (pick a question to label users, e.g., “Participant ID”)</label>
          <select
            className={styles.input}
            value={mapKey}
            onChange={(e) => setMapKey(e.target.value)}
            disabled={questionsLoading || !questionsByModule.length}
            style={{
              appearance: "none",
              backgroundImage: chevronBg,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right .75rem center",
              backgroundSize: "1rem",
            }}
          >
            <option value="">— None —</option>
            {questionsByModule.map((grp) => (
              <optgroup key={grp.module_id} label={grp.module_name || grp.module_id}>
                {grp.items.map((q) => {
                  const val = `${q.module_id}:${q.question_id}`;
                  return (
                    <option key={val} value={val}>
                      {q.question_text}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>

          <div className="mt-2 flex items-center gap-2">
            <span className={styles.help}>
              {mappingLoading
                ? "Loading mapping…"
                : selectedQuestion
                ? `Using: ${selectedQuestion.question_text} (${mapMode})`
                : "No mapping selected"}
            </span>
            {mapKey && (
              <div className={styles.segment} role="group" aria-label="Mapping mode">
                <button
                  type="button"
                  onClick={() => setMapMode("latest")}
                  className={`${styles.segmentBtn} ${mapMode === "latest" ? styles.segmentBtnActive : ""}`}
                >
                  Latest
                </button>
                <button
                  type="button"
                  onClick={() => setMapMode("earliest")}
                  className={`${styles.segmentBtn} ${mapMode === "earliest" ? styles.segmentBtnActive : ""}`}
                >
                  Earliest
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Users */}
        <div className="field">
          <label>Users</label>
          <select
            className={styles.input}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) toggleUser(v);
            }}
            style={{
              appearance: "none",
              backgroundImage: chevronBg,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right .75rem center",
              backgroundSize: "1rem",
            }}
          >
            <option value="">Select user…</option>
            {distinctUsers.map((u) => (
              <option key={u} value={u}>
                {userIds.includes(u) ? "✓ " : ""}
                {u}
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            {userIds.length === 0 ? (
              <span className={styles.help}>All users</span>
            ) : (
              <>
                {userIds.map((u) => (
                  <span key={u} className={styles.chip}>
                    {u}
                    <button aria-label={`Remove ${u}`} onClick={() => toggleUser(u)}>
                      ×
                    </button>
                  </span>
                ))}
                <button className="text-xs underline" onClick={() => setUserIds([])}>
                  Clear all
                </button>
              </>
            )}
          </div>
          {facetsLoading && <div className={styles.help}>Updating…</div>}
        </div>

        {/* Modules */}
        <div className="field">
          <label>Modules</label>
          <select
            className={styles.input}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) toggleModule(v);
            }}
            style={{
              appearance: "none",
              backgroundImage: chevronBg,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right .75rem center",
              backgroundSize: "1rem",
            }}
          >
            <option value="">Select module…</option>
            {distinctModules.map((m) => (
              <option key={m.id} value={m.id}>
                {moduleIds.includes(m.id) ? "✓ " : ""}
                {m.name || m.id}
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            {moduleIds.length === 0 ? (
              <span className={styles.help}>All modules</span>
            ) : (
              <>
                {moduleIds.map((m) => (
                  <span key={m} className={styles.chip}>
                    {distinctModules.find((x) => x.id === m)?.name || m}
                    <button aria-label={`Remove ${m}`} onClick={() => toggleModule(m)}>
                      ×
                    </button>
                  </span>
                ))}
                <button className="text-xs underline" onClick={() => setModuleIds([])}>
                  Clear all
                </button>
              </>
            )}
          </div>
        </div>

        {/* Dates */}
        <div className="field">
          <label>From</label>
          <input
            type="datetime-local"
            className={styles.input}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div className="field">
          <label>To</label>
          <input
            type="datetime-local"
            className={styles.input}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {/* Active view & pager */}
      {!loading && rows && (
        <>
          {rows.length === 0 ? (
            <div className="border rounded-lg p-4 text-sm text-gray-600 bg-white">No results</div>
          ) : activeView === "table" ? (
            <TableViewV2
              rows={rows}
              mapping={userMap ?? undefined}
              mappingName={selectedQuestion?.question_text || "Mapped ID"}
            />
          ) : activeView === "calendar" ? (
            <CalendarViewV2
              rows={rows}
              mapping={userMap ?? undefined}
              mappingName={selectedQuestion?.question_text || "Mapped ID"}
            />
          ) : activeView === "visualize" ? (
            <SleepVizPanel
              studyId={studyId}
              userIds={userIds.length ? userIds : undefined}
              from={from || undefined}
              to={to || undefined}
              mapping={userMap ?? undefined}
              mappingName={selectedQuestion?.question_text || "Mapped ID"}
            />
          ) : (
            // adherence
            <AdherencePanel
              studyId={studyId}
              userIds={userIds.length ? userIds : undefined}
              from={from ? from.slice(0,10) : undefined} // pass Y-M-D; panel normalizes both
              to={to ? to.slice(0,10) : undefined}
              mapping={userMap ?? undefined}
              mappingName={selectedQuestion?.question_text || "Mapped ID"}
            />
          )}

          {activeView === "table" && (
            <div className={styles.pager}>
              <button
                className={styles.btn}
                onClick={() => {
                  if (page > 1) {
                    setPage((p) => p - 1);
                    load(page - 1);
                  }
                }}
                disabled={page === 1 || loading}
              >
                Previous
              </button>
              <div className="text-sm">Page {page}</div>
              <button
                className={styles.btn}
                onClick={() => {
                  setPage((p) => p + 1);
                  load(page + 1);
                }}
                disabled={loading || rows.length < TABLE_PAGE_SIZE}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}