import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./styles/index.css"
import "@fontsource-variable/noto-sans/wght.css"
import "@fontsource-variable/noto-sans-tc/wght.css"
import "@fontsource-variable/noto-sans-kr/wght.css"
import App from "./App"
import { startCloudSync } from "./cloudSync"
import { startDeploymentUpdates } from "./deploymentUpdates"
import { initializeI18n } from "./i18n"
import { migrateSessionStorage } from "./persistentStorage"

import "./styles/tokens.css"
import "./styles/base.css"
import "./styles/layout.css"
import "./styles/components/buttons.css"
import "./styles/components/forms.css"
import "./styles/components/panels.css"
import "./styles/components/dialogs.css"
import "./styles/components/tables.css"
import "./styles/domains/stats.css"
import "./styles/domains/gear.css"
import "./styles/domains/rotations.css"
import "./styles/domains/skills.css"
import "./styles/domains/simulations.css"
import "./styles/mobile.css"
import "./styles/theme-yeonun.css"

migrateSessionStorage()
startDeploymentUpdates()
void startCloudSync()
await initializeI18n()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
