import type { RotationActionBreakdown, RotationSimulationBaseline } from "./rotationCalculator"
import type { TimelineRow } from "./rotationTimeline"

const channels = ["physical", "bellstrike", "stonesplit", "silkbind", "bamboocut", "total"] as const

/** Publication-only compaction. Never feed merged hits back through combat triggers. */
export function compactInnerWayResults(result: RotationSimulationBaseline): RotationSimulationBaseline {
  const groups = new Set(result.timeline.filter(row => row.kind === "damageGroup").map(row => row.id))
  if (!groups.size) return result
  const entries = new Map(result.baseline.map(entry => [entry.id, entry]))
  const merged = new Map<string, { row: TimelineRow; breakdown: RotationActionBreakdown }>()
  const timeline: TimelineRow[] = []
  const actionBreakdowns = { ...result.actionBreakdowns }
  for (const row of result.timeline) {
    const id = `${row.id}:0`
    const breakdown = actionBreakdowns[id]
    const entry = entries.get(id)
    const action = row.actions[0]
    if (
      !row.sourceRowId ||
      !groups.has(row.sourceRowId) ||
      row.actions.length !== 1 ||
      action?.type !== "damage" ||
      !breakdown ||
      breakdown.healing ||
      !entry
    ) {
      timeline.push(row)
      continue
    }
    const { damageScale = 1, hitProbability = 1, ...definition } = action
    const scale = Number(damageScale)
    if (!(scale > 0)) {
      timeline.push(row)
      continue
    }
    // Exact timestamp/context equality only. Outcome-dependent damage may differ
    // despite equal base contexts, so compare the resolved unit damage as well.
    const key = JSON.stringify([
      row.sourceRowId,
      row.step,
      row.startTime,
      definition,
      entry.context,
      row.sourceDamageWeights,
      breakdown.outcomeRates,
      breakdown.expectedBuffStacks,
      channels.map(channel => breakdown[channel] / scale),
      Object.entries(breakdown.buffedDamageBySource ?? {}).map(([source, value]) => [source, value / scale]),
    ])
    const previous = merged.get(key)
    if (!previous) {
      const copy = { ...row, actions: [{ ...action }] }
      const total = {
        ...breakdown,
        ...(breakdown.buffedDamageBySource ? { buffedDamageBySource: { ...breakdown.buffedDamageBySource } } : {}),
      }
      merged.set(key, { row: copy, breakdown: total })
      timeline.push(copy)
      actionBreakdowns[id] = total
      continue
    }
    previous.row.actions[0].damageScale = Number(previous.row.actions[0].damageScale ?? 1) + scale
    previous.row.actions[0].hitProbability =
      Number(previous.row.actions[0].hitProbability ?? 1) + Number(hitProbability)
    for (const channel of channels) previous.breakdown[channel] += breakdown[channel]
    for (const [source, value] of Object.entries(breakdown.buffedDamageBySource ?? {}))
      previous.breakdown.buffedDamageBySource![source] = (previous.breakdown.buffedDamageBySource![source] ?? 0) + value
    delete actionBreakdowns[id]
  }
  return { ...result, timeline, actionBreakdowns, compactedInnerWayResults: true }
}
