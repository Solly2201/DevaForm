/**
 * Serialization + migration.
 *
 * A persisted character stores { schemaVersion, ...config }. When the schema
 * evolves, add a migration step from N to N+1 in MIGRATIONS. Deserialization
 * runs pending migrations, then validates strictly — a stored order remains
 * loadable and reproducible forever.
 */
import {
  SCHEMA_VERSION,
  characterConfigurationSchema,
  type CharacterConfiguration,
} from "./configuration";

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by *source* version: MIGRATIONS[1] migrates v1 -> v2. */
const MIGRATIONS: Record<number, Migration> = {};

export class ConfigurationParseError extends Error {
  constructor(
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ConfigurationParseError";
  }
}

export function serializeConfiguration(config: CharacterConfiguration): string {
  return JSON.stringify(config);
}

export function deserializeConfiguration(json: string | unknown): CharacterConfiguration {
  let raw: unknown = json;
  if (typeof json === "string") {
    try {
      raw = JSON.parse(json);
    } catch {
      throw new ConfigurationParseError("Configuration is not valid JSON");
    }
  }
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigurationParseError("Configuration must be an object");
  }

  let data = raw as Record<string, unknown>;
  let version = typeof data.schemaVersion === "number" ? data.schemaVersion : NaN;
  if (!Number.isInteger(version) || version < 1) {
    throw new ConfigurationParseError("Configuration is missing a valid schemaVersion");
  }
  if (version > SCHEMA_VERSION) {
    throw new ConfigurationParseError(
      `Configuration schemaVersion ${version} is newer than supported version ${SCHEMA_VERSION}`,
    );
  }
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      throw new ConfigurationParseError(`No migration path from schema version ${version}`);
    }
    data = migrate(data);
    version = version + 1;
    data.schemaVersion = version;
  }

  const result = characterConfigurationSchema.safeParse(data);
  if (!result.success) {
    throw new ConfigurationParseError("Configuration failed validation", result.error.issues);
  }
  return result.data;
}
