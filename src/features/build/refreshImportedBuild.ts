import type { BuildState } from "@/gear"

// 연운 딜 계산기: 공식 대시보드에서 다시 불러온 장비로 기존 빌드를 갱신해요.
// 새로 들어온 빌드의 장비·세팅을 대상 빌드에 옮기고, 새 빌드 항목은 지워요.
// 대상 빌드가 쓰던 장비 중 이제 아무 빌드도 끼지 않는 것은 장비 목록에서 정리해요.
export function refreshBuildFromImport(state: BuildState, targetId: string, importedId: string): BuildState {
  const target = state.entries.find(entry => entry.id === targetId)
  const imported = state.entries.find(entry => entry.id === importedId)
  if (!target || target.isDefault || !imported || targetId === importedId) return state
  const previousItemIds = new Set(Object.values(target.equipped ?? {}).filter(Boolean))
  const refreshed = {
    ...target,
    equipped: { ...imported.equipped },
    ...(imported.martialArts ? { martialArts: [...imported.martialArts] } : {}),
    ...(imported.setup ? { setup: imported.setup } : {}),
  }
  const entries = state.entries
    .filter(entry => entry.id !== importedId)
    .map(entry => (entry.id === targetId ? refreshed : entry))
  const stillUsed = new Set(entries.flatMap(entry => Object.values(entry.equipped ?? {}).filter(Boolean)))
  return {
    ...state,
    entries,
    gearItems: state.gearItems.filter(item => !previousItemIds.has(item.id) || stillUsed.has(item.id)),
    activeBuildId: state.activeBuildId === importedId ? targetId : state.activeBuildId,
  }
}
