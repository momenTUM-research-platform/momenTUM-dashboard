export const isTime = (q: { type?: string; subtype?: string | null }) =>
    q.type === "datetime" && q.subtype === "time";
  
  export const isDate = (q: { type?: string; subtype?: string | null }) =>
    q.type === "datetime" && q.subtype === "date";
  
  export const isSchemaNumeric = (q: { type?: string; subtype?: string | null }) =>
    (q.type === "text" && q.subtype === "numeric") || q.type === "number";
  
  export const isSelectableNumeric = (q: {
    is_numeric?: boolean;
    type?: string;
    option_map?: Record<string, number>;
    subtype?: string | null;
  }) => Boolean(q.is_numeric) || isSchemaNumeric(q) || (q.type === "multi" && q.option_map && Object.keys(q.option_map).length > 0);
  
  export const toDate = (v: unknown) => {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(+d) ? null : d;
  };
  
  export const toNumberLoose = (v: unknown) => {
    if (v == null) return null;
    const s = String(v).trim().replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  
  export const toInt = (v: unknown) => {
    const n = toNumberLoose(v);
    return n == null ? null : Math.round(n);
  };
  
  export const median = (arr: number[]) => {
    if (!arr.length) return null;
    const a = [...arr].sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
  };
  
  export const hashColor = (key: string) => {
    const palette = ["#0ea5e9","#22c55e","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4"];
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h << 5) - h + key.charCodeAt(i);
    return palette[Math.abs(h) % palette.length];
  };