import { useCallback, useEffect, useRef, useState } from "react"

import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import { startSimulation, type SimulationTask } from "@/calculations/simulationWorkerClient"
import { t } from "@/i18n"
import { dismissNotice, publishNotice } from "@/notices"

import { createSimulationRecord, type SimulationRecord } from "./simulationResults"

type SimulationRun = {
  bundle?: RotationSimulationBundle
  bundleKey?: string
  rotationName?: string
  buildName?: string
}

/** The cancellation a stopped run reports, which is not a failure worth showing the user. */
const cancelledMessage = "Simulation cancelled"

/**
 * Running simulations, and the results they produced.
 *
 * The task is held in a ref rather than in state because it is not something to render: it is
 * the handle used to cancel, and putting it in state would re-render the tab every time a run
 * started. The ref is cleared on unmount, so navigating away from the tab stops the worker rather
 * than leaving it running against a bundle nobody is looking at.
 */
export function useSimulationRun({ bundle, bundleKey, rotationName, buildName }: SimulationRun) {
  const [records, setRecords] = useState<SimulationRecord[]>([])
  const [progress, setProgress] = useState({ completed: 0, total: 100 })
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const taskRef = useRef<SimulationTask | null>(null)
  const nextRecordIdRef = useRef(1)

  useEffect(() => () => taskRef.current?.cancel(), [])

  const run = useCallback(
    async (count: string) => {
      if (running) {
        taskRef.current?.cancel()
        return
      }
      const runCount = Number(count)
      if (!bundle || !Number.isSafeInteger(runCount) || runCount < 1) {
        setError(bundle ? t("ui.simulationTab.invalidCountError") : t("ui.simulationTab.rotationPreparingError"))
        return
      }
      setError("")
      dismissNotice("simulation")
      setProgress({ completed: 0, total: runCount })
      setRunning(true)
      const task = startSimulation(bundle, runCount, (completed, total) => setProgress({ completed, total }))
      taskRef.current = task
      try {
        const summary = await task.promise
        const record = createSimulationRecord(nextRecordIdRef.current, summary, { bundleKey, rotationName, buildName })
        nextRecordIdRef.current += 1
        setRecords(current => [record, ...current])
      } catch (taskError) {
        if (taskError instanceof Error && taskError.message !== cancelledMessage) {
          publishNotice({ id: "simulation", error: true, message: taskError.message })
        }
      } finally {
        if (taskRef.current === task) taskRef.current = null
        setRunning(false)
      }
    },
    [bundle, bundleKey, buildName, rotationName, running],
  )

  const removeRecord = useCallback((id: number) => {
    setRecords(current => current.filter(record => record.id !== id))
  }, [])

  return { records, progress, running, error, run, removeRecord }
}
