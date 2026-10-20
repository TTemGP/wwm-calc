import { useState } from "react"

import { t } from "@/i18n"
import { Button } from "@/ui/Button"
import { Dialog } from "@/ui/Dialog"

import { renderBisTableImage, type BisImageInput } from "./bisTableImage"

// 연운 딜 계산기: 빌드 조율표 이미지를 그려서 보여 주고, 저장하거나 클립보드로 복사해요.

type BisImageExportModalProps = { input?: BisImageInput; fileName: string; onClose: () => void }

export function BisImageExportModal({ input, fileName, onClose }: BisImageExportModalProps) {
  const [image, setImage] = useState<{ source: BisImageInput; url: string }>()
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState<BisImageInput>()
  if (input && image?.source !== input && pending !== input) {
    setPending(input)
    setStatus("")
    void renderBisTableImage(input).then(canvas => setImage({ source: input, url: canvas.toDataURL("image/png") }))
  }
  const current = image && image.source === input ? image : undefined

  function save() {
    if (!current) return
    const link = document.createElement("a")
    link.href = current.url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function copy() {
    if (!current) return
    try {
      const blob = await (await fetch(current.url)).blob()
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      setStatus(t("ui.buildTab.bisExportCopied"))
    } catch {
      setStatus(t("ui.buildTab.bisExportCopyFailed"))
    }
  }

  return (
    <Dialog
      open={Boolean(input)}
      onClose={onClose}
      className="gear-ocr-dialog bis-image-dialog"
      label={t("ui.buildTab.bisExportTitle")}
    >
      <div className="gear-ocr-heading">
        <div>
          <h2>{t("ui.buildTab.bisExportTitle")}</h2>
          <p>{t("ui.buildTab.bisExportHint")}</p>
        </div>
        <Button variant="secondary" size="small" type="button" onClick={onClose}>
          {t("ui.buildTab.close")}
        </Button>
      </div>
      {current && <img className="bis-export-image" src={current.url} alt={t("ui.buildTab.bisExportTitle")} />}
      <div className="official-import-actions">
        {status && <span className="bis-export-status">{status}</span>}
        <Button variant="secondary" type="button" onClick={() => void copy()}>
          {t("ui.buildTab.bisExportCopy")}
        </Button>
        <Button variant="primary" type="button" onClick={save}>
          {t("ui.buildTab.bisExportSave")}
        </Button>
      </div>
    </Dialog>
  )
}
