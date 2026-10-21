import { useState, useSyncExternalStore, type FormEvent } from "react"

import {
  chooseLocalData,
  chooseRemoteData,
  cloudProviders,
  getCloudState,
  maxNicknameLength,
  setNickname,
  signIn,
  signOut,
  subscribeToCloud,
  type CloudStatus,
} from "../../cloudSync"
import { t } from "../../i18n"
import { Button } from "../../ui/Button"

function statusText(status: CloudStatus) {
  switch (status) {
    case "syncing":
      return t("ui.account.syncing")
    case "saved":
    case "synced":
      return t("ui.account.synced")
    case "failed":
      return t("ui.account.failed")
    case "signInFailed":
      return t("ui.account.signInFailed")
    default:
      return ""
  }
}

export function AccountBar() {
  const cloud = useSyncExternalStore(subscribeToCloud, getCloudState)
  const [draft, setDraft] = useState<string | null>(null)
  if (!cloud.enabled) return null
  const status = statusText(cloud.status)

  if (cloud.name === null) {
    return (
      <div className="account-bar">
        {status && <span className="account-status">{status}</span>}
        {cloudProviders.map(provider => (
          <Button key={provider.id} size="small" onClick={() => void signIn(provider.id)}>
            {t("ui.account.signIn", { provider: provider.label })}
          </Button>
        ))}
      </div>
    )
  }

  if (draft !== null) {
    const save = async (event: FormEvent) => {
      event.preventDefault()
      if (await setNickname(draft)) setDraft(null)
    }
    return (
      <form className="account-bar" onSubmit={event => void save(event)}>
        <label className="account-status" htmlFor="account-nickname">
          {t("ui.account.nickname")}
        </label>
        <input
          id="account-nickname"
          className="account-nickname"
          value={draft}
          maxLength={maxNicknameLength}
          required
          onChange={event => setDraft(event.target.value)}
        />
        <Button type="submit" size="small" variant="primary">
          {t("ui.account.saveNickname")}
        </Button>
        <Button size="small" onClick={() => setDraft(null)}>
          {t("ui.account.cancel")}
        </Button>
      </form>
    )
  }

  return (
    <div className="account-bar">
      <span className="account-status">
        <strong>{cloud.name || t("ui.account.signedIn")}</strong>
        {status && ` · ${status}`}
      </span>
      <Button size="small" onClick={() => setDraft(cloud.name ?? "")}>
        {t("ui.account.changeNickname")}
      </Button>
      <Button size="small" onClick={() => void signOut()}>
        {t("ui.account.signOut")}
      </Button>
      {cloud.status === "conflict" && (
        <div className="account-conflict" role="alert">
          <p>{t("ui.account.conflict")}</p>
          <Button size="small" variant="primary" onClick={chooseRemoteData}>
            {t("ui.account.useAccount")}
          </Button>
          <Button size="small" onClick={() => void chooseLocalData()}>
            {t("ui.account.useDevice")}
          </Button>
        </div>
      )}
    </div>
  )
}
