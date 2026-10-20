import type { DamageOutcome } from "./damage"
import {
  calculateRotationBaseline,
  calculateRotationDamageSequence,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "./rotationCalculator"

/**
 * Every damage percentage is a share of the run's total damage rather than of its
 * hit count, so the four always total 100%. Replay damage resolves no outcome and
 * is credited to normal. These field names cross the worker boundary, so they stay
 * stable across refactors to keep a version skew from throwing during render.
 */
export type SimulationRunResult = {
  totalDamage: number
  dps: number
  totalHealing: number
  hps: number
  abrasionPercentage: number
  normalPercentage: number
  criticalPercentage: number
  affinityPercentage: number
  healingNormalPercentage: number
  healingCriticalPercentage: number
}

export type SimulationSummary = {
  runCount: number
  duration: number
  runs: SimulationRunResult[]
  results: {
    best: SimulationRunResult
    p99: SimulationRunResult
    p95: SimulationRunResult
    p90: SimulationRunResult
    p75: SimulationRunResult
    median: SimulationRunResult
  }
}

const damageOutcomes: DamageOutcome[] = ["abrasion", "normal", "critical", "affinity"]

const emptyOutcomeDamage = (): Record<DamageOutcome, number> => ({ abrasion: 0, normal: 0, critical: 0, affinity: 0 })

const emptyRun = (): SimulationRunResult => ({
  totalDamage: 0,
  dps: 0,
  totalHealing: 0,
  hps: 0,
  abrasionPercentage: 0,
  normalPercentage: 0,
  criticalPercentage: 0,
  affinityPercentage: 0,
  healingNormalPercentage: 0,
  healingCriticalPercentage: 0,
})

export function selectSimulationPercentile(runs: SimulationRunResult[], percentile: number) {
  if (runs.length === 0) return emptyRun()
  return runs[Math.round((1 - percentile) * (runs.length - 1))]
}

/**
 * Reuses combat events for damage-only randomness; healing feedback and chance
 * applications rebuild concrete timelines for each run.
 */
export function simulateRotation(
  bundle: RotationSimulationBundle,
  runCount: number,
  random: () => number = Math.random,
  onProgress?: (completed: number, total: number) => void,
): SimulationSummary {
  const count = Math.max(1, Math.floor(runCount))
  const baseline = calculateRotationBaseline(bundle)
  const samplesTimeline =
    baseline.metrics.totalHealing > 0 ||
    baseline.timeline.some(row =>
      row.actions.some(
        action =>
          action.type === "apply" &&
          typeof action.value === "string" &&
          bundle.timeline.effectDefinitions[action.value]?.recording,
      ),
    ) ||
    [...bundle.timeline.innerWayRules, ...bundle.timeline.setupEffects].some(rule => {
      if (!rule.trigger || typeof rule.trigger !== "object") return false
      const trigger = rule.trigger as Record<string, unknown>
      const actions = trigger.action
      return (Array.isArray(actions) ? actions : [actions]).some(
        action => action && typeof action === "object" && action.chance !== undefined,
      )
    })
  const runs: SimulationRunResult[] = []
  const progressStep = Math.max(1, Math.floor(count / 100))

  for (let runIndex = 0; runIndex < count; runIndex += 1) {
    const outcomeDamage = emptyOutcomeDamage()
    const mysticOutcomeDamage = emptyOutcomeDamage()
    let totalHealing = 0
    let normalHeals = 0
    let criticalHeals = 0
    let healCount = 0
    const simulated = samplesTimeline ? calculateSimulatedRotationRun(bundle, random) : undefined
    const resolvedSequence = simulated?.resolvedSequence ?? calculateRotationDamageSequence(baseline.baseline, random)
    resolvedSequence.forEach(({ entry, breakdown }) => {
      // Replay damage resolves no sampled outcome and is credited to normal.
      const outcome = breakdown.outcome ?? "normal"
      outcomeDamage[outcome] += breakdown.total
      if (entry.context.skillTags.includes("Mystic")) mysticOutcomeDamage[outcome] += breakdown.total
      if (breakdown.healing) {
        totalHealing += breakdown.healing.total
        for (const recipientHealing of breakdown.recipientHealing ?? [breakdown.healing]) {
          switch (recipientHealing.outcome) {
            case "normal":
              normalHeals += 1
              healCount += 1
              break
            case "critical":
              criticalHeals += 1
              healCount += 1
              break
          }
        }
      }
    })
    const mysticDeficit = 1 - (simulated?.mysticVitalityDamageScale ?? baseline.mysticVitalityDamageScale)
    for (const outcome of damageOutcomes) outcomeDamage[outcome] -= mysticOutcomeDamage[outcome] * mysticDeficit
    const totalDamage = damageOutcomes.reduce((sum, outcome) => sum + outcomeDamage[outcome], 0)
    const percentage = (outcome: DamageOutcome) => (totalDamage > 0 ? (outcomeDamage[outcome] / totalDamage) * 100 : 0)
    const runDuration = simulated?.duration ?? baseline.duration
    runs.push({
      totalDamage,
      dps: runDuration > 0 ? totalDamage / runDuration : 0,
      totalHealing,
      hps: runDuration > 0 ? totalHealing / runDuration : 0,
      abrasionPercentage: percentage("abrasion"),
      normalPercentage: percentage("normal"),
      criticalPercentage: percentage("critical"),
      affinityPercentage: percentage("affinity"),
      healingNormalPercentage: healCount > 0 ? (normalHeals / healCount) * 100 : 0,
      healingCriticalPercentage: healCount > 0 ? (criticalHeals / healCount) * 100 : 0,
    })
    const completed = runIndex + 1
    if (completed === count || completed % progressStep === 0) onProgress?.(completed, count)
  }

  runs.sort((left, right) => right.dps - left.dps)
  return {
    runCount: count,
    duration: baseline.duration,
    runs,
    results: {
      best: runs[0] ?? emptyRun(),
      p99: selectSimulationPercentile(runs, 0.99),
      p95: selectSimulationPercentile(runs, 0.95),
      p90: selectSimulationPercentile(runs, 0.9),
      p75: selectSimulationPercentile(runs, 0.75),
      median: selectSimulationPercentile(runs, 0.5),
    },
  }
}
