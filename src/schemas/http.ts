import * as v from "valibot"

export const localeManifestSchema = v.object({
  default: v.string(),
  locales: v.array(v.string()),
  completion: v.optional(v.record(v.string(), v.pipe(v.number(), v.finite()))),
})

export const localeMessagesSchema = v.record(v.string(), v.string())
export const deploymentVersionSchema = v.object({ version: v.string() })

export type LocaleManifest = v.InferOutput<typeof localeManifestSchema>
export type LocaleMessages = v.InferOutput<typeof localeMessagesSchema>
export type DeploymentVersion = v.InferOutput<typeof deploymentVersionSchema>
