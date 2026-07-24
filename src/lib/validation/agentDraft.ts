import type { z } from "zod";

import { agentDraftSchema } from "../../contracts";

/**
 * Frontend mirror of the backend logical-name rule (validation.rs): 2–64
 * characters, lowercase-letter start, lowercase/digit/hyphen/underscore
 * body, and no consecutive or trailing separators.
 */
const logicalNamePattern = /^[a-z][a-z0-9_-]{1,63}$/;

export const editableAgentDraftSchema = agentDraftSchema.superRefine(
  (draft, context) => {
    const logicalName = draft.logicalName.trim();
    if (
      !logicalNamePattern.test(logicalName) ||
      /[-_]$/.test(logicalName) ||
      /[-_]{2}/.test(logicalName)
    ) {
      context.addIssue({
        code: "custom",
        path: ["logicalName"],
        message:
          "名称必须为 2–64 个小写字母、数字、连字符或下划线，以字母开头，分隔符不能连续或收尾。",
      });
    }
    if (draft.description.trim().length === 0) {
      context.addIssue({
        code: "custom",
        path: ["description"],
        message: "请填写用于自动委派判断的描述。",
      });
    }
    if (draft.developerInstructions.trim().length === 0) {
      context.addIssue({
        code: "custom",
        path: ["developerInstructions"],
        message: "请填写这个 subagent 需要遵循的指令。",
      });
    }
  },
);

export type EditableAgentDraft = z.infer<typeof editableAgentDraftSchema>;
