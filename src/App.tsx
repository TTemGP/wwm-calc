import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { resolveBuildStatState } from "./application/buildStatState"
import { settingsForPath } from "./application/characterComposition"
import type { LayoutMode, PathId } from "./application/contracts"
import { martialArtDefinitions } from "./application/gameData/martialArts"
import { pathIcons } from "./application/gameData/pathIcons"
import {
  defaultBuildIdForPath,
  defaultRotationIdForPath,
  pathRequiresDev,
  pathStatusLabel,
  typedPathDefinitions,
  type PathDefinition,
} from "./application/gameData/paths"
import { combatDefinitionsFor, type PreviewId } from "./application/gameData/previews"
import { breakthroughProfile } from "./application/gameData/setup"
import { loadPreviewSelection, persistPreviewSelection } from "./application/persistence/previewSelection"
import { loadRotationEntries } from "./application/persistence/rotations"
import { loadBuildSetupOverrides, sameBuildSetupValue } from "./application/persistence/setupOverrides"
import { hasSkillOverrides, loadSkillOverrides } from "./application/persistence/skillOverrides"
import { rotationAvailableForWeapons } from "./application/rotationCatalog"
import { AccountBar } from "./application/shell/AccountBar"
import { FeatureLoadBoundary } from "./application/shell/FeatureLoadBoundary"
import { NoticeArea } from "./application/shell/NoticeArea"
import { BreakdownTab } from "./features/analysis/BreakdownTab"
import { StatsTab } from "./features/character/StatsTab"
import { SettingsTab } from "./features/settings/SettingsTab"
import { SkillEditorTab } from "./features/skills/SkillEditorTab"
import { Chip } from "./ui/Chip"
import { Tab } from "./ui/Tab"
const loadBuildTab = () => import("./features/build/BuildTab")
const loadSimulationTab = () => import("./features/simulation/SimulationTab")
const loadRotationEditorTab = () => import("./features/rotations/RotationEditorTab")
const BuildTab = lazy(loadBuildTab)
const SimulationTab = lazy(loadSimulationTab)
const RotationEditorTab = lazy(() => loadRotationEditorTab().then(module => ({ default: module.RotationEditorTab })))
import { visibleBuilds, visibleGearItems } from "@/application/gearScope"

import { buildSetupOverrideStorageKey, skillStorageKey } from "./application/persistence/keys"
import { withPathSelection } from "./application/persistence/pathSelection"
// Only the live viewport query stays here. The settings and loadout loaders, and the build and
// rotation selections, moved to the stores that own those values.
import { compactLayoutSnapshot, subscribeToCompactLayout } from "./application/persistence/settings"
import {
  characterProfileStorageKey,
  loadCharacterProfiles,
  serializeCharacterProfiles,
  type CharacterProfile,
} from "./characterProfiles"
import { useActiveRotationResult } from "./features/rotations/useActiveRotationResult"
import { resolveBuildSetup, sameWeaponPair, type BuildSetup, type BuildSetupOverrides } from "./gear"
import { gameText, t } from "./i18n"
import { resolvePathWorkspaceSelection } from "./pathWorkspace"
import { removePersistentItem, setPersistentItem } from "./persistentStorage"
import { serializeSkillOverrides, type SkillOverrides } from "./skillOverrides"
import { useDpsStore } from "./stores/dpsStore"
import { useGearStore } from "./stores/gearStore"
import { useLoadoutStore } from "./stores/loadoutStore"
import { useOverrideStore } from "./stores/overrideStore"
import { useRotationStore } from "./stores/rotationStore"
import { useSettingsStore } from "./stores/settingsStore"
import { type EnemyProfile, type WeaponId } from "./types"

const tabSuspenseFallback = <div className="viewport-tab-content" />

