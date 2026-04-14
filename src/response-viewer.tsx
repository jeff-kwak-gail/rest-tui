import chalk from "chalk";
import wrapAnsi from "wrap-ansi";
import { Box, Text } from "ink";
import { highlight } from "cli-highlight";
import { renderPane } from "./render-pane.js";
import type { HttpResponse } from "./execute-request.js";

interface ResponseViewerProps {
  response: HttpResponse | null;
  loading: boolean;
  error: string | null;
  scrollOffset: number;
  visibleHeight: number;
  contentWidth: number;
}

function statusColor(status: number): typeof chalk {
  if (status < 300) return chalk.green.bold;
  if (status < 400) return chalk.yellow.bold;
  return chalk.red.bold;
}

function highlightBody(body: string, contentType: string): string {
  if (contentType.includes("json")) {
    try {
      const parsed = JSON.parse(body);
      const formatted = JSON.stringify(parsed, null, 2);
      return highlight(formatted, { language: "json" });
    } catch {
      return body;
    }
  }
  return body;
}

function wrapValue(
  value: string,
  valueColStart: number,
  totalWidth: number
): string[] {
  const valueWidth = totalWidth - valueColStart;
  if (valueWidth <= 0 || value.length <= valueWidth) return [value];

  const lines: string[] = [];
  let remaining = value;
  while (remaining.length > 0) {
    lines.push(remaining.slice(0, valueWidth));
    remaining = remaining.slice(valueWidth);
  }
  return lines;
}

export function getResponseLines(
  response: HttpResponse,
  contentWidth: number = 80
): string[] {
  const lines: string[] = [];

  const color = statusColor(response.status);
  lines.push(
    `${color(`${response.status} ${response.statusText}`)}  ${chalk.dim(`${response.elapsed}ms`)}`
  );

  lines.push("");

  const headerEntries = Object.entries(response.headers);
  const maxKeyLen = Math.max(...headerEntries.map(([k]) => k.length));
  const valueColStart = maxKeyLen + 2;
  const indent = " ".repeat(valueColStart);

  for (const [key, value] of headerEntries) {
    const padded = key.padEnd(maxKeyLen);
    const wrapped = wrapValue(value, valueColStart, contentWidth);
    lines.push(`${chalk.cyan(padded)}  ${wrapped[0]}`);
    for (let w = 1; w < wrapped.length; w++) {
      lines.push(`${indent}${wrapped[w]}`);
    }
  }

  if (response.body) {
    const contentType = response.headers["content-type"] || "";
    const highlighted = highlightBody(response.body, contentType).replace(/\t/g, "  ");
    const wrapped = wrapAnsi(highlighted, contentWidth, { hard: true, trim: false });
    lines.push("");
    lines.push(...wrapped.split("\n"));
  }

  return lines;
}

export default function ResponseViewer({
  response,
  loading,
  error,
  scrollOffset,
  visibleHeight,
  contentWidth,
}: ResponseViewerProps) {
  if (loading) {
    return (
      <Box>
        <Text color="yellow">Sending request...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!response) return null;

  const allLines = getResponseLines(response, contentWidth);
  const output = renderPane(
    allLines,
    scrollOffset,
    visibleHeight,
    contentWidth,
    allLines.length
  );

  return (
    <Box>
      <Text>{output}</Text>
    </Box>
  );
}
