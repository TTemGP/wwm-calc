import { describe, expect, it } from "vitest"

import { migrateRotation } from "../src/application/rotationCatalog"
import { buildRotationTimeline, type TimelineBuildInput } from "../src/calculations/rotationTimeline"
import { moveEventToAttachmentTarget } from "../src/rotationEditing"
import { mergeImportedRotationEntries } from "../src/rotationTransfer"

function input(steps: TimelineBuildInput["rotation"]["steps"]): TimelineBuildInput {
  return {
    rotation: { name: "Fixed event probe", eventTimeReference: "battleStart", start: { step: 1 }, steps },
    skills: {
      Probe: {
        name: "Probe",
        castTime: 3,
        action: [
          { type: "damage", time: 0, phyCoef: 1 },
          { type: "damage", time: 2, phyCoef: 1 },
        ],
      },
    },
    eventDefinitions: { Qi: { name: "Qi", castTime: 0, action: [{ type: "setQi", time: 0 }], tags: ["Event"] } },
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  }
}

describe("fixed-time rotation events", () => {
  it("uses an explicit time instead of also expanding the retained attachment", () => {
    const timeline = buildRotationTimeline(
      input([
        { type: "event", event: "Qi", before: { action: 0 }, startTime: 3, targetQiRatio: 0 },
        { type: "skill", skill: "Probe" },
      ]),
    )
    const event = timeline.find(row => row.step.type === "event" && row.step.event === "Qi")
    const skill = timeline.find(row => row.step.type === "skill")
    expect(event?.startTime).toBe(3)
    expect(event?.sourceRowId).toBeUndefined()
    expect(skill?.actionStates[0].targetQiRatio).toBe(1)
  })

  it("keeps battle-relative fixed events in authored-time order", () => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Ordered fixed events",
        eventTimeReference: "battleStart",
        start: { step: 2 },
        steps: [
          { type: "event", event: "Move", startTime: 3, distance: 3 },
          { type: "event", event: "Move", startTime: 1, distance: 1 },
          { type: "skill", skill: "Probe" },
          { type: "event", event: "BattleEnd", startTime: 5 },
        ],
      },
      skills: { Probe: { name: "Probe", castTime: 0, action: [{ type: "damage", time: 0, phyCoef: 1 }] } },
      eventDefinitions: { Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }] } },
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })
    const first = timeline.find(row => row.rotationIndex === 0)!
    const second = timeline.find(row => row.rotationIndex === 1)!
    expect(first.startTime).toBe(3)
    expect(second.startTime).toBe(1)
    expect(second.actionStates[0].distance).toBe(1)
  })

  it("reattaches to the selected action when a fixed event is moved", () => {
    const moved = moveEventToAttachmentTarget(
      [
        { type: "event", event: "Qi", before: { action: 1 }, startTime: 3, targetQiRatio: 0 },
        { type: "skill", skill: "Probe" },
      ],
      0,
      { sourceRowId: "rotation-1", sourceStepIndex: 1, target: { action: 0 }, time: 0, order: 1000 },
      "before",
    )
    expect(moved?.steps[0]).toMatchObject({ event: "Qi", before: { action: 0 }, targetQiRatio: 0 })
    expect(moved?.steps[0]).not.toHaveProperty("startTime")
    const timeline = buildRotationTimeline(input(moved!.steps))
    const event = timeline.find(row => row.step.type === "event" && row.step.event === "Qi")
    expect(event?.sourceRowId).toBe("rotation-1")
    expect(event?.startTime).toBe(0)
  })

  it("preserves the fixed-time mode through migration and import", () => {
    const fixed = {
      type: "event" as const,
      event: "Qi" as const,
      before: { action: 0 },
      startTime: 2.5,
      targetQiRatio: 0.25,
    }
    const rotation = migrateRotation({
      name: "Fixed Qi",
      eventTimeReference: "battleStart",
      steps: [fixed, { type: "skill", skill: "Probe" }],
    })
    expect(rotation.steps[0]).toMatchObject({ before: { action: 0 }, startTime: 2.5, targetQiRatio: 0.25 })

    const imported = mergeImportedRotationEntries([], {
      format: "where-builds-meet-rotations",
      version: 9,
      rotations: [{ id: "fixed", rotation }],
    }).entries[0].rotation
    expect(imported.steps[0]).toMatchObject({ before: { action: 0 }, startTime: 2.5, targetQiRatio: 0.25 })

    const legacyCompatible = migrateRotation({
      name: "Fixed Take Damage",
      eventTimeReference: "battleStart",
      steps: [
        { type: "event", event: "TakeDamage", before: { action: 0 }, startTime: 1.5, damage: 20 },
        { type: "skill", skill: "Probe" },
      ],
    })
    expect(legacyCompatible.steps[0]).toMatchObject({ before: { action: 0 }, startTime: 1.5, damage: 20 })

    const shield = mergeImportedRotationEntries([], {
      format: "where-builds-meet-rotations",
      version: 9,
      rotations: [
        { id: "shield", rotation: { name: "Shield", steps: [{ type: "event", event: "ShieldBroken", startTime: 4 }] } },
      ],
    }).entries[0].rotation
    expect(shield.steps[0]).toMatchObject({ event: "ShieldBroken", startTime: 4 })
  })

  it("keeps legacy Exhausted before-attachments post-action", () => {
    const base = input([
      { type: "event", event: "Exhausted", before: { action: 1 } },
      { type: "skill", skill: "Probe" },
    ])
    const timeline = buildRotationTimeline({
      ...base,
      eventDefinitions: {
        ...base.eventDefinitions,
        Exhausted: {
          name: "Exhausted",
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }],
        },
      },
      effectDefinitions: { Exhausted: { duration: 5, maxStack: 1 } },
    })
    const event = timeline.find(row => row.step.type === "event" && row.step.event === "Exhausted")
    expect(event?.startTime).toBe(2)
    expect(event?.sourceRowId).toBe("rotation-1")
  })

  it("round-trips a reattached Take Damage event in modern rotations", () => {
    const modern = migrateRotation({
      name: "Attached Take Damage",
      eventTimeReference: "battleStart",
      start: { step: 1 },
      steps: [
        { type: "event", event: "TakeDamage", before: { action: "start" }, damage: 20 },
        { type: "skill", skill: "Probe" },
      ],
    })
    expect(modern.steps[0]).toMatchObject({ before: { action: "start" }, damage: 20 })
    expect(modern.steps[0]).not.toHaveProperty("startTime")

    const legacy = migrateRotation({
      name: "Legacy Take Damage",
      start: { step: 1 },
      steps: [
        { type: "event", event: "TakeDamage", before: { action: "start" }, damage: 20 },
        { type: "skill", skill: "Probe" },
      ],
    })
    expect(legacy.steps[0]).toMatchObject({ startTime: 0, damage: 20 })
    expect(legacy.steps[0]).not.toHaveProperty("before")
  })

  it("keeps anchored fixed events while migrating a separate legacy event", () => {
    const migrated = migrateRotation({
      name: "Mixed legacy events",
      eventTimeReference: "battleStart",
      steps: [
        { type: "event", event: "Move", before: { action: "start" }, startTime: 4, distance: 1 },
        { type: "event", event: "Move", startTime: 1, distance: 2 },
        { type: "skill", skill: "Probe" },
      ],
    })
    expect(migrated.steps[0]).toMatchObject({ before: { action: "start" }, startTime: 4, distance: 1 })
  })

  it("moves a start away from a removed legacy event and away from fixed rows", () => {
    const removedStart = migrateRotation({
      name: "Removed legacy start",
      eventTimeReference: "battleStart",
      start: { step: 1 },
      steps: [
        { type: "skill", skill: "SnowpartingQStab" },
        { type: "event", event: "Move", startTime: 0, distance: 1 },
        { type: "skill", skill: "SnowpartingQStab" },
      ],
    })
    expect(removedStart.start).toBeDefined()
    expect(removedStart.steps[removedStart.start!.step]?.type).toBe("skill")

    const fixedStart = migrateRotation({
      name: "Fixed start",
      eventTimeReference: "battleStart",
      start: { step: 0 },
      steps: [
        { type: "event", event: "Qi", startTime: 2, targetQiRatio: 0 },
        { type: "skill", skill: "Probe" },
      ],
    })
    expect(fixedStart.start?.step).toBe(1)

    const directTimeline = buildRotationTimeline({
      ...input([
        { type: "event", event: "Qi", startTime: 3, targetQiRatio: 0 },
        { type: "skill", skill: "Probe" },
      ]),
      rotation: {
        name: "Direct fixed start",
        eventTimeReference: "battleStart",
        start: { step: 0 },
        steps: [
          { type: "event", event: "Qi", startTime: 3, targetQiRatio: 0 },
          { type: "skill", skill: "Probe" },
        ],
      },
    })
    expect(directTimeline.find(row => row.step.type === "skill")?.startTime).toBe(0)
    expect(directTimeline.find(row => row.step.type === "event")?.startTime).toBe(3)
  })
})
