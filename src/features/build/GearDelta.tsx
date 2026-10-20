import { formatThroughputDelta, throughputDeltaClass } from "@/application/formatting"
import type { ThroughputReading } from "@/calculations/rotationWorkerTransport"
import { t } from "@/i18n"

/**
 * One candidate's difference from the item the slot has equipped.
 *
 * Absent is not zero. A card that has not been measured, or whose reference is still being
 * measured, says nothing rather than claiming no change, which is the rule the rotation toolbar
 * already follows for a pending baseline.
 */
export function GearDelta({ reading, reference }: { reading?: ThroughputReading; reference?: ThroughputReading }) {
  if (!reading || !reference) return <span className="setup-inactive-label">—</span>
  const difference = reading.dps - reference.dps
  return (
    <span className="setup-delta-label">
      <span className={throughputDeltaClass(difference, "damage")}>
        {formatThroughputDelta(difference)} {t("system.dps")}
      </span>
    </span>
  )
}
