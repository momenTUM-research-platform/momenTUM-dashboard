"use client";

import {
  useMemo,
} from "react";

import type {
  InferredStudyQuestion,
} from "../../lib/types";

import styles from "./SleepVizPanel.module.css";

type Props = {
  label: string;
  description?: string;
  questions: InferredStudyQuestion[];
  value: string;
  onChange: (
    value: string,
  ) => void;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
};

type QuestionGroup = {
  module_id: string;
  module_name: string;
  items: InferredStudyQuestion[];
};

function questionValue(
  question: InferredStudyQuestion,
): string {
  return `${question.module_id}:${question.question_id}`;
}

export default function RoleSelect({
  label,
  description,
  questions,
  value,
  onChange,
  required = false,
  optional = false,
  placeholder = "Select a question",
}: Props) {
  const groups =
    useMemo<QuestionGroup[]>(() => {
      const grouped =
        new Map<
          string,
          QuestionGroup
        >();

      for (
        const question
        of questions ?? []
      ) {
        const existing =
          grouped.get(
            question.module_id,
          );

        if (existing) {
          existing.items.push(
            question,
          );

          continue;
        }

        grouped.set(
          question.module_id,
          {
            module_id:
              question.module_id,

            module_name:
              question.module_name ||
              question.module_id,

            items: [
              question,
            ],
          },
        );
      }

      return Array.from(
        grouped.values(),
      );
    }, [
      questions,
    ]);

  return (
    <div
      className={
        styles.roleField
      }
    >
      <label
        className={
          styles.roleLabel
        }
      >
        <span>
          {label}

          {required && (
            <span
              aria-hidden="true"
            >
              {" *"}
            </span>
          )}
        </span>

        {description && (
          <span
            className={
              styles.roleDescription
            }
          >
            {description}
          </span>
        )}

        <select
          className={
            styles.select
          }
          value={value}
          onChange={(
            event,
          ) =>
            onChange(
              event.target.value,
            )
          }
          required={
            required
          }
        >
          <option value="">
            {optional
              ? "— None —"
              : placeholder}
          </option>

          {groups.map(
            (group) => (
              <optgroup
                key={
                  group.module_id
                }
                label={
                  group.module_name
                }
              >
                {group.items.map(
                  (question) => (
                    <option
                      key={
                        questionValue(
                          question,
                        )
                      }
                      value={
                        questionValue(
                          question,
                        )
                      }
                    >
                      {question.question_text ||
                        question.question_id}
                    </option>
                  ),
                )}
              </optgroup>
            ),
          )}
        </select>
      </label>

      {questions.length ===
        0 && (
        <div
          className={
            styles.roleEmpty
          }
        >
          No compatible questions
          available.
        </div>
      )}
    </div>
  );
}