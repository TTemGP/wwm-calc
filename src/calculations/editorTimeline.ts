import {
  buildRotationTimeline,
  type TimelineBuildInput,
  type TimelineRow,
  type RotationRecord,
} from "./rotationTimeline"

export type EditorTimelineResult = { rotation: RotationRecord; timeline: TimelineRow[]; fingerprint: string }

/** Worker-only construction from authored input, using the baseline's live combat rules. */
export function calculateEditorTimeline(input: TimelineBuildInput) {
  return { rotation: input.rotation, timeline: buildRotationTimeline(input) }
}
