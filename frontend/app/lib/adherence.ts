// frontend/app/lib/adherence.ts

export type OccurrenceOut = {
  module_id: string;
  module_name: string;
  date: string;
  start: string; // ISO with tz
  end: string; // ISO with tz
};

export type ModuleMeta = {
  module_id: string;
  module_name: string;
  repeat: string; // "daily" | "never" | ""
  sticky: boolean;
};

export type StructureCountOut = {
  study_days: number;
  per_module: Record<string, number>;
  per_module_meta: Record<string, ModuleMeta>;
  total: number;
};

export function safeTZ(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const BASE = "/api/v2/adherence";

function getTokenFromStorage(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const t = window.localStorage.getItem("token") ?? undefined;
  return t && t.trim().length > 0 ? t : undefined;
}

function authHeader(token?: string): Record<string, string> {
  const t = token ?? getTokenFromStorage();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function fetchAdherenceExpected(params: {
  studyId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  tz: string;
  userId?: string;
  token?: string;
}): Promise<OccurrenceOut[]> {
  const qs = new URLSearchParams({
    study_id: params.studyId,
    from: params.from,
    to: params.to,
    tz: params.tz,
  });
  if (params.userId) qs.set("user_id", params.userId);

  const res = await fetch(`${BASE}/expected?${qs.toString()}`, {
    headers: {
      Accept: "application/json",
      ...authHeader(params.token),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`expected: ${res.status} ${res.statusText} ${text}`);
  }

  return res.json();
}

export async function fetchAdherenceStructureCount(
  studyId: string,
  opts?: { token?: string }
): Promise<StructureCountOut> {
  const qs = new URLSearchParams({ study_id: studyId });

  const res = await fetch(`${BASE}/structure-count?${qs.toString()}`, {
    headers: {
      Accept: "application/json",
      ...authHeader(opts?.token),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`structure-count: ${res.status} ${res.statusText} ${text}`);
  }

  return res.json();
}