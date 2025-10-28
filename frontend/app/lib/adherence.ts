export type OccurrenceOut = {
    module_id: string;
    module_name: string;
    date: string;
    start: string; // ISO with tz
    end: string;   // ISO with tz
  };
  
  export type StructureCountOut = {
    study_days: number;
    per_module: Record<string, number>;
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
  
  export async function fetchAdherenceExpected(params: {
    studyId: string;
    from: string; // YYYY-MM-DD
    to: string;   // YYYY-MM-DD
    tz: string;
    userId?: string; // <-- was uid; make it string
  }): Promise<OccurrenceOut[]> {
    const qs = new URLSearchParams({
      study_id: params.studyId,
      from: params.from,
      to: params.to,
      tz: params.tz,
    });
    if (params.userId) qs.set("user_id", params.userId);
    const res = await fetch(`${BASE}/expected?${qs.toString()}`);
    if (!res.ok) throw new Error(`expected: ${res.status}`);
    return res.json();
  }
  
  export async function fetchAdherenceStructureCount(studyId: string): Promise<StructureCountOut> {
    const qs = new URLSearchParams({ study_id: studyId });
    const res = await fetch(`${BASE}/structure-count?${qs.toString()}`);
    if (!res.ok) throw new Error(`structure-count: ${res.status}`);
    return res.json();
  }