import type { RotationRecord, RotationStep, TimelineBuildInput, TimelineRow } from "./calculations/rotationTimeline"

export type EditorRevision = { id: string; context: string; rotation: RotationRecord }
export function sameEditorRevision(left: EditorRevision, right: EditorRevision) {
  return left.id === right.id && left.context === right.context && left.rotation === right.rotation
}

/** Unreached authored steps remain editable, without expanding their combat actions. */
export function withUnresolvedEditorSteps(
  input: Pick<TimelineBuildInput, "rotation" | "skills" | "eventDefinitions">,
  timeline: TimelineRow[],
) {
  const resolved = new Set(
    timeline.filter(row => row.kind === "rotation" && row.rotationIndex !== undefined).map(row => row.rotationIndex),
  )
  if (resolved.size === input.rotation.steps.length) return timeline
  const placeholders = pendingEditorTimeline(input).filter(row => !resolved.has(row.rotationIndex))
  return [
    ...timeline,
    ...placeholders.map(row =>
      Object.assign({}, row, {
        pendingCalculation: false,
        skipped: true,
        startTime: timeline[0]?.timelineEndTime ?? 0,
      }),
    ),
  ]
}

/** Keep the completed display intact while mapping its controls to the latest draft. */
export function pendingEditorTimeline(
  input: Pick<TimelineBuildInput, "rotation" | "skills" | "eventDefinitions">,
  previous?: { rotation: RotationRecord; timeline: TimelineRow[] },
  replacements?: WeakMap<RotationStep, RotationStep>,
): TimelineRow[] {
  if (previous) {
    const indexes = new Map(input.rotation.steps.map((step, index) => [step, index]))
    return withUnresolvedEditorSteps({ ...input, rotation: previous.rotation }, previous.timeline).map(row => {
      if (row.rotationIndex === undefined) return row
      let step = previous.rotation.steps[row.rotationIndex]
      while (replacements?.has(step)) step = replacements.get(step)!
      return Object.assign({}, row, { rotationIndex: indexes.get(step) })
    })
  }
  const rows = input.rotation.steps.map((step, index): TimelineRow => {
    const id = `rotation-${index}`

    const skill = step.type === "skill" ? input.skills[step.skill ?? ""] : input.eventDefinitions[step.event]
    return {
      id,
      kind: "rotation",
      rotationIndex: index,
      order: index * 1000,
      step,
      skill,
      startTime: 0,
      effectiveCastTime: 0,
      distance: 1,
      currentHP: 0,
      currentHPRatio: 1,
      targetHPRatio: 1,
      targetQiRatio: 1,
      resources: {},
      enduranceLost: 0,
      buffs: new Map(),
      debuffs: new Map(),
      actions: [],
      actionStates: {},
      modifierEffects: [],
      pendingCalculation: true,
    }
  })
  return rows
}
