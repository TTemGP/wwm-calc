import type { SkillRecord } from "../../calculations/rotationTimeline"
import { skillFieldText } from "../formatting"

export function RotationSkillName({ skill, fallback = "" }: { skill: SkillRecord | undefined; fallback?: string }) {
  const name = skillFieldText(fallback, skill, "name")
  const shortName = skillFieldText(fallback, skill, "shortName")
  return (
    <span className="rotation-skill-label">
      <span>{name}</span>
      {shortName && <span>({shortName})</span>}
    </span>
  )
}
