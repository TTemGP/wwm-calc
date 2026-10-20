import { useRef, useState, type ChangeEvent, type ClipboardEvent as ReactClipboardEvent, type DragEvent } from "react"

import {
  bisTableSlotOrder,
  gearItemsFromBisDraft,
  interpretBisTable,
  slotAffixOptions,
  slotAttunementOptions,
  type BisDraft,
  type BisDraftProblem,
  type BisImageReading,
  type BisImportContext,
} from "@/bisTableImport"
import { attunementData, gearData, gearDefinitionForSlot, type GearSlot } from "@/gear"
import { dataText, gameText, t } from "@/i18n"
import { Button } from "@/ui/Button"
import { Dialog } from "@/ui/Dialog"

// 연운 딜 계산기: BiS 조율표 이미지를 읽어 확인 화면을 보여 주고, 고친 내용으로 새 빌드를 만들어요.

type BisImageImportModalProps = {
  open: boolean
  context: BisImportContext
  onClose: () => void
  onCreate: (input: {
    name: string
    items: (idForSlot: (slot: GearSlot) => string) => ReturnType<typeof gearItemsFromBisDraft>
  }) => void
}

function slotLabel(slot: GearSlot, context: BisImportContext) {
  const { definition } = gearDefinitionForSlot(slot, context.weapons)
  if (definition?.weapon) return gameText(definition.name) || slot
  return dataText(`system.gearSlot.${slot}`, gearData.slots[slot])
}

function problemText(reason: BisDraftProblem["reason"]) {
  switch (reason) {
    case "missing":
      return t("ui.buildTab.bisImageProblemMissing")
    case "base":
      return t("ui.buildTab.bisImageProblemBase")
    case "duplicate":
      return t("ui.buildTab.bisImageProblemDuplicate")
    case "attunement":
      return t("ui.buildTab.bisImageProblemAttunement")
  }
}

const affixName = (key: string) => gameText(gearData.affixes[key]?.name ?? key)
const attunementName = (key: string) => gameText(attunementData[key]?.name ?? key)