export default function App() {
  const compactViewport = useSyncExternalStore(subscribeToCompactLayout, compactLayoutSnapshot, () => false)
  const [activeTab, setActiveTab] = useState<
    "main" | "build" | "breakdown" | "rotations" | "simulation" | "skills" | "settings"
  >("main")
  // Mount the simulator only on first use, then keep it mounted while hidden. Its module is preloaded below.
  // Remounting would cancel its worker and discard progress/results on every tab switch.
  const [simulationMounted, setSimulationMounted] = useState(false)
  // The rotation editor is deferred for a different reason: it is the largest module in the
  // application, and its timeline editing UI is only needed on that tab. It is
  // deliberately absent from the idle preload below, which would give back what deferring it
  // saves. The active rotation's own totals are resolved by the application, so the headline
  // number does not wait for it.
  const [rotationsMounted, setRotationsMounted] = useState(false)

  useEffect(() => {
    const preloadDeferredTabs = () => {
      void Promise.allSettled([loadBuildTab(), loadSimulationTab()])
    }
    if (typeof window.requestIdleCallback === "function") {
      const idleCallback = window.requestIdleCallback(preloadDeferredTabs, { timeout: 1500 })
      return () => window.cancelIdleCallback(idleCallback)
    }
    const timeout = window.setTimeout(preloadDeferredTabs, 1)
    return () => window.clearTimeout(timeout)
  }, [])

  const [skillOverrides, setSkillOverrides] = useState<SkillOverrides>(loadSkillOverrides)
  const skillEditorModified = hasSkillOverrides(skillOverrides)
  const [previewId, setPreviewId] = useState<PreviewId | null>(loadPreviewSelection)
  const [innerWayRevision, setInnerWayRevision] = useState(0)
  const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>(loadCharacterProfiles)
  // The stores are module singletons, so their persisted state is read during the first render
  // rather than when their modules happen to be imported, which a lazily loaded editor decides. It
  // has to be read before the first render reads the path, the build list is filtered by, or the
  // editor picks a rotation to open on, and before this component subscribes, so the write lands on
  // a store nothing is watching yet.
  //
  // The order is a dependency chain. Application settings boot first because the path a saved
  // session resolves to depends on the development toggle, so the loadout store takes that value
  // rather than reading the same key again. The path that resolves then decides which build and
  // rotation each of the two remaining stores restores its selection for.
  const [appStoresRead, markAppStoresRead] = useState(false)
  if (!appStoresRead) {
    markAppStoresRead(true)
    useSettingsStore.getState().initialise(compactViewport)
    useLoadoutStore.getState().initialise(true)
    useOverrideStore.getState().initialise()
  }
  // 연운 딜 계산기: 개발자 전용 유파·프리셋·로테이션을 모두 열어 둬요. 화면 배치만 실제 설정을 따라요.
  const layoutDevMode = useSettingsStore(state => state.devMode)
  const devMode = true
  const layoutPreview = useSettingsStore(state => state.layoutPreview)
  const pathId = useLoadoutStore(state => state.pathId)
  const settings = useLoadoutStore(state => state.settings)
  const setupSelections = useLoadoutStore(state => state.setupSelections)
  const globalDebuffs = useLoadoutStore(state => state.globalDebuffs)
  const statOverrides = useOverrideStore(state => state.statOverrides)
  const attunementOverrides = useOverrideStore(state => state.attunementOverrides)
  const layoutMode: LayoutMode = layoutDevMode ? layoutPreview : compactViewport ? "mobile" : "pc"
  const [workspaceStoresRead, markWorkspaceStoresRead] = useState(false)
  if (!workspaceStoresRead) {
    markWorkspaceStoresRead(true)
    useGearStore.getState().initialise(pathId)
    useRotationStore.getState().initialise(pathId)
  }
  const buildState = useGearStore(state => state.buildState)
  const scope = useGearStore(state => state.scope)
  const activeBuildIdsByPath = useGearStore(state => state.activeBuildIdsByPath)
  const activeRotationIdsByPath = useRotationStore(state => state.activeRotationIdsByPath)
  const activeResult = useRotationStore(state => state.result)
  const breakthrough = breakthroughProfile(settings)
  const enemy: EnemyProfile = breakthrough
  const pathBuildGroup = typedPathDefinitions[pathId].buildGroup
  // Which builds and which gear this path may see is the store's rule, not this file's, and it
  // is computed once here because both the active build and the gear that reaches the
  // measurement come from the same answer. The list is filtered before the measurement rather
  // than after, so a path cannot be measured with an item it is not meant to own.
  const availableBuildEntries = useMemo(
    () => visibleBuilds({ buildState, scope, pathId, buildGroup: pathBuildGroup, weapons: settings.weapons, devMode }),
    [buildState, scope, pathId, pathBuildGroup, settings.weapons, devMode],
  )
  const visibleGear = useMemo(
    () => visibleGearItems({ buildState, scope, pathId, builds: availableBuildEntries }),
    [buildState, scope, pathId, availableBuildEntries],
  )
  const activeBuild =
    availableBuildEntries.find(entry => entry.id === activeBuildIdsByPath[pathId]) ??
    availableBuildEntries.find(entry => entry.id === defaultBuildIdForPath(pathId)) ??
    availableBuildEntries[0]
  const buildTabMartialArtTags = useMemo(
    () => settings.weapons.map(weapon => martialArtDefinitions[weapon].tag),
    [settings.weapons],
  )
  const selectedRotationId = activeRotationIdsByPath[pathId] ?? defaultRotationIdForPath(pathId)
  const activeBuildDisplayName = activeBuild
    ? (activeBuild.isDefault ? gameText(activeBuild.name) : activeBuild.name) || "Unnamed Build"
    : "Unnamed Build"
  const activeBuildSetup = useMemo(() => resolveBuildSetup(activeBuild), [activeBuild])
  const [buildSetupOverrides, setBuildSetupOverrides] = useState<BuildSetupOverrides>(() =>
    loadBuildSetupOverrides(activeBuildSetup),
  )
  const activeStatState = useMemo(
    () =>
      resolveBuildStatState({
        build: activeBuild,
        gearItems: visibleGear,
        settings,
        statOverrides,
        attunementOverrides,
        setupSelections,
        pathId,
        buildSetupOverrides,
      }),
    [
      activeBuild,
      visibleGear,
      settings,
      statOverrides,
      attunementOverrides,
      setupSelections,
      pathId,
      buildSetupOverrides,
    ],
  )
  /**
   * What a build is measured against. Everything here belongs to the sheet or the environment
   * rather than to any build, so a build measured without being activated resolves against the
   * same inputs the active one did. The environment half of it is what `loadoutStore` owns.
   */
  const buildMeasurementContext = useMemo(
    () => ({
      environment: { pathId, settings, setupSelections, skillOverrides, previewId, globalDebuffs, enemy },
      statOverrides,
      attunementOverrides,
      buildSetupOverrides: { buildId: activeBuild?.id ?? "", overrides: buildSetupOverrides },
    }),
    [
      activeBuild?.id,
      pathId,
      settings,
      setupSelections,
      skillOverrides,
      previewId,
      globalDebuffs,
      enemy,
      statOverrides,
      attunementOverrides,
      buildSetupOverrides,
    ],
  )
  const character = useMemo(
    () => ({
      stats: activeStatState.stats,
      rawStats: activeStatState.rawStats,
      baseStats: activeStatState.baseStats,
      attunementStats: activeStatState.attunement,
      displayedAttunementStats: activeStatState.displayedAttunement,
      settings,
      enemy,
      derivedStats: activeStatState.derivedStats,
      innerWayRevision,
      setupSelections,
      gearStatEffect: activeStatState.gearStatEffect,
      buildSetup: activeStatState.buildSetup,
    }),
    [activeStatState, settings, enemy, innerWayRevision, setupSelections],
  )
  useActiveRotationResult({
    comparisonsActive: activeTab === "main",
    pathId,
    build: activeBuild,
    gearItems: visibleGear,
    measurement: buildMeasurementContext,
    activeRotationId: selectedRotationId,
    defaultRotationId: defaultRotationIdForPath(pathId),
    devMode,
    weapons: settings.weapons,
  })
  const setStatOverride = useOverrideStore(state => state.setStatOverride)
  const resetStatOverride = useOverrideStore(state => state.resetStatOverride)
  const setAttunementOverride = useOverrideStore(state => state.setAttunementOverride)
  const resetAttunementOverride = useOverrideStore(state => state.resetAttunementOverride)
  const setOverrides = useOverrideStore(state => state.setOverrides)
  function updateBuildSetupOverride<K extends keyof BuildSetup>(key: K, value: BuildSetup[K]) {
    setBuildSetupOverrides(current => {
      if (!sameBuildSetupValue(key, value, activeBuildSetup[key])) return { ...current, [key]: value }
      const next = { ...current }
      delete next[key]
      return next
    })
  }
  const resetBuildSetupOverride = (key: keyof BuildSetup) =>
    setBuildSetupOverrides(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
  const applyCharacterProfile = (profile?: CharacterProfile) => {
    setOverrides({
      statOverrides: profile?.statOverrides ?? {},
      attunementOverrides: profile?.attunementOverrides ?? {},
    })
    if (!profile) {
      setBuildSetupOverrides({})
      return
    }
    setBuildSetupOverrides({
      innerWays: profile.innerWays.map(row => ({ ...row })),
      weaponSets: { ...profile.buildSetup.weaponSets },
      armorSets: { ...profile.buildSetup.armorSets },
      bowRingSet: profile.buildSetup.bowRingSet,
      arsenal: profile.buildSetup.arsenal,
    })
  }
  const activateRotationForPath = useCallback(
    (id: string, targetPathId = pathId) => useRotationStore.getState().selectRotationForPath(id, targetPathId),
    [pathId],
  )
  const activeRotationDisplayName = activeResult?.rotationName ?? "—"
  const activateBuildForPath = useCallback(
    (id: string, targetPathId = pathId) => useGearStore.getState().selectBuildForPath(id, targetPathId),
    [pathId],
  )
  const transitionPath = (
    nextPathId: PathId,
    options: { weapons?: [WeaponId, WeaponId]; rotationId?: string } = {},
  ) => {
    if (pathRequiresDev(typedPathDefinitions[nextPathId]) && !devMode) return
    const nextSettings =
      nextPathId === "mixed" && options.weapons
        ? { ...settingsForPath(settings, nextPathId), weapons: [...options.weapons] as [WeaponId, WeaponId] }
        : settingsForPath(settings, nextPathId)
    const nextBuildEntries = visibleBuilds({
      buildState,
      scope,
      pathId: nextPathId,
      buildGroup: typedPathDefinitions[nextPathId].buildGroup,
      weapons: nextSettings.weapons,
      devMode,
    })
    const nextRotationEntries = loadRotationEntries().filter(
      entry => (devMode || !entry.test) && rotationAvailableForWeapons(entry, nextSettings.weapons),
    )
    const selection = resolvePathWorkspaceSelection({
      buildIds: nextBuildEntries.map(entry => entry.id),
      rotationIds: nextRotationEntries.map(entry => entry.id),
      savedBuildId: activeBuildIdsByPath[nextPathId],
      savedRotationId: activeRotationIdsByPath[nextPathId],
      requestedRotationId: options.rotationId,
      defaultBuildId: defaultBuildIdForPath(nextPathId),
      defaultRotationId: defaultRotationIdForPath(nextPathId),
    })
    if (!selection) return

    useDpsStore.getState().supersede()
    // A calculation is keyed by the whole bundle, so another path's results can never be
    // read as this path's, but nothing reaches for them again either. Switching paths
    // forgets them so the cache holds the path in use rather than every path visited.
    if (nextPathId !== pathId) useDpsStore.getState().reset()
    useRotationStore.getState().clear()

    const nextBuildIds = withPathSelection(activeBuildIdsByPath, nextPathId, selection.buildId)
    const nextRotationIds = withPathSelection(activeRotationIdsByPath, nextPathId, selection.rotationId)
    useGearStore.getState().setBuildsByPath(nextBuildIds)
    useGearStore.getState().selectBuildForPath(selection.buildId, nextPathId)
    useRotationStore.getState().setRotationsByPath(nextRotationIds)
    // The path and the settings move together: the settings for a path are derived from it, so
    // storing one without the other would leave a session whose weapons do not fit its path.
    useLoadoutStore.getState().setSettings(nextSettings)
    useLoadoutStore.getState().setPath(nextPathId)
    setInnerWayRevision(current => current + 1)
  }
  const selectPath = (nextPathId: PathId) => transitionPath(nextPathId)
  const selectBuildWeapons = (nextWeapons: [WeaponId, WeaponId], rotationId?: string) => {
    const matchingPath = (Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).find(
      ([candidateId, definition]) =>
        candidateId !== "mixed" &&
        (!pathRequiresDev(definition) || devMode) &&
        definition.lockedWeapons &&
        sameWeaponPair(definition.lockedWeapons, nextWeapons),
    )
    const nextPathId = matchingPath?.[0] ?? "mixed"
    if (!nextPathId) return false
    transitionPath(nextPathId, { weapons: nextWeapons, rotationId })
    return true
  }
  const changeLayoutPreview = (nextLayout: LayoutMode) => {
    useSettingsStore.getState().setLayoutPreview(nextLayout)
  }
  const updateSkillOverrides = (nextOverrides: SkillOverrides) => {
    setSkillOverrides(nextOverrides)
    if (hasSkillOverrides(nextOverrides)) setPersistentItem(skillStorageKey, serializeSkillOverrides(nextOverrides))
    else removePersistentItem(skillStorageKey)
  }
  const changePreview = (nextPreview: PreviewId | null) => {
    setPreviewId(nextPreview)
    persistPreviewSelection(nextPreview)
  }

  useEffect(
    () => setPersistentItem(characterProfileStorageKey, serializeCharacterProfiles(characterProfiles)),
    [characterProfiles],
  )
  // The build a path resolves to is filtered by what that path allows, so it can differ from what
  // is stored for it: a saved build whose weapons no longer fit the path is not offered, and the
  // default takes its place. Recording that is a write, so it belongs in an effect rather than in
  // the render body — a store is shared, and writing to it mid-render would notify subscribers
  // while React is still rendering.
  useEffect(() => {
    if (!activeBuild) return
    const store = useGearStore.getState()
    if (activeBuildIdsByPath[pathId] === activeBuild.id) {
      if (store.buildState.activeBuildId !== activeBuild.id)
        store.updateBuildState(pathId, current => ({ ...current, activeBuildId: activeBuild.id }))
      return
    }
    store.selectBuildForPath(activeBuild.id, pathId)
  }, [activeBuild, activeBuildIdsByPath, pathId])
  useEffect(
    () => setPersistentItem(buildSetupOverrideStorageKey, JSON.stringify(buildSetupOverrides)),
    [buildSetupOverrides],
  )

  return (
    <main
      className={`page-shell layout-${layoutMode} ${layoutMode === "pc" && (activeTab === "build" || activeTab === "rotations") ? "viewport-page-shell" : ""}`}
      data-layout={layoutMode}
    >
      <div className="page-content">
        <header className="page-header">
          <div className="page-header-start">
            <h1>{t("ui.app.brandTitle")}</h1>
            <p className="intro">{t("ui.app.brandIntro")}</p>
            <section className="path-selector" aria-label={t("ui.app.combatPath")}>
              <div className="path-selector-options">
                {(Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).map(
                  ([value, definition]) => {
                    const icon = pathIcons[value]
                    return (
                      <button
                        className={pathId === value ? "selected" : ""}
                        type="button"
                        key={value}
                        aria-pressed={pathId === value}
                        disabled={pathRequiresDev(definition) && !devMode}
                        onClick={() => selectPath(value)}
                      >
                        {icon && <img src={icon} alt="" />}
                        <span>{gameText(definition.name)}</span>
                        {definition.status !== "available" && (
                          <Chip className="path-status-badge">{pathStatusLabel(definition)}</Chip>
                        )}
                      </button>
                    )
                  },
                )}
              </div>
            </section>
          </div>
          <div className="page-header-end">
            <div className="page-header-controls">
              <NoticeArea />
              <AccountBar />
            </div>
            <div className="project-links">
              <a href="bis/">
                <span>{t("ui.app.bisGuide")}</span>
              </a>
            </div>
          </div>
        </header>
        <nav className="main-tabs" aria-label={t("ui.app.mainSections")}>
          <Tab active={activeTab === "main"} onClick={() => setActiveTab("main")}>
            {t("ui.app.main")}
          </Tab>
          <Tab active={activeTab === "build"} onClick={() => setActiveTab("build")}>
            {t("ui.app.build")}
          </Tab>
          <Tab active={activeTab === "breakdown"} onClick={() => setActiveTab("breakdown")}>
            {t("ui.app.dpsBreakdown", {
              dps: activeResult?.metrics.hps ? `${t("system.dps")} / ${t("system.hps")}` : t("system.dps"),
            })}
          </Tab>
          <Tab
            active={activeTab === "rotations"}
            onClick={() => {
              setRotationsMounted(true)
              setActiveTab("rotations")
            }}
          >
            {t("ui.app.rotationEditor")}
          </Tab>
          <Tab
            active={activeTab === "simulation"}
            onClick={() => {
              setSimulationMounted(true)
              setActiveTab("simulation")
            }}
          >
            {t("ui.app.simulation")}
          </Tab>
          <Tab active={activeTab === "skills"} modified={skillEditorModified} onClick={() => setActiveTab("skills")}>
            {t("ui.app.skillEditor")}
          </Tab>
          <Tab active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
            {t("ui.app.settings")}
          </Tab>
        </nav>
        {activeTab === "main" ? (
          <StatsTab
            character={character}
            pathId={pathId}
            statOverrides={statOverrides}
            attunementOverrides={attunementOverrides}
            characterProfiles={characterProfiles}
            buildSetupOverrides={buildSetupOverrides}
            onStatChange={setStatOverride}
            onStatReset={resetStatOverride}
            onAttunementChange={setAttunementOverride}
            onAttunementReset={resetAttunementOverride}
            onApplyCharacterProfile={applyCharacterProfile}
            onCharacterProfilesChange={setCharacterProfiles}
            onBreakthroughChange={breakthrough =>
              useLoadoutStore.getState().setSettings(current => ({ ...current, breakthrough }))
            }
            onBuildSetupChange={updateBuildSetupOverride}
            onBuildSetupReset={resetBuildSetupOverride}
            rotationMetrics={activeResult?.metrics}
            graduationDps={activeResult?.graduation?.dps}
            activeBuildName={activeBuildDisplayName}
            activeRotationName={activeRotationDisplayName}
            onInnerWayChange={() => setInnerWayRevision(current => current + 1)}
            onSetupSelectionChange={(key, value) => useLoadoutStore.getState().setSetupSelection(key, value)}
          />
        ) : activeTab === "build" ? (
          <FeatureLoadBoundary>
            <Suspense fallback={tabSuspenseFallback}>
              <div className="viewport-tab-content">
                <BuildTab
                  pathId={pathId}
                  builds={availableBuildEntries}
                  visibleItems={visibleGear}
                  weapons={settings.weapons}
                  martialArtTags={buildTabMartialArtTags}
                  pathTag={pathId === "mixed" ? undefined : typedPathDefinitions[pathId].tag}
                  graduatedBuildIds={typedPathDefinitions[pathId].graduated}
                  onActiveBuildChange={activateBuildForPath}
                  onSelectBuildWeapons={selectBuildWeapons}
                  measurement={buildMeasurementContext}
                  activeRotation={activeResult?.rotation}
                  activeRotationName={activeRotationDisplayName}
                />
              </div>
            </Suspense>
          </FeatureLoadBoundary>
        ) : activeTab === "breakdown" ? (
          <BreakdownTab metrics={activeResult?.metrics} pathId={pathId} />
        ) : activeTab === "skills" ? (
          <SkillEditorTab
            weapons={settings.weapons}
            overrides={skillOverrides}
            preview={combatDefinitionsFor(previewId)}
            onOverridesChange={updateSkillOverrides}
          />
        ) : activeTab === "settings" ? (
          <SettingsTab
            settings={settings}
            pathId={pathId}
            devMode={layoutDevMode}
            layoutMode={layoutMode}
            previewId={previewId}
            onSettingsChange={next => useLoadoutStore.getState().setSettings(next)}
            onLayoutChange={changeLayoutPreview}
            onPreviewChange={changePreview}
          />
        ) : null}
        {rotationsMounted && (
          <div className={`viewport-tab-content ${activeTab === "rotations" ? "" : "tab-hidden"}`}>
            <FeatureLoadBoundary>
              <Suspense fallback={tabSuspenseFallback}>
                <RotationEditorTab
                  key={pathId}
                  character={character}
                  pathId={pathId}
                  devMode={devMode}
                  active={activeTab === "rotations"}
                  defaultRotationId={defaultRotationIdForPath(pathId)}
                  selectedRotationId={selectedRotationId}
                  skillOverrides={skillOverrides}
                  previewId={previewId}
                  onSelectRotationWeapons={selectBuildWeapons}
                  onActiveRotationChange={activateRotationForPath}
                />
              </Suspense>
            </FeatureLoadBoundary>
          </div>
        )}
        {simulationMounted && (
          <div className={activeTab === "simulation" ? "" : "tab-hidden"}>
            <FeatureLoadBoundary>
              <Suspense fallback={null}>
                <SimulationTab
                  bundle={activeResult?.bundle}
                  bundleKey={activeResult?.bundleKey}
                  rotationName={activeResult ? activeRotationDisplayName : undefined}
                  buildName={activeBuildDisplayName}
                />
              </Suspense>
            </FeatureLoadBoundary>
          </div>
        )}
      </div>
      <footer className="page-footer">
        <span>{t("ui.app.authorGreydustWwmIgnGreydustDiscord")}</span>
        <a className="page-footer-accuracy" href="https://github.com/TTemGP/wwm-calc" target="_blank" rel="noreferrer">
          {t("ui.app.sourceCodeGpl")}
        </a>
      </footer>
    </main>
  )
}
