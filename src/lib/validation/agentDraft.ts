import type { z } from "zod";

import { agentDraftSchema } from "../../contracts";

const logicalNamePattern = /^[a-z][a-z0-9-]{1,63}$/;

export const editableAgentDraftSchema = agentDraftSchema.superRefine(
  (draft, context) => {
    if (
      !logicalNamePattern.test(draft.logicalName) ||
      draft.logicalName.endsWith("-") ||
      draft.logicalName.includes("--")
    ) {
      context.addIssue({
        code: "custom",
        path: ["logicalName"],
        message: "名称必须为 2–64 个小写字母、数字或单连字符，并以字母开头。",
      });
    }
    const requiredText: readonly [readonly (string | number)[], string][] =
      [
        [["description"], draft.description],
        [["shared", "roleGoal"], draft.shared.roleGoal],
        [["shared", "outputContract"], draft.shared.outputContract],
        [["shared", "failureHandling"], draft.shared.failureHandling],
        [
          ["usage", "autoDelegationGuidance"],
          draft.usage.autoDelegationGuidance,
        ],
        [["usage", "verificationTask"], draft.usage.verificationTask],
      ];
    for (const [path, value] of requiredText) {
      if (value.trim().length === 0) {
        context.addIssue({
          code: "custom",
          path: [...path],
          message: "此项不能为空。",
        });
      }
    }
    const requiredLists: readonly [readonly (string | number)[], string[]][] = [
      [["shared", "whenToUse"], draft.shared.whenToUse],
      [["shared", "whenNotToUse"], draft.shared.whenNotToUse],
      [["shared", "inputRequirements"], draft.shared.inputRequirements],
      [["shared", "executionSteps"], draft.shared.executionSteps],
      [["shared", "constraints"], draft.shared.constraints],
      [["shared", "stopConditions"], draft.shared.stopConditions],
    ];
    for (const [path, values] of requiredLists) {
      if (
        values.length === 0 || values.some((value) => value.trim().length === 0)
      ) {
        context.addIssue({
          code: "custom",
          path: [...path],
          message: "至少需要一个非空条目。",
        });
      }
    }
  },
);

export type EditableAgentDraft = z.infer<typeof editableAgentDraftSchema>;