export function BisImageImportModal({ open, context, onClose, onCreate }: BisImageImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState("")
  const [reading, setReading] = useState<BisImageReading>()
  const [tableIndex, setTableIndex] = useState(0)
  const [draft, setDraft] = useState<BisDraft>()
  const [name, setName] = useState("")
  const [problems, setProblems] = useState<BisDraftProblem[]>([])
  const [wasOpen, setWasOpen] = useState(open)
  if (open && !wasOpen) {
    setWasOpen(true)
    setReading(undefined)
    setDraft(undefined)
    setProblems([])
    setError("")
    setProgress(0)
  }
  if (!open && wasOpen) setWasOpen(false)

  function chooseTable(source: BisImageReading, index: number) {
    const table = source.tables[index]
    if (!table) return
    setTableIndex(index)
    setDraft(interpretBisTable(table, source.headerText, context))
    setName(
      table.label ? t("ui.buildTab.bisImageBuildName", { label: table.label }) : t("ui.buildTab.bisImageDefaultName"),
    )
    setProblems([])
  }

  async function readImage(file?: File) {
    if (!file || busy) return
    if (file.size > 15 * 1024 * 1024) {
      setError(t("ui.buildTab.imageTooLargeError"))
      return
    }
    setError("")
    setBusy(true)
    setProgress(0)
    setPreview(current => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(file)
    })
    try {
      const { readBisTableImage, BisTableNotFoundError } = await import("@/bisTableOcr")
      try {
        const result = await readBisTableImage(file, (done, total) => setProgress(done / total))
        setReading(result)
        chooseTable(result, 0)
      } catch (caught) {
        setError(
          caught instanceof BisTableNotFoundError
            ? t("ui.buildTab.bisImageNoTable")
            : t("ui.buildTab.imageImportError"),
        )
      }
    } catch {
      setError(t("ui.buildTab.imageImportError"))
    } finally {
      setBusy(false)
    }
  }

  function updateLine(slot: GearSlot, row: number, key: string) {
    if (!draft) return
    const slots = { ...draft.slots }
    const lines = slots[slot].lines.map((line, index) =>
      index === row ? { ...line, key: key || undefined, guessed: false } : line,
    )
    slots[slot] = { ...slots[slot], lines }
    setDraft({ ...draft, slots })
    setProblems([])
  }

  function updateAttunement(slot: GearSlot, key: string) {
    if (!draft) return
    setDraft({
      ...draft,
      slots: { ...draft.slots, [slot]: { ...draft.slots[slot], attunement: key, attunementGuessed: false } },
    })
    setProblems([])
  }

  function create() {
    if (!draft) return
    const check = gearItemsFromBisDraft(draft, context, slot => `check:${slot}`)
    if ("problems" in check) {
      setProblems(check.problems)
      return
    }
    onCreate({
      name: name.trim() || t("ui.buildTab.bisImageDefaultName"),
      items: idForSlot => gearItemsFromBisDraft(draft, context, idForSlot),
    })
    onClose()
  }

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    void readImage(event.target.files?.[0])
    event.target.value = ""
  }
  const dropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    void readImage(event.dataTransfer.files?.[0])
  }
  const pasteImage = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const file = Array.from(event.clipboardData.files).find(candidate => candidate.type.startsWith("image/"))
    if (!file) return
    event.preventDefault()
    void readImage(file)
  }
  const problemFor = (slot: GearSlot) => problems.find(problem => problem.slot === slot)

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      onCancel={event => {
        if (busy) event.preventDefault()
      }}
      className="gear-ocr-dialog bis-image-dialog"
      label={t("ui.buildTab.bisImageTitle")}
    >
      <div onPaste={pasteImage}>
        <div className="gear-ocr-heading">
          <div>
            <h2>{t("ui.buildTab.bisImageTitle")}</h2>
            <p>{t("ui.buildTab.bisImageHint")}</p>
          </div>
          <Button variant="secondary" size="small" type="button" disabled={busy} onClick={onClose}>
            {t("ui.buildTab.close")}
          </Button>
        </div>
        {!draft && (
          <div className="gear-ocr-dropzone" onDragOver={event => event.preventDefault()} onDrop={dropFile}>
            {preview ? (
              <img src={preview} alt={t("ui.buildTab.bisImagePreview")} />
            ) : (
              <div>
                <strong>{t("ui.buildTab.dropAScreenshotOrDirectlyPaste")}</strong>
                <span>{t("ui.buildTab.pressCtrlVOrUsePngJpegOr")}</span>
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={selectFile} hidden />
            <Button variant="primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
              {preview ? t("ui.buildTab.chooseAnotherImage") : t("ui.buildTab.chooseImage")}
            </Button>
          </div>
        )}
        {busy && (
          <div className="gear-ocr-progress" aria-live="polite">
            <div>
              <span>{t("ui.buildTab.bisImageReading")}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <progress max={1} value={progress} />
          </div>
        )}
        {error && (
          <p className="bis-image-error" role="alert">
            {error}
          </p>
        )}
        {draft && reading && (
          <div className="bis-image-review">
            {reading.tables.length > 1 && (
              <label className="bis-image-field">
                <span>{t("ui.buildTab.bisImageTable")}</span>
                <select value={tableIndex} onChange={event => chooseTable(reading, Number(event.target.value))}>
                  {reading.tables.map((table, index) => (
                    <option key={`${index}:${table.label}`} value={index}>
                      {table.label || t("ui.buildTab.bisImageTableNumber", { number: index + 1 })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="bis-image-field">
              <span>{t("ui.buildTab.bisImageName")}</span>
              <input value={name} onChange={event => setName(event.target.value)} />
            </label>
            <p className="build-compare-hint">{t("ui.buildTab.bisImageReviewHint")}</p>
            <div className="build-compare-table-wrap">
              <table className="bis-image-table">
                <thead>
                  <tr>
                    <th scope="col">{t("ui.buildTab.bisImageLine")}</th>
                    {bisTableSlotOrder.map(slot => (
                      <th key={slot} scope="col">
                        {slotLabel(slot, context)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4].map(row => (
                    <tr key={row}>
                      <th scope="row">
                        {row === 0
                          ? t("ui.buildTab.bisImageBaseLine")
                          : t("ui.buildTab.bisImageExtraLine", { number: row })}
                      </th>
                      {bisTableSlotOrder.map(slot => {
                        const line = draft.slots[slot].lines[row]
                        const options = slotAffixOptions(slot, context)
                        const keys = Array.from(new Set([...options.base, ...options.additional]))
                        return (
                          <td
                            key={slot}
                            className={!line.key ? "bis-image-missing" : line.guessed ? "bis-image-guessed" : ""}
                          >
                            <select
                              aria-label={`${slotLabel(slot, context)} ${row + 1}`}
                              title={line.text ? t("ui.buildTab.bisImageReadAs", { text: line.text }) : undefined}
                              value={line.key ?? ""}
                              onChange={event => updateLine(slot, row, event.target.value)}
                            >
                              <option value="">{line.text ? `? ${line.text}` : "?"}</option>
                              {keys.map(key => (
                                <option key={key} value={key}>
                                  {affixName(key)}
                                </option>
                              ))}
                            </select>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">{t("ui.buildTab.compareAttunement")}</th>
                    {bisTableSlotOrder.map(slot => {
                      const draftSlot = draft.slots[slot]
                      return (
                        <td key={slot} className={draftSlot.attunementGuessed ? "bis-image-guessed" : ""}>
                          <select
                            aria-label={`${slotLabel(slot, context)} ${t("ui.buildTab.compareAttunement")}`}
                            value={draftSlot.attunement ?? ""}
                            onChange={event => updateAttunement(slot, event.target.value)}
                          >
                            {slotAttunementOptions(slot, context).map(key => (
                              <option key={key} value={key}>
                                {attunementName(key)}
                              </option>
                            ))}
                          </select>
                        </td>
                      )
                    })}
                  </tr>
                  {problems.length > 0 && (
                    <tr>
                      <th scope="row">{t("ui.buildTab.bisImageProblem")}</th>
                      {bisTableSlotOrder.map(slot => {
                        const problem = problemFor(slot)
                        return (
                          <td key={slot} className="bis-image-problem">
                            {problem ? problemText(problem.reason) : ""}
                          </td>
                        )
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="official-import-actions">
              <Button variant="secondary" type="button" onClick={() => setDraft(undefined)}>
                {t("ui.buildTab.chooseAnotherImage")}
              </Button>
              <Button variant="primary" type="button" onClick={create}>
                {t("ui.buildTab.bisImageCreate")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
