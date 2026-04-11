import chalk from "chalk";
import cliTruncate from "cli-truncate";
import stringWidth from "string-width";

function buildScrollbar(
  totalLines: number,
  visibleHeight: number,
  scrollOffset: number
): string[] {
  const cells: string[] = [];
  if (totalLines > visibleHeight) {
    const thumbSize = Math.max(
      1,
      Math.round((visibleHeight / totalLines) * visibleHeight)
    );
    const maxOffset = totalLines - visibleHeight;
    const thumbPos = Math.round(
      (scrollOffset / maxOffset) * (visibleHeight - thumbSize)
    );
    for (let i = 0; i < visibleHeight; i++) {
      if (i >= thumbPos && i < thumbPos + thumbSize) {
        cells.push(chalk.gray("┃"));
      } else {
        cells.push(chalk.gray.dim("│"));
      }
    }
  } else {
    for (let i = 0; i < visibleHeight; i++) {
      cells.push(" ");
    }
  }
  return cells;
}

function padLine(line: string, targetWidth: number): string {
  const truncated = cliTruncate(line || " ", targetWidth, {
    position: "end",
  });
  const visWidth = stringWidth(truncated);
  const padding = Math.max(0, targetWidth - visWidth);
  return truncated + " ".repeat(padding);
}

export function renderPane(
  lines: string[],
  scrollOffset: number,
  visibleHeight: number,
  contentWidth: number,
  totalLines: number
): string {
  const visible = lines.slice(scrollOffset, scrollOffset + visibleHeight);
  while (visible.length < visibleHeight) {
    visible.push("");
  }

  const scrollCells = buildScrollbar(totalLines, visibleHeight, scrollOffset);

  const combined = visible.map(
    (line, i) => padLine(line, contentWidth) + scrollCells[i]
  );

  return combined.join("\n");
}

export function renderSplitPanes(
  leftLines: string[],
  leftScroll: number,
  leftTotal: number,
  rightLines: string[],
  rightScroll: number,
  rightTotal: number,
  visibleHeight: number,
  paneWidth: number,
  focusLeft: boolean
): string {
  const leftVisible = leftLines.slice(leftScroll, leftScroll + visibleHeight);
  while (leftVisible.length < visibleHeight) leftVisible.push("");

  const rightVisible = rightLines.slice(rightScroll, rightScroll + visibleHeight);
  while (rightVisible.length < visibleHeight) rightVisible.push("");

  const leftScrollCells = buildScrollbar(leftTotal, visibleHeight, leftScroll);
  const rightScrollCells = buildScrollbar(rightTotal, visibleHeight, rightScroll);

  const dividerColor = chalk.gray;
  const focusIndicator = (left: boolean) =>
    left === focusLeft ? chalk.cyan("▌") : dividerColor("│");

  const rows: string[] = [];
  for (let i = 0; i < visibleHeight; i++) {
    const left = padLine(leftVisible[i], paneWidth) + leftScrollCells[i];
    const div = focusIndicator(true) + focusIndicator(false);
    const right = padLine(rightVisible[i], paneWidth) + rightScrollCells[i];
    rows.push(left + div + right);
  }

  return rows.join("\n");
}
