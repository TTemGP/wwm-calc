// Format-specific readers for superseded browser storage formats.
// Keep legacy schemas here; current loaders own domain normalization.
export { readLegacyBuildSetup, type LegacyBuildSetup } from "./buildSetup"
export { readLegacyCharacterStats, type LegacyCharacterStats } from "./characterStats"
export { readLegacyAttunementStats, type LegacyAttunementStats } from "./attunements"
export { readLegacyGearInventory, type LegacyGearInventory } from "./gearInventory"
export { readLegacyPathSelection } from "./pathSelection"
export { readLegacyRotation, type LegacyRotation } from "./rotations"
