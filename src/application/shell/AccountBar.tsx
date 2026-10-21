import { useSyncExternalStore } from "react"

import {
  chooseLocalData,
  chooseRemoteData,
  cloudProviders,
  getCloudState,
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

  return (
    <div className="account-bar">
      <span className="account-status">
        <strong>{cloud.name || t("ui.account.signedIn")}</strong>
        {status && ` · ${status}`}
      </span>
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
