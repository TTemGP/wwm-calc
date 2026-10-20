import type { RotationSimulationBundle, RotationSimulationVariant } from "./rotationCalculator"

/**
 * Pure cache-key helpers. This module is imported by `rotationWorker.ts` and must stay
 * free of React, zustand, and any other import with side effects.
 */

/** Two independent FNV-1a style hashes over the serialized value, prefixed by its length. */
export function calculationFingerprint(value: unknown) {
  const serialized = JSON.stringify(value)
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${serialized.length}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`
}

/** Strip the display-only rotation name so renaming a rotation cannot change its cache key. */
function displayNeutralVariant(variant: RotationSimulationVariant) {
  if (!variant.timeline) return variant
  const { name: _displayName, ...rotation } = variant.timeline.rotation
  return { ...variant, timeline: { ...variant.timeline, rotation } }
}

export function rotationBundleFingerprint(bundle: RotationSimulationBundle) {
  const { name: _displayName, ...rotation } = bundle.timeline.rotation
  return calculationFingerprint({
    martialArts: [...bundle.weapons],
    ...bundle,
    timeline: { ...bundle.timeline, rotation },
  })
}

export function rotationVariantFingerprint(
  category: string,
  field: string,
  group: string | undefined,
  variant: RotationSimulationVariant,
) {
  return calculationFingerprint({ category, field, group, variant: displayNeutralVariant(variant) })
}
