import chalk from "chalk";
import cliTruncate from "cli-truncate";
import stringWidth from "string-width";
import type { HttpResponse } from "./execute-request.js";
import type { RequestHistoryEntry } from "./settings.js";

function padLine(line: string, targetWidth: number): string {
  const truncated = cliTruncate(line || "", targetWidth, {
    position: "end",
  });
  const visWidth = stringWidth(truncated);
  const padding = Math.max(0, targetWidth - visWidth);
  return truncated + " ".repeat(padding);
}

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
    const thumbPos = maxOffset > 0
      ? Math.round((scrollOffset / maxOffset) * (visibleHeight - thumbSize))
      : 0;
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

export function renderCommandBar(
  hints: string[],
  screenWidth: number,
  env?: string | null
): string {
  const title = chalk.bold.cyan("rest-tui v0.13.3");
  const envStr = env ? "  " + chalk.yellow(`[${env}]`) : "";
  const hintsStr = hints.map((h) => chalk.gray(h)).join("  ");
  const line = title + envStr + "  " + hintsStr;
  return padLine(line, screenWidth);
}

function getHistoryLabel(raw: string): string {
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)/i);
    if (match) return `${match[1]} ${match[2].trim()}`;
    return trimmed.slice(0, 60);
  }
  return "(empty)";
}

export function renderHistoryPanel(
  history: RequestHistoryEntry[],
  contentWidth: number
): string[] {
  const lines: string[] = [];
  const label = " History ";
  const pad = Math.max(0, contentWidth - label.length);
  const leftPad = Math.floor(pad / 2);
  const rightPad = pad - leftPad;
  lines.push(chalk.gray("─".repeat(leftPad) + label + "─".repeat(rightPad)));
  if (history.length === 0) {
    lines.push(chalk.dim("  (empty)"));
  } else {
    for (let i = 0; i < history.length; i++) {
      const num = i < 9 ? String(i + 1) : "0";
      lines.push(chalk.yellow(num) + "  " + chalk.dim(getHistoryLabel(history[i].raw)));
    }
  }
  return lines;
}

export function renderResponseHistoryPanel(
  history: HttpResponse[],
  contentWidth: number
): string[] {
  const lines: string[] = [];
  const label = " Response History ";
  const pad = Math.max(0, contentWidth - label.length);
  const leftPad = Math.floor(pad / 2);
  const rightPad = pad - leftPad;
  lines.push(chalk.gray("─".repeat(leftPad) + label + "─".repeat(rightPad)));
  if (history.length === 0) {
    lines.push(chalk.dim("  (empty)"));
  } else {
    for (let i = 0; i < history.length; i++) {
      const num = i < 9 ? String(i + 1) : "0";
      const s = history[i].status;
      const statusColor = s < 300 ? chalk.green : s < 400 ? chalk.yellow : chalk.red;
      const time = history[i].timestamp
        ? chalk.dim(` ${new Date(history[i].timestamp).toLocaleTimeString()}`)
        : "";
      const req = history[i].requestMethod
        ? "  " + chalk.dim(`${history[i].requestMethod} ${history[i].requestUrl}`)
        : "";
      lines.push(
        chalk.yellow(num) + "  " +
        statusColor(`${s} ${history[i].statusText}`) +
        chalk.dim(` ${history[i].elapsed}ms`) +
        time + req
      );
    }
  }
  return lines;
}

export function renderHelpPopup(
  hints: string[],
  screenWidth: number,
  screenHeight: number,
  commandBar: string,
): string {
  const g = chalk.gray;
  const w = chalk.white.bold;

  // Parse hints into key/desc columns
  const parsed = hints.map((h) => {
    const idx = h.indexOf(" - ");
    return idx === -1 ? { key: h, desc: "" } : { key: h.slice(0, idx), desc: h.slice(idx + 3) };
  });
  const maxKeyLen = Math.max(...parsed.map((p) => p.key.length));

  const popupLines = parsed.map(({ key, desc }) =>
    chalk.yellow(key.padEnd(maxKeyLen)) + "  " + desc
  );

  // Popup dimensions
  const title = " Commands ";
  const maxLineWidth = Math.max(...popupLines.map((l) => stringWidth(l)), title.length);
  const popupInnerWidth = maxLineWidth + 4;
  const popupContentRows = popupLines.length + 2; // blank top + lines + blank bottom
  const popupHeight = popupContentRows + 2; // + borders

  // Screen layout
  const innerWidth = screenWidth - 2;
  const contentHeight = screenHeight - 3;

  const startRow = Math.max(0, Math.floor((contentHeight - popupHeight) / 2));
  const startCol = Math.max(0, Math.floor((innerWidth - (popupInnerWidth + 2)) / 2));

  const rows: string[] = [];
  rows.push(commandBar);
  rows.push(g("╭" + "─".repeat(innerWidth) + "╮"));

  for (let i = 0; i < contentHeight; i++) {
    const rel = i - startRow;
    let lineContent: string;

    if (rel === 0) {
      const pad = popupInnerWidth - title.length;
      const lp = Math.floor(pad / 2);
      const rp = pad - lp;
      lineContent = " ".repeat(startCol) + w("╭" + "─".repeat(lp) + title + "─".repeat(rp) + "╮");
    } else if (rel > 0 && rel <= popupContentRows) {
      const idx = rel - 1;
      let cell: string;
      if (idx === 0 || idx > popupLines.length) {
        cell = " ".repeat(popupInnerWidth);
      } else {
        cell = "  " + padLine(popupLines[idx - 1], popupInnerWidth - 2);
      }
      lineContent = " ".repeat(startCol) + w("│") + cell + w("│");
    } else if (rel === popupContentRows + 1) {
      lineContent = " ".repeat(startCol) + w("╰" + "─".repeat(popupInnerWidth) + "╯");
    } else {
      lineContent = "";
    }

    rows.push(g("│") + padLine(lineContent, innerWidth) + g("│"));
  }

  rows.push(g("╰" + "─".repeat(innerWidth) + "╯"));
  return rows.join("\n");
}

