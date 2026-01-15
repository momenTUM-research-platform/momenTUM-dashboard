import { LabeledSurveyResponseOut } from "@/app/types/schemas";

/* ---------------------------------- */
/* Config                             */
/* ---------------------------------- */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/* ---------------------------------- */
/* Types                              */
/* ---------------------------------- */
export type StudyQuestion = {
  module_id: string;
  module_name: string;
  question_id: string;
  question_text: string;
  type?: string | null;
  subtype?: string | null;
};

export type MappingMode = "latest" | "earliest";

/** Key: user_id, Value: mapped label (e.g., participant ID) */
export type UserMapping = Record<string, string>;

type FetchOptions = {
  token?: string;
  user_id?: string[];
  module_id?: string[];
  from?: string;
  to?: string;
  match?: Array<[string, string]>;
  contains?: Array<[string, string]>;
  sort?: "asc" | "desc";
  skip?: number;
  limit?: number;
};

/* ---------------------------------- */
/* Helpers                            */
/* ---------------------------------- */
function buildQuery(opts: FetchOptions = {}) {
  const p = new URLSearchParams();
  opts.user_id?.forEach((v) => p.append("user_id", v));
  opts.module_id?.forEach((v) => p.append("module_id", v));
  if (opts.from) p.append("from", opts.from);
  if (opts.to) p.append("to", opts.to);
  opts.match?.forEach(([k, v]) => p.append("match", `${k}:${v}`));
  opts.contains?.forEach(([k, v]) => p.append("contains", `${k}:${v}`));
  p.append("sort", opts.sort ?? "desc");
  p.append("skip", String(opts.skip ?? 0));
  p.append("limit", String(opts.limit ?? 200));
  return p.toString();
}

function getTokenFromStorage(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const t = window.localStorage.getItem("token") ?? undefined;
  return t && t.trim().length > 0 ? t : undefined;
}

function authHeader(token?: string): Record<string, string> {
  const t = token ?? getTokenFromStorage();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ---------------------------------- */
/* Questions (for selectable mapping) */
/* ---------------------------------- */
export async function fetchStudyQuestions(
  studyId: string,
  opts?: { token?: string }
): Promise<StudyQuestion[]> {
  const url = `${API_BASE}/api/studies/${encodeURIComponent(studyId)}/questions`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...authHeader(opts?.token),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch questions failed: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/* ---------------------------------- */
/* Labeled responses + facets         */
/* ---------------------------------- */
export async function fetchLabeledResponses(
  studyId: string,
  opts: FetchOptions = {}
): Promise<LabeledSurveyResponseOut[]> {
  const qs = buildQuery(opts);
  const url = `${API_BASE}/api/studies/${encodeURIComponent(studyId)}/responses:labeled?${qs}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...authHeader(opts.token),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

export type Facets = {
  users: string[];
  modules: { id: string; name: string }[];
};

export async function fetchFacets(
  studyId: string,
  opts: Pick<FetchOptions, "token" | "user_id" | "module_id" | "from" | "to"> = {}
): Promise<Facets> {
  const p = new URLSearchParams();
  opts.user_id?.forEach((v) => p.append("user_id", v));
  opts.module_id?.forEach((v) => p.append("module_id", v));
  if (opts.from) p.append("from", opts.from);
  if (opts.to) p.append("to", opts.to);

  const url = `${API_BASE}/api/studies/${encodeURIComponent(studyId)}/responses:facets?${p.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...authHeader(opts.token),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Facets failed: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/* ---------------------------------- */
/* User mapping                        */
/* ---------------------------------- */
export async function fetchUserMapping(
  studyId: string,
  args: {
    module_id: string;
    question_id: string;
    mode?: MappingMode;
    token?: string;
  }
): Promise<UserMapping> {
  const p = new URLSearchParams();
  p.set("module_id", args.module_id);
  p.set("question_id", args.question_id);
  p.set("mode", args.mode ?? "latest");

  const url = `${API_BASE}/api/studies/${encodeURIComponent(studyId)}/user-mapping?${p.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...authHeader(args.token),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch mapping failed: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

export function withMappedLabel(
  rows: LabeledSurveyResponseOut[],
  mapping: UserMapping,
  fieldName: "mapped_label" | string = "mapped_label"
): Array<LabeledSurveyResponseOut & { [k: string]: string | undefined }> {
  return rows.map((r) => ({
    ...r,
    [fieldName]: mapping[r.user_id],
  }));
}