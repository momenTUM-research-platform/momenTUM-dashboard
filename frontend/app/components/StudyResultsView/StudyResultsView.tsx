"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import styles from "./StudyResultsView.module.css";
import TableView, { StudyData, GroupedResponses, GroupedByModule, UserGroupedResponses } from "../TableView/TableView";

const CalendarView = dynamic(() => import("../CalendarView/CalendarView"), {
  ssr: false,
  loading: () => <p>Loading calendar...</p>,
});

// Updated helper: Now takes UserGroupedResponses.
const getStudyIdForUser = (modules: UserGroupedResponses): string => {
  return modules.extracted_study_id || "Unknown";
};

function filterStudyData(
  data: StudyData,
  selectedStudy: string,
  selectedModule: string,
  selectedSection: string
): StudyData {
  const filteredResponses: GroupedResponses = {};
  for (const [userId, modules] of Object.entries(data.grouped_responses)) {
    const userStudyId = getStudyIdForUser(modules);
    if (selectedStudy && userStudyId !== selectedStudy) continue;
    const filteredModules: UserGroupedResponses = {};
    for (const [moduleId, moduleData] of Object.entries(modules)) {
      // Skip the extracted_study_id field
      if (moduleId === "extracted_study_id") continue;
      // Ensure moduleData is an object
      if (moduleData && typeof moduleData === "object") {
        const moduleName =
          "raw_responses" in moduleData
            ? moduleData.module_name
            : (moduleData as GroupedByModule).module_name;
        if (selectedModule && moduleName !== selectedModule) continue;
        if ("raw_responses" in moduleData) {
          filteredModules[moduleId] = moduleData;
        } else {
          const modData = moduleData as GroupedByModule;
          const filteredSections: { [key: string]: any } = {};
          for (const [secKey, section] of Object.entries(modData.sections)) {
            if (selectedSection && section.section_name !== selectedSection) continue;
            filteredSections[secKey] = section;
          }
          if (Object.keys(filteredSections).length > 0) {
            filteredModules[moduleId] = { ...modData, sections: filteredSections };
          }
        }
      }
    }
    if (Object.keys(filteredModules).length > 0) {
      filteredResponses[userId] = { ...filteredModules, extracted_study_id: userStudyId };
    }
  }
  return { study_id: data.study_id, grouped_responses: filteredResponses };
}

interface StudyResultsViewProps {
  data: StudyData;
}

const StudyResultsView: React.FC<StudyResultsViewProps> = ({ data }) => {
  const [view, setView] = useState<"table" | "calendar" | "json">("table");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;
  const [selectedStudyFilter, setSelectedStudyFilter] = useState("");
  const [selectedModuleFilter, setSelectedModuleFilter] = useState("");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState("");

  // Compute distinct Study IDs using the helper.
  const distinctStudyIds = useMemo(() => {
    if (!data) return [];
    const ids = new Set<string>();
    Object.values(data.grouped_responses).forEach((modules) => {
      ids.add(getStudyIdForUser(modules));
    });
    return Array.from(ids).sort();
  }, [data]);

  // Compute distinct Modules; skip if moduleData is not an object.
  const distinctModules = useMemo(() => {
    if (!data) return [];
    const modulesSet = new Set<string>();
    Object.values(data.grouped_responses).forEach((modules) => {
      Object.values(modules).forEach((moduleData) => {
        if (moduleData && typeof moduleData === "object") {
          const name =
            "raw_responses" in moduleData
              ? moduleData.module_name
              : (moduleData as GroupedByModule).module_name;
          modulesSet.add(name);
        }
      });
    });
    return Array.from(modulesSet).sort();
  }, [data]);

  // Compute distinct Sections; skip values that are not objects.
  const distinctSections = useMemo(() => {
    if (!data) return [];
    const sectionsSet = new Set<string>();
    Object.values(data.grouped_responses).forEach((modules) => {
      Object.values(modules).forEach((moduleData) => {
        if (moduleData && typeof moduleData === "object" && !("raw_responses" in moduleData)) {
          const modData = moduleData as GroupedByModule;
          Object.values(modData.sections).forEach((section) => {
            sectionsSet.add(section.section_name);
          });
        }
      });
    });
    return Array.from(sectionsSet).sort();
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data) return null;
    return filterStudyData(data, selectedStudyFilter, selectedModuleFilter, selectedSectionFilter);
  }, [data, selectedStudyFilter, selectedModuleFilter, selectedSectionFilter]);

  const getPaginatedData = (): StudyData | null => {
    if (!filteredData) return null;
    const allUserIds = Object.keys(filteredData.grouped_responses);
    const totalUsers = allUserIds.length;
    const totalPages = Math.ceil(totalUsers / pageSize);
    const current = Math.min(currentPage, totalPages) || 1;
    const paginatedUserIds = allUserIds.slice((current - 1) * pageSize, current * pageSize);
    const paginatedGroupedResponses: GroupedResponses = {};
    paginatedUserIds.forEach((userId) => {
      paginatedGroupedResponses[userId] = filteredData.grouped_responses[userId];
    });
    return { study_id: filteredData.study_id, grouped_responses: paginatedGroupedResponses };
  };

  const paginatedData = getPaginatedData();
  const totalUsersCount = filteredData ? Object.keys(filteredData.grouped_responses).length : 0;
  const totalPages = Math.ceil(totalUsersCount / pageSize);

  return (
    <div className={styles.resultsContainer}>
      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label htmlFor="studyFilter">Study ID</label>
          <select
            id="studyFilter"
            value={selectedStudyFilter}
            onChange={(e) => setSelectedStudyFilter(e.target.value)}
            className={styles.dropdown}
          >
            <option value="">All</option>
            {distinctStudyIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="moduleFilter">Module</label>
          <select
            id="moduleFilter"
            value={selectedModuleFilter}
            onChange={(e) => setSelectedModuleFilter(e.target.value)}
            className={styles.dropdown}
          >
            <option value="">All</option>
            {distinctModules.map((mod) => (
              <option key={mod} value={mod}>
                {mod}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="sectionFilter">Section</label>
          <select
            id="sectionFilter"
            value={selectedSectionFilter}
            onChange={(e) => setSelectedSectionFilter(e.target.value)}
            className={styles.dropdown}
          >
            <option value="">All</option>
            {distinctSections.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* View Switcher */}
      <div className={styles.viewSwitcher}>
        {["table", "calendar", "json"].map((v) => (
          <button
            key={v}
            className={`${styles.viewButton} ${view === v ? styles.active : ""}`}
            onClick={() => setView(v as any)}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)} View
          </button>
        ))}
      </div>

      {/* Total Users Display */}
      <div className={styles.totalUsers}>
        <p>
          Total Users: {totalUsersCount} {totalUsersCount > 0 && `(Page ${currentPage} of ${totalPages})`}
        </p>
      </div>

      {/* Pagination */}
      <div className={styles.pagination}>
        <button
          className={styles.paginationButton}
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
        >
          Previous Page
        </button>
        <button
          className={styles.paginationButton}
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages || totalPages === 0}
        >
          Next Page
        </button>
      </div>

      {/* Results */}
      {view === "table" && paginatedData && <TableView data={paginatedData} />}
      {view === "calendar" && paginatedData && <CalendarView data={paginatedData} />}
      {view === "json" && (
        <pre className={styles.jsonBlock}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default StudyResultsView;