/** How much the app logs: each level also logs every level above it. */
export type TatolabAppLogLevel = "error" | "warn" | "info" | "debug";

/** Fields logged beside a message, as `key=value`. */
export type TatolabAppLogFields = Readonly<Record<string, string | number | boolean | null>>;

/** The app's one log, the main process's stand-in for Rust's `tracing`. */
export interface TatolabAppLog {
  error(message: string, fields?: TatolabAppLogFields): void;
  warn(message: string, fields?: TatolabAppLogFields): void;
  info(message: string, fields?: TatolabAppLogFields): void;
  debug(message: string, fields?: TatolabAppLogFields): void;
}

const LOG_LEVELS_BY_VERBOSITY: readonly TatolabAppLogLevel[] = ["error", "warn", "info", "debug"];

/** The level `TATOLAB_APP_LOG` names, or `info` when it names none. */
export function tatolabAppLogLevelNamed(levelName: string | undefined): TatolabAppLogLevel {
  return LOG_LEVELS_BY_VERBOSITY.find((logLevel) => logLevel === levelName) ?? "info";
}

/** One log line: the level, the message, then each field as `key=value`, quoted when it holds a space. */
export function formatTatolabAppLogLine(level: TatolabAppLogLevel, message: string, fields: TatolabAppLogFields): string {
  const formattedFields = Object.entries(fields).map(([fieldName, fieldValue]) => {
    const fieldText = String(fieldValue);
    return `${fieldName}=${/\s/.test(fieldText) ? JSON.stringify(fieldText) : fieldText}`;
  });
  return [level.toUpperCase().padStart(5), message, ...formattedFields].join(" ");
}

/** A log writing each line at or above `mostVerboseLevel` to `writeLogLine`. */
export function createTatolabAppLog(
  mostVerboseLevel: TatolabAppLogLevel,
  writeLogLine: (logLine: string) => void,
): TatolabAppLog {
  const mostVerboseIndex = LOG_LEVELS_BY_VERBOSITY.indexOf(mostVerboseLevel);
  const logAt = (level: TatolabAppLogLevel) => (message: string, fields: TatolabAppLogFields = {}) => {
    if (LOG_LEVELS_BY_VERBOSITY.indexOf(level) <= mostVerboseIndex) writeLogLine(formatTatolabAppLogLine(level, message, fields));
  };
  return { error: logAt("error"), warn: logAt("warn"), info: logAt("info"), debug: logAt("debug") };
}

/** The app's log to standard error, at the level `TATOLAB_APP_LOG` names. */
export function createTatolabAppLogToStandardError(): TatolabAppLog {
  return createTatolabAppLog(tatolabAppLogLevelNamed(process.env["TATOLAB_APP_LOG"]), (logLine) => {
    process.stderr.write(`${logLine}\n`);
  });
}
