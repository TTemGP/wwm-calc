import { finishCalculationPhase, startCalculationPhase } from "./calculationBenchmark"
import type { DamageContext } from "./damage"
import {
  calculateActionStats,
  type ResolvedStats,
  type StatEffectContainer,
  type EffectiveStatEffectContainer,
} from "./statEffects"
import { collectUnconditionalStatEffects } from "./unconditionalDamageEffects"

// Immutable contribution lists and aggregates are prepared once, including counterfactuals.
type Contribution = StatEffectContainer & EffectiveStatEffectContainer
const preparedEffects = new WeakMap<object, { contributions: Contribution[]; key: string }>()
const preparedFixed = new WeakMap<object, { contributions: Contribution[]; key: string }>()
const emptyAggregate = {}
const cache = new WeakMap<object, Map<string, ResolvedStats>>()

/** Shared action boundary for damage and healing. Formula functions consume only the resolved snapshot. */
export function resolveActionStatContext(context: DamageContext): DamageContext {
  const started = import.meta.env.DEV ? startCalculationPhase() : 0
  const detectionStarted = import.meta.env.DEV ? startCalculationPhase() : 0
  let effects = preparedEffects.get(context.effects)
  if (!effects) {
    const contributions = context.effects.filter(effect => effect.stat || effect.effectiveStat) as Contribution[]
    effects = { contributions, key: JSON.stringify(contributions.map(effect => [effect.stat, effect.effectiveStat])) }
    preparedEffects.set(context.effects, effects)
  }
  const aggregate = context.unconditionalDamageEffects ?? emptyAggregate
  let fixed = preparedFixed.get(aggregate)
  if (!fixed) {
    const contribution = collectUnconditionalStatEffects(aggregate)
    const contributions =
      Object.keys(contribution.stat).length || Object.keys(contribution.effectiveStat).length ? [contribution] : []
    fixed = { contributions, key: JSON.stringify(contributions) }
    preparedFixed.set(aggregate, fixed)
  }
  if (import.meta.env.DEV) finishCalculationPhase("damageStatEffectDetection", detectionStarted)
  if (!effects.contributions.length && !fixed.contributions.length) {
    if (import.meta.env.DEV) finishCalculationPhase("damageStatResolution", started)
    return context
  }
  const key = JSON.stringify([context.enemy.judgementResistance, context.weapons, effects.key, fixed.key])
  let states = cache.get(context.stats)
  if (!states) {
    states = new Map()
    cache.set(context.stats, states)
  }
  let cached = states.get(key)
  if (!cached) {
    const pipelineStarted = import.meta.env.DEV ? startCalculationPhase() : 0
    cached = calculateActionStats(
      context.stats,
      [...effects.contributions, ...fixed.contributions],
      context.enemy.judgementResistance,
      context.weapons,
    )
    states.set(key, cached)
    if (import.meta.env.DEV) finishCalculationPhase("damageStatPipeline", pipelineStarted)
  }
  if (import.meta.env.DEV) finishCalculationPhase("damageStatResolution", started)
  return { ...context, stats: cached, derivedStats: cached }
}
