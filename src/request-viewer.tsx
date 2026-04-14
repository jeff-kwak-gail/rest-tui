import { Box, Text } from "ink";
import { highlight } from "cli-highlight";

interface RequestViewerProps {
  request: string;
}

function colorLine(line: string): string {
  if (line.trimStart().startsWith("#")) {
    return `\x1b[2m${line}\x1b[0m`;
  }

  const methodMatch = line.match(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.*)$/
  );
  if (methodMatch) {
    return `\x1b[1;32m${methodMatch[1]}\x1b[0m \x1b[33m${methodMatch[2]}\x1b[0m`;
  }

  const headerMatch = line.match(/^([\w-]+):\s*(.*)$/);
  if (headerMatch) {
    return `\x1b[36m${headerMatch[1]}\x1b[0m\x1b[90m: \x1b[0m${headerMatch[2]}`;
  }

  return line;
}

function highlightJson(lines: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const jsonLines: string[] = [lines[i]];
      let depth = 0;
      for (const ch of trimmed) {
        if (ch === "{" || ch === "[") depth++;
        if (ch === "}" || ch === "]") depth--;
      }
      let j = i + 1;
      while (j < lines.length && depth > 0) {
        jsonLines.push(lines[j]);
        for (const ch of lines[j]) {
          if (ch === "{" || ch === "[") depth++;
          if (ch === "}" || ch === "]") depth--;
        }
        j++;
      }
      try {
        const block = jsonLines.join("\n");
        JSON.parse(block);
        const highlighted = highlight(block, { language: "json" });
        result.push(...highlighted.split("\n"));
      } catch {
        result.push(...jsonLines);
      }
      i = j;
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result;
}

export function getRequestLines(request: string): string[] {
  if (!request) return [];
  return request.replace(/\t/g, "  ").split("\n");
}

export function colorRequestLines(request: string): string[] {
  const rawLines = getRequestLines(request);
  const colored: string[] = [];
  const bodyRanges: { start: number; end: number }[] = [];
  let inBody = false;
  let bodyStart = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trimStart();

    if (line === "") {
      if (inBody) {
        bodyRanges.push({ start: bodyStart, end: i });
        inBody = false;
      }
      colored.push("");
    } else if (
      trimmed.startsWith("#") ||
      /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/.test(line) ||
      /^[\w-]+:\s/.test(line)
    ) {
      if (inBody) {
        bodyRanges.push({ start: bodyStart, end: i });
        inBody = false;
      }
      colored.push(colorLine(line));
    } else {
      if (!inBody) {
        bodyStart = i;
        inBody = true;
      }
      colored.push(line);
    }
  }
  if (inBody) {
    bodyRanges.push({ start: bodyStart, end: rawLines.length });
  }

  for (const range of bodyRanges) {
    const bodyLines = colored.slice(range.start, range.end);
    const highlighted = highlightJson(bodyLines);
    for (let j = 0; j < highlighted.length; j++) {
      colored[range.start + j] = highlighted[j];
    }
  }

  return colored;
}

export default function RequestViewer({ request }: RequestViewerProps) {
  if (!request) {
    return (
      <Box>
        <Text dimColor>No request. Press e to edit.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>{colorRequestLines(request).join("\n")}</Text>
    </Box>
  );
}
