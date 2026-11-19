/** A `---` block split off the top of a markdown file, with everything below it. */
export interface SplitDocument {
  /** Frontmatter fields as raw strings, in file order. Empty when the file has no block. */
  fields: [string, string][];
  body: string;
  /** True when the file started with a `---` line and had a closing one. */
  hasFrontmatter: boolean;
}

export function splitFrontmatter(text: string): SplitDocument {
  const normalised = text.replace(/\r\n/g, "\n");
  if (!normalised.startsWith("---\n"))
    return { fields: [], body: normalised, hasFrontmatter: false };

  const end = normalised.indexOf("\n---", 3);
  if (end === -1) return { fields: [], body: normalised, hasFrontmatter: false };

  const block = normalised.slice(4, end);
  const body = normalised.slice(end + 4).replace(/^\n+/, "");
  const fields: [string, string][] = [];
  let key: string | undefined;
  let value: string[] = [];

  const flush = () => {
    if (key !== undefined) fields.push([key, value.join("\n").trim()]);
    key = undefined;
    value = [];
  };

  for (const line of block.split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined) {
      flush();
      key = match[1];
      value = [match[2] ?? ""];
    } else if (key !== undefined) {
      // Continuation of a quoted or folded scalar.
      value.push(line);
    }
  }
  flush();

  return { fields, body, hasFrontmatter: true };
}

/** Frontmatter and body back into one file, with a trailing newline. */
export function joinFrontmatter(fields: readonly [string, string][], body: string): string {
  if (fields.length === 0) return body.endsWith("\n") ? body : `${body}\n`;
  const block = fields.map(([key, value]) => `${key}: ${value}`).join("\n");
  const trimmed = body.replace(/^\n+/, "");
  return `---\n${block}\n---\n\n${trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`}`;
}

export function field(fields: readonly [string, string][], key: string): string | undefined {
  return fields.find(([name]) => name === key)?.[1];
}

/** A quoted scalar without its quotes; anything else unchanged. */
export function unquote(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const quoted = /^"(.*)"$/s.exec(trimmed) ?? /^'(.*)'$/s.exec(trimmed);
  return quoted?.[1] ?? trimmed;
}
