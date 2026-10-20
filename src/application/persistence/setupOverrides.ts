import { normalizeBuildSetupOverrides, type BuildSetup, type BuildSetupOverrides } from "../../gear"
import { getPersistentItem } from "../../persistentStorage"
import { buildSetupOverridesInputSchema } from "../../schemas/buildSetup"
import { parseJson } from "../../schemas/json"
import { buildSetupOverrideStorageKey } from "./keys"
import { readLegacyBuildSetup } from "./legacy"

export function loadBuildSetupOverrides(baseline: BuildSetup): BuildSetupOverrides {
  try {
    const saved = getPersistentItem(buildSetupOverrideStorageKey)
    if (saved !== null) {
      const parsed = parseJson(buildSetupOverridesInputSchema, saved)
      return parsed.success ? normalizeBuildSetupOverrides(parsed.output) : {}
    }
    const parsed = normalizeBuildSetupOverrides(readLegacyBuildSetup())
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          !sameBuildSetupValue(
            key as keyof BuildSetup,
            value as BuildSetup[keyof BuildSetup],
            baseline[key as keyof BuildSetup],
          ),
      ),
    ) as BuildSetupOverrides
  } catch {
    return {}
  }
}

export function sameBuildSetupValue(
  key: keyof BuildSetup,
  left: BuildSetup[keyof BuildSetup],
  right: BuildSetup[keyof BuildSetup],
) {
  return key === "weaponSets" || key === "armorSets" || key === "innerWays"
    ? JSON.stringify(left) === JSON.stringify(right)
    : left === right
}
