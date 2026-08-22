import type { CommandResult } from "./types.js";

export interface OutputWriter {
  readonly info: (message: string) => void;
  readonly error: (message: string) => void;
}

export const consoleWriter: OutputWriter = {
  info: (message) => console.info(message),
  error: (message) => console.error(message),
};

export function writeResult(
  result: CommandResult,
  json: boolean,
  writer: OutputWriter = consoleWriter,
): void {
  if (json) {
    writer.info(JSON.stringify(result, null, 2));
    return;
  }

  const marker = result.ok ? "OK" : "ERROR";
  writer.info(`[${marker}] ${result.summary}`);
  if (Array.isArray(result.data)) {
    for (const item of result.data) writer.info(formatItem(item));
  }
}

function formatItem(item: unknown): string {
  if (typeof item === "string") return `- ${item}`;
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;
    const label = record.name ?? record.path ?? record.rule ?? record.operation;
    if (typeof label === "string") return `- ${label}`;
  }
  return `- ${JSON.stringify(item)}`;
}
