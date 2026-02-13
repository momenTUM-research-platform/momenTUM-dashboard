"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchLabeledResponses,
  fetchFacets,
  fetchStudyQuestions,
  fetchUserMapping,
  Facets,
  StudyQuestion,
} from "@/app/lib/responses";
import { LabeledSurveyResponseOut } from "@/app/types/schemas";
import TableViewV2 from "@/app/components/TableViewV2/TableViewV2";
import CalendarViewV2 from "@/app/components/CalendarViewV2/CalendarViewV2";
import SleepVizPanel from "@/app/components/SleepViz/SleepVizPanel";
import AdherencePanel from "../AdherencePanel/AdherencePanel";
import styles from "./StudyResultsViewV2.module.css";

type Props = { studyId: string };

export default function StudyResultsViewV2({ studyId }: Props) {
  // main data
  const [rows, setRows] = useState<LabeledSurveyResponseOut[] | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [questions, setQuestions] = useState<StudyQuestion[] | null>(null);

  // ui state
  const [loading, setLoading] = useState(false);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // basic filters
  const [userIds, setUserIds] = useState<string[]>([]);
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // extra filter: by mapped identifier (e.g. Participant ID)
  const [mappedIds, setMappedIds] = useState<string[]>([]);

  // mapping selection (which question is used to derive mapping per user)
  const [mapKey, setMapKey] = useState<string>("");              // `${module_id}:${question_id}`
  const [userMap, setUserMap] = useState<Record<string, string> | null>(null); // user_id -> mapped label

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

  // all distinct mapped values (e.g. Participant IDs) from userMap
  const distinctMappedIds = useMemo(() => {
    if (!userMap) return [];
    const vals = Object.values(userMap).filter((v) => v && v.trim() !== "");
    return Array.from(new Set(vals)).sort();
  }, [userMap]);

  // effective set of internal user IDs sent to the backend, combining:
  // - direct userIds filter
  // - mappedIds filter (resolved via userMap)
  const effectiveUserIds = useMemo(() => {
    if (!userMap && mappedIds.length) {
      // mapping filter selected but mapping not loaded; safest default is no results
      return [] as string[];
    }

    let mappedUserIds: string[] = [];
    if (userMap && mappedIds.length) {
      mappedUserIds = Object.entries(userMap)
        .filter(([, label]) => mappedIds.includes(label))
        .map(([uid]) => uid);
    }

    // only mappedIds filter
    if (!userIds.length && mappedUserIds.length) {
      return mappedUserIds;
    }

    // only explicit userIds filter
    if (userIds.length && !mappedUserIds.length) {
      return userIds;
    }

    // both: intersect explicit userIds with mapped-based IDs
    if (userIds.length && mappedUserIds.length) {
      const mappedSet = new Set(mappedUserIds);
      return userIds.filter((u) => mappedSet.has(u));
    }

    // no filtering on user dimension
    return userIds;
  }, [userIds, mappedIds, userMap]);

  async function load(pageArg = page) {
    setLoading(true);
    setError(null);
    try {
      const isCalendar = activeView === "calendar";
      const res = await fetchLabeledResponses(studyId, {
        user_id: effectiveUserIds.length ? effectiveUserIds : undefined,
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
        user_id: effectiveUserIds.length ? effectiveUserIds : undefined,
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
      // keep existing mapping selection if it still exists in the latest question set
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
      setMappedIds([]); // reset mapping filter when no mapping is selected
      return;
    }
    const [module_id, question_id] = mapKey.split(":");
    if (!module_id || !question_id) return;

    setMappingLoading(true);
    try {
      const m = await fetchUserMapping(studyId, { module_id, question_id });
      setUserMap(m);
      // keep mappedIds if they are still valid labels; drop anything that disappeared
      setMappedIds((prev) => {
        if (!m) return [];
        const labels = new Set(Object.values(m));
        return prev.filter((id) => labels.has(id));
      });
    } catch (e) {
      console.error(e);
      setUserMap(null);
      setMappedIds([]);
    } finally {
      setMappingLoading(false);
    }
  }

  // reload data when filters or view change
  useEffect(() => {
    setPage(1);
    loadFacets();
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    studyId,
    JSON.stringify(effectiveUserIds),
    JSON.stringify(moduleIds),
    from,
    to,
    activeView,
  ]);

  // fetch questions whenever the study changes
  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  // fetch mapping whenever mapping selection or mode changes
  useEffect(() => {
    loadMapping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, mapKey]);

  const toggleUser = (v: string) =>
    setUserIds((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const toggleModule = (v: string) =>
    setModuleIds((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const toggleMappedId = (v: string) =>
    setMappedIds((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const chevronBg =
    "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 8l4 4 4-4' stroke='%236b7280' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

  function looksLikeIdentifierQuestion(q: StudyQuestion) {
    const hay = [
      q.question_text,
      q.question_id,
      q.module_name,
      q.module_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  
    // avoid matching random words containing "id" (like "did", "mid", etc.)
    const idWord = /\b(id|ids)\b/;
    const common = /(participant|study|subject|user|app|record)\s*id\b/;
  
    return common.test(hay) || idWord.test(hay) || hay.includes("_id");
  }

  // group questions by module for a tidy select
  const questionsByModule = useMemo(() => {
    if (!questions) return [];
    const filtered = questions.filter(looksLikeIdentifierQuestion);

    const map = new Map<string, { module_id: string; module_name: string; items: StudyQuestion[] }>();
    for (const q of filtered) {
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

  const mappingLabel = selectedQuestion?.question_text || "Mapped ID";

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-1">Filters</h2>
        <p className="text-sm text-gray-600">
          Refine by users, mapped IDs, modules, and time range. Calendar loads a larger batch
          automatically.
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
            setMappedIds([]);
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
          <label>Mapping (pick a question to label users, e.g. “Participant ID”)</label>
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
                ? `Using: ${selectedQuestion.question_text}`
                : "No mapping selected"}
            </span>
          </div>
        </div>

        {/* Mapped IDs (e.g. Participant IDs) */}
        {userMap && distinctMappedIds.length > 0 && (
          <div className="field">
            <label>{mappingLabel}</label>
            <select
              className={styles.input}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) toggleMappedId(v);
              }}
              style={{
                appearance: "none",
                backgroundImage: chevronBg,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right .75rem center",
                backgroundSize: "1rem",
              }}
            >
              <option value="">
                {mappedIds.length ? "Add another…" : "Select…"}
              </option>
              {distinctMappedIds.map((id) => (
                <option key={id} value={id}>
                  {mappedIds.includes(id) ? "✓ " : ""}
                  {id}
                </option>
              ))}
            </select>
            <div className="mt-2 flex flex-wrap gap-2">
              {mappedIds.length === 0 ? (
                <span className={styles.help}>All mapped IDs</span>
              ) : (
                <>
                  {mappedIds.map((id) => (
                    <span key={id} className={styles.chip}>
                      {id}
                      <button
                        aria-label={`Remove ${id}`}
                        onClick={() => toggleMappedId(id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    className="text-xs underline"
                    onClick={() => setMappedIds([])}
                  >
                    Clear all
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Users (internal IDs) */}
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
            <div className="border rounded-lg p-4 text-sm text-gray-600 bg-white">
              No results
            </div>
          ) : activeView === "table" ? (
            <TableViewV2
              rows={rows}
              mapping={userMap ?? undefined}
              mappingName={mappingLabel}
            />
          ) : activeView === "calendar" ? (
            <CalendarViewV2
              rows={rows}
              mapping={userMap ?? undefined}
              mappingName={mappingLabel}
            />
          ) : activeView === "visualize" ? (
            <SleepVizPanel
              studyId={studyId}
              userIds={effectiveUserIds.length ? effectiveUserIds : undefined}
              from={from || undefined}
              to={to || undefined}
              mapping={userMap ?? undefined}
              mappingName={mappingLabel}
            />
          ) : (
            // adherence view
            <AdherencePanel
              studyId={studyId}
              userIds={effectiveUserIds.length ? effectiveUserIds : undefined}
              moduleIds={moduleIds.length ? moduleIds : undefined}
              from={from ? from.slice(0, 10) : undefined}
              to={to ? to.slice(0, 10) : undefined}
              mapping={userMap ?? undefined}
              mappingName={mappingLabel}
            />
          )}

          {activeView === "table" && (
            <div className={styles.pager}>
              <button
                className={styles.btn}
                onClick={() => {
                  if (page > 1) {
                    const next = page - 1;
                    setPage(next);
                    load(next);
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
                  const next = page + 1;
                  setPage(next);
                  load(next);
                }}
                disabled={loading || rows.length < TABLE_PAGE_SIZE}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
    </div>
  );
}