import { sortRotationPriorityRows } from "./calculations/rotationCalculator"
import type { RotationPriority } from "./calculations/rotationMetrics"
import { relayedAffixMultiplier } from "./gear"

export type StatPriorityMode = "max" | "relayed" | "both"
export type StatPriorityDisplayRow = RotationPriority & { rollKind: "max" | "relayed" }

export function nextStatPriorityMode(mode: StatPriorityMode): StatPriorityMode {
  switch (mode) {
    case "max":
      return "relayed"
    case "relayed":
      return "both"
    case "both":
      return "max"
  }
}

/** Presentation-only linear prediction from the centralized Max results; never runs a variant. */
export function statPriorityDisplayRows(rows: RotationPriority[], mode: StatPriorityMode): StatPriorityDisplayRow[] {
  const max: StatPriorityDisplayRow[] = rows.map(row => ({ ...row, rollKind: "max" }))
  if (mode === "max") return max
  const relayed: StatPriorityDisplayRow[] = rows.map(row => ({
    ...row,
    rollKind: "relayed",
    maxRoll: row.maxRoll === undefined ? undefined : row.maxRoll * relayedAffixMultiplier,
    dpsDifference: row.dpsDifference * relayedAffixMultiplier,
    increase: row.increase * relayedAffixMultiplier,
    hpsDifference: row.hpsDifference * relayedAffixMultiplier,
    healingIncrease: row.healingIncrease * relayedAffixMultiplier,
  }))
  switch (mode) {
    case "relayed":
      return sortRotationPriorityRows(relayed)
    case "both":
      return sortRotationPriorityRows([...max, ...relayed])
  }
}
