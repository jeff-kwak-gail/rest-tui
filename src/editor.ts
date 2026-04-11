import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function openInEditor(filePath: string, line?: number): string {
  const editor = process.env.EDITOR || "vim";
  const args = line ? [`+${line}`, filePath] : [filePath];
  spawnSync(editor, args, { stdio: "inherit" });
  return readFileSync(filePath, "utf-8");
}
