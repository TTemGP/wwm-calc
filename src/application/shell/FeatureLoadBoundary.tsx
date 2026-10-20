import { Component, type ReactNode } from "react"

import { isDeploymentImportError } from "../../deploymentUpdates"
import { t } from "../../i18n"

export class FeatureLoadBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: undefined as unknown }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  render() {
    if (this.state.error) {
      if (!isDeploymentImportError(this.state.error)) throw this.state.error
      return <p role="alert">{t("ui.deployment.featureUnavailable")}</p>
    }
    return this.props.children
  }
}
