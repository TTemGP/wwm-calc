import { t } from "@/i18n"

/**
 * Wording for a calculation status, shared by everything that reports one.
 *
 * A calculation that reports no progress is described without a percentage. Reporting zero
 * instead would state a fraction that was never measured, and a calculation that publishes
 * no steps is not one that is stuck at the start.
 */
export function calculationStatusLabel(recalculating: boolean, progress: number | undefined) {
  if (!recalculating) return t("ui.app.upToDate")
  if (progress === undefined) return t("ui.app.recalculating")
  return t("ui.app.recalculatingProgress", { percentage: Math.round(progress * 100) })
}
