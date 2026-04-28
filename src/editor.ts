import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function openInEditor(filePath: string, line?: number): string {
  const editor = process.env.EDITOR || "vim";
  const args = line ? [`+${line}`, filePath] : [filePath];
  spawnSync(editor, args, { stdio: "inherit" });
  return readFileSync(filePath, "utf-8");
}

export function openContentInEditor(content: string, extension: string = "txt"): void {
  const filePath = join(
    tmpdir(),
    `rest-tui-response-${process.pid}-${Date.now()}.${extension}`
  );
  writeFileSync(filePath, content, "utf-8");
  try {
    const editor = process.env.EDITOR || "vim";
    spawnSync(editor, [filePath], { stdio: "inherit" });
  } finally {
    try {
      unlinkSync(filePath);
    } catch {
      // best effort
    }
  }
}
