/** Every generated artefact is `<plugin>-<source name>` (ADR 0003). */
export const MAX_NAME_LENGTH = 64;

const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

/** Reasons a source name cannot be part of an artefact name, or `undefined` when it can. */
export function segmentProblem(value: string): string | undefined {
  if (value.length === 0) return "is empty";
  if (value.length > MAX_NAME_LENGTH) return `is longer than ${MAX_NAME_LENGTH} characters`;
  if (!SEGMENT.test(value))
    return "must be lowercase letters, digits and dashes, not starting with a dash";
  return undefined;
}

/** A plugin name is a segment too; foreign names are folded into one rather than rejected. */
export function foldSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .slice(0, MAX_NAME_LENGTH)
      .replace(/-+$/, "") || "plugin"
  );
}

export function namespaced(plugin: string, name: string): string {
  return `${foldSegment(plugin)}-${foldSegment(name)}`;
}
