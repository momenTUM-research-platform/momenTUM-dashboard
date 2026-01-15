"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Option = { value: string; label: string };

type Props = {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
};

export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  className = "",
  searchable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const s = q.toLowerCase();
    return options.filter(
      o => o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s)
    );
  }, [options, q]);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map(o => [o.value, o.label]));
    return value.map(v => map.get(v) ?? v);
  }, [options, value]);

  const toggle = (v: string) => {
    const set = new Set(value);
    set.has(v) ? set.delete(v) : set.add(v);
    onChange(Array.from(set));
  };

  const selectFiltered = () =>
    onChange(Array.from(new Set([...value, ...filtered.map(o => o.value)])));

  const clearAll = () => onChange([]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border rounded px-3 py-2 bg-white disabled:opacity-50"
      >
        <span className="truncate text-left">
          {value.length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : value.length <= 3 ? (
            selectedLabels.join(", ")
          ) : (
            `${value.length} selected`
          )}
        </span>
        <svg width="16" height="16" viewBox="0 0 20 20" className="opacity-70">
          <path d="M5 7l5 6 5-6H5z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow">
          {searchable && (
            <div className="p-2 border-b">
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search…"
                className="w-full border rounded px-2 py-1"
              />
            </div>
          )}

          <div className="max-h-64 overflow-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-sm text-gray-500">No matches</div>
            ) : (
              filtered.map(o => {
                const checked = value.includes(o.value);
                return (
                  <label
                    key={o.value}
                    className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.value)}
                      className="accent-gray-700"
                    />
                    <span className="text-sm truncate">{o.label}</span>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2 p-2 border-t">
            <button
              type="button"
              onClick={selectFiltered}
              className="text-sm px-2 py-1 border rounded"
            >
              Select filtered
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-sm px-2 py-1 border rounded"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}