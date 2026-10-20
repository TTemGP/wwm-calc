import { formatThroughput } from "@/application/formatting"
import type { DamageBreakdown } from "@/calculations/damage"
import type { RotationActionBreakdown } from "@/calculations/rotationCalculator"
import { gameText } from "@/i18n"
import { Tooltip } from "@/ui/Tooltip"

const damageTooltipParts: Array<[keyof DamageBreakdown, string]> = [
  ["physical", "Physical"],
  ["bellstrike", "Bellstrike"],
  ["stonesplit", "Stonesplit"],
  ["silkbind", "Silkbind"],
  ["bamboocut", "Bamboocut"],
]

function damageTooltipContent(breakdown: DamageBreakdown) {
  return damageTooltipParts.map(([key, label]) => (
    <span className={`damage-breakdown-part damage-${key}`} key={key}>
      <i>{label}</i>
      {formatThroughput(breakdown[key] as number)}
    </span>
  ))
}

export function DamageBreakdownValue({
  breakdown,
  className = "",
}: {
  breakdown: DamageBreakdown
  className?: string
}) {
  return (
    <span className={`damage-breakdown-wrap ${className}`}>
      <Tooltip className="damage-breakdown-tooltip" content={damageTooltipContent(breakdown)}>
        <span>{formatThroughput(breakdown.total)}</span>
      </Tooltip>
    </span>
  )
}

export function HealingBreakdownValue({
  breakdown,
  className = "",
}: {
  breakdown: NonNullable<RotationActionBreakdown["healing"]>
  className?: string
}) {
  return (
    <span className={`damage-breakdown-wrap healing-value ${className}`}>
      <Tooltip
        className="damage-breakdown-tooltip"
        content={
          <>
            <span className="damage-breakdown-part healing-physical">
              <i>{gameText("Physical")}</i>
              {formatThroughput(breakdown.physical)}
            </span>
            <span className="damage-breakdown-part healing-silkbind">
              <i>{gameText("Silkbind")}</i>
              {formatThroughput(breakdown.silkbind)}
            </span>
          </>
        }
      >
        <span>+{formatThroughput(breakdown.total)}</span>
      </Tooltip>
    </span>
  )
}

export function RotationActionBreakdownValue({ breakdown }: { breakdown: RotationActionBreakdown }) {
  return (
    <span className="rotation-action-result">
      {breakdown.total > 0 ? <DamageBreakdownValue breakdown={breakdown} /> : null}
      {breakdown.healing && breakdown.healing.total > 0 ? (
        <HealingBreakdownValue breakdown={breakdown.healing} />
      ) : null}
    </span>
  )
}
