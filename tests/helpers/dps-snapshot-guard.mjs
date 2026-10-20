import { isDeepStrictEqual } from "node:util"

// The damage pipeline uses only exactly specified IEEE-754 operations and
// accumulates in a fixed single-threaded order, so identical inputs must
// reproduce identical bits. The budget absorbs a shift of a few representations
// from a summation reassociation or an engine change and rejects every real
// change.
export const dpsSnapshotUlpBudget = 4

// Snapshot fields under comparison, in report order.
const comparedFields = ["dps", "totalDamage", "duration"]

// Exact distance in representable doubles. Both operands are validated finite
// and positive above, where the IEEE-754 bit pattern rises with the value, so
// the bit difference is the ULP count. Scaling by EPSILON instead would
// overstate the spacing by up to 2x within a binade and let real drift through.
const bits = new DataView(new ArrayBuffer(16))
function ulpDistance(before, after) {
  if (before === after) return 0
  bits.setFloat64(0, before)
  bits.setFloat64(8, after)
  const distance = bits.getBigUint64(0) - bits.getBigUint64(8)
  return Number(distance < 0n ? -distance : distance)
}

export function compareDpsSnapshots(expected, actual) {
  const failures = []
  for (const caseId of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
    const before = expected[caseId]
    const after = actual[caseId]
    if (!before || !after) {
      failures.push(
        `${caseId}: ${before ? "rotation no longer covered; review snapshot removal" : "missing DPS snapshot"}.`,
      )
      continue
    }
    const valid = [before, after].every(value =>
      comparedFields.every(field => Number.isFinite(value[field]) && value[field] > 0),
    )
    if (!valid) {
      failures.push(`${caseId}: snapshot and calculated DPS, damage, and duration must be finite and positive.`)
      continue
    }
    if (!isDeepStrictEqual(before.fixture, after.fixture)) {
      failures.push(`${caseId}: preset or environment changed; review the new fixture before updating its snapshot.`)
    }
    for (const field of comparedFields) {
      const distance = ulpDistance(before[field], after[field])
      if (distance > dpsSnapshotUlpBudget) {
        failures.push(
          `${caseId}: ${field} ${before[field]} -> ${after[field]} (${distance} ULPs); ` +
            `reproducing the accepted snapshot within ${dpsSnapshotUlpBudget} ULPs is required.`,
        )
      }
    }
  }
  return failures
}
