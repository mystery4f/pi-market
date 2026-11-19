/**
 * A skill inside a plugin, as found on disk. `dir` is absolute so the converter never has to
 * re-derive it from the plugin root.
 */
export interface SkillRef {
  name: string;
  dir: string;
}

/** A command file inside a plugin. Only top-level `commands/*.md` count. */
export interface CommandRef {
  name: string;
  file: string;
}

export interface PluginModel {
  name: string;
  description?: string;
  version?: string;
  skills: SkillRef[];
  commands: CommandRef[];
}

/** What one adapter read out of a source: plugins, their skills and their commands. */
export interface SourceModel {
  /** Id of the adapter that produced this model. */
  adapter: string;
  /** Absolute path the model was read from. */
  root: string;
  plugins: PluginModel[];
  /**
   * Things the adapter saw and deliberately left alone — an unsupported plugin source, a
   * plugin directory named in the marketplace that is not there. Surfaced, never thrown.
   */
  notes: string[];
}

export interface Detection {
  matched: boolean;
  /** Why it matched or not, in one clause, so `market_doctor` can explain a decision. */
  reason: string;
}

export interface ReadOptions {
  /** Plugin names to read. Absent means every plugin the source declares. */
  plugins?: readonly string[];
}

/**
 * One source format. An adapter answers two questions and nothing else: is this root mine, and
 * what is in it. Naming, rewriting and collisions belong to the converter (ADR 0002).
 */
export interface SourceAdapter {
  readonly id: string;
  detect(root: string): Promise<Detection>;
  read(root: string, options?: ReadOptions): Promise<SourceModel>;
}
