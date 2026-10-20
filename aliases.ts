import { fileURLToPath } from "node:url"

// Import aliases shared by the dev, build, test, and probe pipelines so they cannot drift.
// `@` reaches src and `@gamedata` reaches the JSON game data, matching the `paths`
// entries in tsconfig.app.json. A string alias only matches the prefix on a `/` boundary,
// so a scoped package such as `@tabler/icons-react` is left alone.
export const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@gamedata": fileURLToPath(new URL("./data", import.meta.url)),
}
