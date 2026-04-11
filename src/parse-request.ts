export interface ParsedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function parseRequest(raw: string): ParsedRequest {
  const blankLine = raw.indexOf("\n\n");
  const head = blankLine === -1 ? raw : raw.slice(0, blankLine);
  const body = blankLine === -1 ? "" : raw.slice(blankLine + 2).trimEnd();

  const lines = head
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"));
  const requestLine = lines[0];

  const match = requestLine.match(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/
  );
  if (!match) {
    throw new Error(`Invalid request line: ${requestLine}`);
  }

  const method = match[1];
  const url = match[2].trim();

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const headerMatch = lines[i].match(/^([\w-]+):\s*(.*)$/);
    if (headerMatch) {
      headers[headerMatch[1]] = headerMatch[2];
    }
  }

  return { method, url, headers, body };
}
