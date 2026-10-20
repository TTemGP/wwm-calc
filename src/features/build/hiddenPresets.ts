import { getPersistentItem, setPersistentItem } from "@/persistentStorage"

// 연운 딜 계산기: 기본 프리셋은 코드에 들어 있는 데이터라 지울 수 없어서, 목록에서 숨기는 것으로 대신해요.
const hiddenPresetsStorageKey = "wwm-calc-hidden-presets-v1"

export function loadHiddenPresetIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(getPersistentItem(hiddenPresetsStorageKey) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

export function saveHiddenPresetIds(ids: readonly string[]) {
  try {
    setPersistentItem(hiddenPresetsStorageKey, JSON.stringify(ids))
  } catch {
    // 저장소를 못 쓰는 환경에서는 이번 방문 동안만 숨겨요.
  }
}
