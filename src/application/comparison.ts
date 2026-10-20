import { rotationVariantFingerprint } from "@/calculations/calculationFingerprint"
import {
  sortAttunementPriorityRows,
  sortRotationPriorityRows,
  type RotationSimulationBundle,
  type RotationSimulationVariant,
} from "@/calculations/rotationCalculator"
import {
  rotationCalculationCategories,
  type RotationCalculationCategory,
  type RotationMetrics,
} from "@/calculations/rotationMetrics"

export const comparisonCategoryOrder: RotationCalculationCategory[] = rotationCalculationCategories.filter(
  category => category !== "baseline",
)

function setupGroupMatchesCategory(group: string, category: RotationCalculationCategory) {
  if (category === "weaponSets") return group.startsWith("weaponSets:")
  if (category === "armorSets") return group.startsWith("armorSets:")
  if (category === "globalDebuffs") return group.startsWith("debuff:") || group.startsWith("buff:")
  return group === category
}

export type ComparisonVariantRequest = { key: string; bundle: RotationSimulationBundle }

export function comparisonVariantRequests(
  bundle: RotationSimulationBundle,
  category: RotationCalculationCategory,
): ComparisonVariantRequest[] {
  const singleVariantBundle = (
    variant: RotationSimulationVariant,
    field: "statPriority" | "attunementPriority" | "innerWayPriority" | "setupComparisons",
    group?: string,
  ): RotationSimulationBundle => ({
    ...bundle,
    statPriority: field === "statPriority" ? [variant] : [],
    attunementPriority: field === "attunementPriority" ? [variant] : [],
    innerWayPriority: field === "innerWayPriority" ? [variant] : [],
    setupComparisons: field === "setupComparisons" && group ? { [group]: [variant] } : {},
  })
  const descriptor = (
    variant: RotationSimulationVariant,
    field: "statPriority" | "attunementPriority" | "innerWayPriority" | "setupComparisons",
    group?: string,
  ) => {
    return {
      key: rotationVariantFingerprint(category, field, group, variant),
      bundle: singleVariantBundle(variant, field, group),
    }
  }
  if (category === "statPriority") return bundle.statPriority.map(variant => descriptor(variant, "statPriority"))
  if (category === "attunementPriority")
    return bundle.attunementPriority.map(variant => descriptor(variant, "attunementPriority"))
  if (category === "innerWays") return bundle.innerWayPriority.map(variant => descriptor(variant, "innerWayPriority"))
  return Object.entries(bundle.setupComparisons)
    .filter(([group]) => setupGroupMatchesCategory(group, category))
    .flatMap(([group, variants]) => variants.map(variant => descriptor(variant, "setupComparisons", group)))
}

export function combineComparisonVariantMetrics(
  current: RotationMetrics,
  results: RotationMetrics[],
  category: RotationCalculationCategory,
) {
  const combined: RotationMetrics = {
    ...current,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
  if (category === "statPriority")
    combined.statPriority = sortRotationPriorityRows(results.flatMap(result => result.statPriority))
  else if (category === "attunementPriority")
    combined.attunementPriority = sortAttunementPriorityRows(results.flatMap(result => result.attunementPriority))
  else if (category === "innerWays")
    combined.innerWayPriority = sortRotationPriorityRows(
      results.flatMap(result => result.innerWayPriority),
      "ascending",
    )
  else {
    for (const result of results)
      for (const [group, rows] of Object.entries(result.setupComparisons))
        combined.setupComparisons[group] = sortRotationPriorityRows([
          ...(combined.setupComparisons[group] ?? []),
          ...rows,
        ])
  }
  return mergeComparisonCategory(current, combined, category)
}

export function baselineMetricsWithPreviousComparisons(
  baseline: RotationMetrics,
  previous?: RotationMetrics,
): RotationMetrics {
  return {
    ...baseline,
    statPriority: previous?.statPriority ?? [],
    attunementPriority: previous?.attunementPriority ?? [],
    innerWayPriority: previous?.innerWayPriority ?? [],
    setupComparisons: previous?.setupComparisons ?? {},
  }
}

export function mergeComparisonCategory(
  current: RotationMetrics,
  calculated: RotationMetrics,
  category: RotationCalculationCategory,
) {
  if (category === "statPriority") return { ...current, statPriority: calculated.statPriority }
  if (category === "attunementPriority") return { ...current, attunementPriority: calculated.attunementPriority }
  if (category === "innerWays") return { ...current, innerWayPriority: calculated.innerWayPriority }
  const setupComparisons = Object.fromEntries(
    Object.entries(current.setupComparisons).filter(([group]) => !setupGroupMatchesCategory(group, category)),
  )
  for (const [group, rows] of Object.entries(calculated.setupComparisons)) setupComparisons[group] = rows
  return { ...current, setupComparisons }
}
