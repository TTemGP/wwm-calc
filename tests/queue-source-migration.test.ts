import { expect, it } from "vitest"

import { deserializeSkillOverrides, serializeSkillOverrides } from "../src/skillOverrides"

it("preserves the queue source binding in saved skill overrides and subsequent saves", () => {
  const migrated = deserializeSkillOverrides({
    version: 3,
    overrides: {
      Everspring: {
        ScarletSpinStage1: {
          action: [
            {
              type: "trigger",
              value: "ScarletSpinStage2",
              time: 1,
              queueTime: 0.5,
              sourceEffect: "OtherEffect",
              queueSourceEffect: "FlowerBurial",
            },
          ],
        },
      },
    },
  })
  expect(migrated.Everspring?.ScarletSpinStage1.action).toEqual([
    { type: "trigger", value: "ScarletSpinStage2", time: 1, queueTime: 0.5, sourceEffect: "FlowerBurial" },
  ])
  expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(migrated)))).toEqual(migrated)
})
