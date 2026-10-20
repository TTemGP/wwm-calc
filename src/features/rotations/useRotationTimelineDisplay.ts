import { useMemo, useState } from "react"

import { rotationEventDefinitions } from "../../application/gameData/rotationEffects"
import { timelineAnchorTime } from "../../application/rotationCatalog"
import type { EditorTimelineResult } from "../../calculations/editorTimeline"
import { type RotationSimulationResult } from "../../calculations/rotationCalculator"
import {
  compareTimelineTime,
  isAttachmentAnchorStep,
  mergeCalculatedTimelineState,
  type RotationRecord,
  type RotationStep,
  type TimelineRow,
} from "../../calculations/rotationTimeline"
import { pendingEditorTimeline, withUnresolvedEditorSteps, type EditorRevision } from "../../editorTimelinePreview"
import { readableRotationText } from "../../readableRotation"
import { buildTimelineDisplayEntries } from "../../rotationDisplay"
import type { RotationAttachmentTarget } from "../../rotationEditing"
import { type SkillMap } from "../../skillOverrides"

export function useRotationTimelineDisplay({
  rotation,
  calculationDefinitions,
  editingRotationId,
  editorTimelineReady,
  editorTimelineState,
  rotationResults,
  editorStepReplacements,
  startAnchor,
  expandedSkillRows,
  readableDialogOpen,
}: {
  rotation: RotationRecord
  calculationDefinitions: { skills: SkillMap }
  editingRotationId: string
  editorTimelineReady: boolean
  editorTimelineState: (EditorTimelineResult & { revision: EditorRevision }) | undefined
  rotationResults: Record<string, { key: string; result: RotationSimulationResult }>
  editorStepReplacements: WeakMap<RotationStep, RotationStep>
  startAnchor: { rowId: string; actionIndex?: number }
  expandedSkillRows: ReadonlySet<string>
  readableDialogOpen: boolean
}) {
  const structuralTimeline = useMemo(
    () =>
      editorTimelineReady
        ? withUnresolvedEditorSteps(
            { rotation, skills: calculationDefinitions.skills, eventDefinitions: rotationEventDefinitions },
            editorTimelineState!.timeline,
          )
        : pendingEditorTimeline(
            { rotation, skills: calculationDefinitions.skills, eventDefinitions: rotationEventDefinitions },
            editorTimelineState?.revision.id === editingRotationId ? editorTimelineState : undefined,
            editorStepReplacements,
          ),
    [
      rotation,
      calculationDefinitions,
      editingRotationId,
      editorTimelineReady,
      editorTimelineState,
      editorStepReplacements,
    ],
  )
  const matchingCalculation =
    rotationResults[editingRotationId]?.key === editorTimelineState?.fingerprint
      ? rotationResults[editingRotationId]
      : undefined
  const [displayedCalculationState, setDisplayedCalculationState] = useState(matchingCalculation)
  if (matchingCalculation && displayedCalculationState !== matchingCalculation)
    setDisplayedCalculationState(matchingCalculation)
  const displayedCalculation =
    editorTimelineState?.revision.id === editingRotationId &&
    displayedCalculationState?.key === editorTimelineState?.fingerprint
      ? displayedCalculationState?.result
      : undefined
  const timeline = useMemo(
    () => mergeCalculatedTimelineState(structuralTimeline, displayedCalculation?.timeline),
    [structuralTimeline, displayedCalculation],
  )
  const displayedStart =
    editorTimelineState?.revision.id === editingRotationId ? editorTimelineState.rotation.start : rotation.start
  const anchorTime = useMemo(
    () =>
      timelineAnchorTime(timeline, {
        rowId: `rotation-${displayedStart?.step ?? 0}`,
        actionIndex: displayedStart?.action,
      }),
    [displayedStart, timeline],
  )
  const damageRowsByOwner = useMemo(() => {
    const result = new Map<string, TimelineRow[]>()
    for (const row of timeline) {
      const owner = row.kind === "rotation" || row.kind === "damageGroup" ? row.id : row.sourceRowId
      if (!owner) continue
      const rows = result.get(owner) ?? []
      rows.push(row)
      result.set(owner, rows)
    }
    return result
  }, [timeline])
  const attachmentTargets = useMemo(() => {
    const triggeredRowsBySourceAndSkill = new Map<string, TimelineRow[]>()
    timeline.forEach(row => {
      if (row.kind !== "trigger" || !row.sourceRowId || row.step.type !== "skill") return
      const key = `${row.sourceRowId}:${row.step.skill}`
      const matches = triggeredRowsBySourceAndSkill.get(key)
      if (matches) matches.push(row)
      else triggeredRowsBySourceAndSkill.set(key, [row])
    })

    return timeline
      .filter(
        row =>
          row.kind === "rotation" &&
          row.rotationIndex !== undefined &&
          !row.skipped &&
          isAttachmentAnchorStep(row.step) &&
          !(
            row.step.type === "event" &&
            row.step.event === "TakeDamage" &&
            "automatic" in row.step &&
            row.step.automatic === "targetAttack"
          ),
      )
      .flatMap(sourceRow => {
        const sourceStepIndex = sourceRow.rotationIndex ?? -1
        const targets: RotationAttachmentTarget[] = []
        if (sourceRow.step.type === "skill")
          targets.push({
            sourceRowId: sourceRow.id,
            sourceStepIndex,
            target: { action: "start" },
            time: sourceRow.startTime,
            order: sourceRow.order,
          })
        sourceRow.actions.forEach((action, actionIndex) => {
          if (action.type === "inactive") return
          targets.push({
            sourceRowId: sourceRow.id,
            sourceStepIndex,
            target: { action: actionIndex },
            time: sourceRow.startTime + Number(action.time ?? 0),
            order: sourceRow.order + 10 + actionIndex,
          })
        })
        if (sourceRow.step.type !== "skill") return targets
        const nextTriggeredRowBySkill = new Map<string, number>()
        let triggerOrdinal = 0
        sourceRow.actions.forEach(action => {
          if (action.type !== "trigger" || typeof action.value !== "string") return
          const key = `${sourceRow.id}:${action.value}`
          const matchIndex = nextTriggeredRowBySkill.get(action.value) ?? 0
          const triggeredRow = triggeredRowsBySourceAndSkill.get(key)?.[matchIndex]
          nextTriggeredRowBySkill.set(action.value, matchIndex + 1)
          if (triggeredRow) {
            triggeredRow.actions.forEach((triggeredAction, actionIndex) => {
              if (triggeredAction.type === "inactive") return
              targets.push({
                sourceRowId: sourceRow.id,
                sourceStepIndex,
                target: { trigger: triggerOrdinal, action: actionIndex },
                time: triggeredRow.startTime + Number(triggeredAction.time ?? 0),
                order: triggeredRow.order + 10 + actionIndex,
              })
            })
          }
          triggerOrdinal += 1
        })
        return targets
      })
      .sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order)
  }, [timeline])
  const displayEntries = useMemo(() => {
    const actionsExpanded = (rowId: string) => expandedSkillRows.has(`${editingRotationId}:${rowId}`)
    return buildTimelineDisplayEntries(timeline, actionsExpanded, startAnchor)
  }, [editingRotationId, expandedSkillRows, startAnchor, timeline])
  const readableRotation = useMemo(
    () => (readableDialogOpen ? readableRotationText(timeline, startAnchor, anchorTime) : ""),
    [anchorTime, readableDialogOpen, startAnchor, timeline],
  )
  return {
    timeline,
    anchorTime,
    damageRowsByOwner,
    attachmentTargets,
    displayEntries,
    readableRotation,
    displayedCalculation,
  }
}
