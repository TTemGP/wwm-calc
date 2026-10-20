import { getPersistentItem } from "../../persistentStorage"
import { parseJson } from "../../schemas/json"
import { skillOverridesInputSchema } from "../../schemas/skillOverrides"
import { deserializeSkillOverrides, type SkillOverrides } from "../../skillOverrides"
import { skillStorageKey } from "./keys"

export function loadSkillOverrides(): SkillOverrides {
  const result = parseJson(skillOverridesInputSchema, getPersistentItem(skillStorageKey) ?? "{}")
  return result.success ? deserializeSkillOverrides(result.output) : {}
}

export function hasSkillOverrides(overrides: SkillOverrides) {
  return Object.values(overrides).some(
    categoryOverrides => categoryOverrides && Object.keys(categoryOverrides).length > 0,
  )
}
