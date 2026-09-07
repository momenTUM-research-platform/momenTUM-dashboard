import {
    StudyQuestion,
  } from "@/app/lib/responses";
  
  function normalizeCode(
    value: unknown,
  ): string {
    return String(
      value,
    ).trim();
  }
  
  function splitOptionValues(
    value: unknown,
  ): unknown[] {
    if (
      Array.isArray(
        value,
      )
    ) {
      return value;
    }
  
    if (
      typeof value ===
        "string" &&
      value.includes(";")
    ) {
      return value
        .split(";")
        .map(
          (part) =>
            part.trim(),
        )
        .filter(
          (part) =>
            part.length > 0,
        );
    }
  
    return [value];
  }
  
  function formatOption(
    value: unknown,
    question: StudyQuestion,
  ): string {
    const code =
      normalizeCode(
        value,
      );
  
    const label =
      question
        .option_labels?.[
          code
        ];
  
    if (
      !label ||
      label.trim() === ""
    ) {
      return code;
    }
  
    return `${code} — ${label}`;
  }
  
  export function formatAnswerForDisplay(
    value: unknown,
    question?:
      StudyQuestion,
  ): unknown {
    if (
      value === null ||
      value === undefined
    ) {
      return value;
    }
  
    /*
     * Decode categorical values only when the study
     * schema explicitly supplies the code-to-label map.
     * Numeric-looking free responses therefore remain
     * untouched.
     */
    if (
      question
        ?.option_labels &&
      Object.keys(
        question.option_labels,
      ).length > 0
    ) {
      const values =
        splitOptionValues(
          value,
        );
  
      const formatted =
        values.map(
          (item) =>
            formatOption(
              item,
              question,
            ),
        );
  
      return formatted.length ===
        1
        ? formatted[0]
        : formatted;
    }
  
    if (
      typeof value ===
        "boolean"
    ) {
      if (
        value &&
        question?.yes_text
      ) {
        return question.yes_text;
      }
  
      if (
        !value &&
        question?.no_text
      ) {
        return question.no_text;
      }
    }
  
    return value;
  }
  
  export function findStudyQuestion(
    questions:
      | StudyQuestion[]
      | null
      | undefined,
    moduleId:
      | string
      | null
      | undefined,
    questionId:
      | string
      | null
      | undefined,
  ):
    | StudyQuestion
    | undefined {
    if (
      !questions ||
      !moduleId ||
      !questionId
    ) {
      return undefined;
    }
  
    return questions.find(
      (question) =>
        question.module_id ===
          moduleId &&
        question.question_id ===
          questionId,
    );
  }