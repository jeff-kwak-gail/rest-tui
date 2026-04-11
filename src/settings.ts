import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "ini";
import type { HttpResponse } from "./execute-request.js";

const SETTINGS_DIR = ".rest-tui";
const SETTINGS_FILE = "settings.ini";
const REQUEST_HISTORY_FILE = "request-history.json";
const RESPONSE_HISTORY_FILE = "response-history.json";

export interface Settings {
  environment?: string;
  lastFile?: string;
  lastEntry?: number;
}

function ensureSettingsDir(cwd: string): string {
  const dirPath = join(cwd, SETTINGS_DIR);

  try {
    const stat = existsSync(dirPath) ? statSync(dirPath) : null;

    if (stat && stat.isFile()) {
      // Migrate old flat file to directory
      const content = readFileSync(dirPath, "utf-8");
      const tmpPath = dirPath + ".migrating";
      renameSync(dirPath, tmpPath);
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(join(dirPath, SETTINGS_FILE), content, "utf-8");
      unlinkSync(tmpPath);
    } else if (!stat) {
      mkdirSync(dirPath, { recursive: true });
    }
  } catch {
    // Best effort — if migration fails, try to create fresh
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  return dirPath;
}

function settingsPath(cwd: string): string {
  return join(ensureSettingsDir(cwd), SETTINGS_FILE);
}

export function loadSettings(cwd: string): Settings {
  const path = settingsPath(cwd);
  if (!existsSync(path)) return {};

  try {
    const content = readFileSync(path, "utf-8");
    const raw = parse(content) as Record<string, string>;
    const settings: Settings = {};
    if (raw.environment) settings.environment = raw.environment;
    if (raw.lastFile) settings.lastFile = raw.lastFile;
    if (raw.lastEntry !== undefined) settings.lastEntry = Number(raw.lastEntry);
    return settings;
  } catch {
    return {};
  }
}

export function saveSettings(cwd: string, settings: Settings): void {
  const path = settingsPath(cwd);
  writeFileSync(path, stringify(settings), "utf-8");
}

export function loadRequestHistory(cwd: string): string[] {
  const dir = ensureSettingsDir(cwd);
  const path = join(dir, REQUEST_HISTORY_FILE);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

export function saveRequestHistory(cwd: string, history: string[]): void {
  const dir = ensureSettingsDir(cwd);
  writeFileSync(join(dir, REQUEST_HISTORY_FILE), JSON.stringify(history, null, 2), "utf-8");
}

export function loadResponseHistory(cwd: string): HttpResponse[] {
  const dir = ensureSettingsDir(cwd);
  const path = join(dir, RESPONSE_HISTORY_FILE);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

export function saveResponseHistory(cwd: string, history: HttpResponse[]): void {
  const dir = ensureSettingsDir(cwd);
  writeFileSync(join(dir, RESPONSE_HISTORY_FILE), JSON.stringify(history, null, 2), "utf-8");
}
