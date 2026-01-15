"use client";
import { InferredStudyQuestion } from "@/lib/types";

export function RoleSelect(props: {
  title: string;
  value: string;
  setValue: (v: string) => void;
  groups: Array<{ module_id: string; module_name: string; items: InferredStudyQuestion[] }>;
  filter: (q: InferredStudyQuestion) => boolean;
  placeholder: string;
  optional?: boolean;
  className?: string;
}) {
  const { title, value, setValue, groups, filter, placeholder, optional, className } = props;
  return (
    <div className={className ?? "field"}>
      <label>{title}</label>
      <select
        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">{optional ? "— None —" : placeholder}</option>
        {groups.map((g) => (
          <optgroup key={g.module_id} label={g.module_name || g.module_id}>
            {g.items.filter(filter).map((q) => {
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
    </div>
  );
}