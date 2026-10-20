import { useState } from "react"

import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import { Panel } from "@/ui/Panel"

import { SimulationPercentileEditor } from "./SimulationPercentileEditor"
import { SimulationProgress } from "./SimulationProgress"
import { SimulationResultCard } from "./SimulationResultCard"
import { SimulationRunControls } from "./SimulationRunControls"
import { useCustomPercentiles } from "./useCustomPercentiles"
import { useSimulationRun } from "./useSimulationRun"

type SimulationTabProps = {
  bundle?: RotationSimulationBundle
  bundleKey?: string
  rotationName?: string
  buildName?: string
}

/**
 * The simulation tab: run the active rotation many times and compare the spread of the results.
 *
 * This is the composition only. What a run is, how the percentiles are stored and rejected, and
 * how the results are turned into rows each live in their own module, so what is left here is
 * the order the pieces appear in.
 */
export default function SimulationTab({ bundle, bundleKey, rotationName, buildName }: SimulationTabProps) {
  const [count, setCount] = useState("100")
  const percentiles = useCustomPercentiles()
  const { records, progress, running, error, run, removeRecord } = useSimulationRun({
    bundle,
    bundleKey,
    rotationName,
    buildName,
  })

  return (
    <Panel className="simulation-panel">
      <SimulationRunControls
        count={count}
        disabled={!bundle && !running}
        running={running}
        onCountChange={setCount}
        onRun={() => void run(count)}
      />
      <SimulationPercentileEditor disabled={running} editor={percentiles} />
      {running && <SimulationProgress completed={progress.completed} total={progress.total} />}
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
      {records.length > 0 && (
        <div className="simulation-history">
          {records.map(record => (
            <SimulationResultCard
              key={record.id}
              record={record}
              customPercentiles={percentiles.customPercentiles}
              currentBundleKey={bundleKey ?? ""}
              onDelete={removeRecord}
            />
          ))}
        </div>
      )}
    </Panel>
  )
}