export function renderSinglePane(
  lines: string[],
  scrollOffset: number,
  screenWidth: number,
  screenHeight: number,
  commandBar: string,
  bottomLines: string[] = []
): string {
  // Border chars
  const tl = "╭", tr = "╮", bl = "╰", br = "╯", h = "─", v = "│";
  const innerWidth = screenWidth - 2; // left border + right border
  const totalHeight = screenHeight - 3; // commandbar + top border + bottom border
  const bottomHeight = bottomLines.length;
  const scrollableHeight = totalHeight - bottomHeight;

  const visible = lines.slice(scrollOffset, scrollOffset + scrollableHeight);
  while (visible.length < scrollableHeight) visible.push("");

  const scrollCells = buildScrollbar(lines.length, scrollableHeight, scrollOffset);
  for (let i = 0; i < bottomHeight; i++) scrollCells.push(" ");

  // content area = innerWidth - 1 (scrollbar)
  const contentWidth = innerWidth - 1;

  const rows: string[] = [];
  rows.push(commandBar);
  rows.push(chalk.gray(tl + h.repeat(innerWidth) + tr));

  for (let i = 0; i < totalHeight; i++) {
    const content = i < scrollableHeight
      ? padLine(visible[i], contentWidth)
      : padLine(bottomLines[i - scrollableHeight], contentWidth);
    rows.push(chalk.gray(v) + content + scrollCells[i] + chalk.gray(v));
  }

  rows.push(chalk.gray(bl + h.repeat(innerWidth) + br));
  return rows.join("\n");
}

export function renderSplitPane(
  leftLines: string[],
  leftScroll: number,
  rightLines: string[],
  rightScroll: number,
  screenWidth: number,
  screenHeight: number,
  commandBar: string,
  focusLeft: boolean,
  leftBottomLines: string[] = [],
  rightBottomLines: string[] = []
): string {
  const contentHeight = screenHeight - 3;
  const leftBottomHeight = leftBottomLines.length;
  const leftScrollableHeight = contentHeight - leftBottomHeight;
  const rightBottomHeight = rightBottomLines.length;
  const rightScrollableHeight = contentHeight - rightBottomHeight;

  // Each row: |left+scroll| |right+scroll| = 4 border chars + 2 scrollbar chars + content
  // Each pane border width includes the content + scrollbar inside
  const totalBorderChars = 4; // left outer, left inner, right inner, right outer
  const totalScrollChars = 2; // one per pane
  const availableContent = screenWidth - totalBorderChars - totalScrollChars;
  const leftContentWidth = Math.floor(availableContent / 2);
  const rightContentWidth = availableContent - leftContentWidth;

  // paneWidth = content + scrollbar (what goes inside the border)
  const leftPaneWidth = leftContentWidth + 1;
  const rightPaneWidth = rightContentWidth + 1;

  const leftVisible = leftLines.slice(leftScroll, leftScroll + leftScrollableHeight);
  while (leftVisible.length < leftScrollableHeight) leftVisible.push("");

  const rightVisible = rightLines.slice(rightScroll, rightScroll + rightScrollableHeight);
  while (rightVisible.length < rightScrollableHeight) rightVisible.push("");

  const leftScrollCells = buildScrollbar(leftLines.length, leftScrollableHeight, leftScroll);
  for (let i = 0; i < leftBottomHeight; i++) leftScrollCells.push(" ");
  const rightScrollCells = buildScrollbar(rightLines.length, rightScrollableHeight, rightScroll);
  for (let i = 0; i < rightBottomHeight; i++) rightScrollCells.push(" ");

  const fl = focusLeft;
  const g = chalk.gray;
  const fw = chalk.white.bold;

  // Both panes have thin gray border. Focused pane overlays thick white border.
  // Thin chars: ╭─╮│╰─╯  Thick chars: ┏━┓┃┗━┛
  const topBorder = fl
    ? fw("┏" + "━".repeat(leftPaneWidth) + "┓") + g("╭" + "─".repeat(rightPaneWidth) + "╮")
    : g("╭" + "─".repeat(leftPaneWidth) + "╮") + fw("┏" + "━".repeat(rightPaneWidth) + "┓");

  const botBorder = fl
    ? fw("┗" + "━".repeat(leftPaneWidth) + "┛") + g("╰" + "─".repeat(rightPaneWidth) + "╯")
    : g("╰" + "─".repeat(leftPaneWidth) + "╯") + fw("┗" + "━".repeat(rightPaneWidth) + "┛");

  const rows: string[] = [];
  rows.push(commandBar);
  rows.push(topBorder);

  for (let i = 0; i < contentHeight; i++) {
    const leftContent = i < leftScrollableHeight
      ? padLine(leftVisible[i], leftContentWidth)
      : padLine(leftBottomLines[i - leftScrollableHeight] || "", leftContentWidth);
    const left = leftContent + leftScrollCells[i];

    const rightContent = i < rightScrollableHeight
      ? padLine(rightVisible[i], rightContentWidth)
      : padLine(rightBottomLines[i - rightScrollableHeight] || "", rightContentWidth);
    const right = rightContent + rightScrollCells[i];

    if (fl) {
      rows.push(fw("┃") + left + fw("┃") + g("│") + right + g("│"));
    } else {
      rows.push(g("│") + left + g("│") + fw("┃") + right + fw("┃"));
    }
  }

  rows.push(botBorder);
  return rows.join("\n");
}
