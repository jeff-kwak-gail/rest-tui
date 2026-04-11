export interface CollectionEntry {
  title: string;
  raw: string;
}

export interface Collection {
  name: string | null;
  variables: Record<string, string>;
  entries: CollectionEntry[];
}

export function parseFrontMatter(content: string): {
  meta: Record<string, string>;
  rest: string;
} {
  if (!content.startsWith("---")) {
    return { meta: {}, rest: content };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { meta: {}, rest: content };
  }

  const fmBlock = content.slice(4, endIndex).trim();
  const meta: Record<string, string> = {};

  for (const line of fmBlock.split("\n")) {
    const match = line.match(/^([\w][\w\s]*?):\s*(.*)$/);
    if (match) {
      meta[match[1].trim()] = match[2].trim();
    }
  }

  const rest = content.slice(endIndex + 4).trim();
  return { meta, rest };
}

function extractTitle(section: string): string {
  // Look for ### comment title
  const titleMatch = section.match(/^###\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // Fall back to method + URL
  const methodMatch = section.match(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/m
  );
  if (methodMatch) {
    return `${methodMatch[1]} ${methodMatch[2].trim()}`;
  }

  return "Untitled Request";
}

export function substituteVariables(
  text: string,
  variables: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in variables ? variables[key] : match;
  });
}

function countMethodLines(section: string): number {
  const methods = section.match(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/gm
  );
  return methods ? methods.length : 0;
}

export function parseCollection(content: string): Collection {
  const { meta, rest } = parseFrontMatter(content);

  // Split on separator lines (3+ dashes, optional whitespace, nothing else)
  const sections = rest
    .split(/^-{3,}\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const entries: CollectionEntry[] = [];

  for (const section of sections) {
    const methodCount = countMethodLines(section);
    if (methodCount === 0) continue;

    if (methodCount > 1) {
      throw new Error(
        `Section ${entries.length + 1} contains ${methodCount} requests; only one per section is allowed. Separate requests with ---`
      );
    }

    entries.push({
      title: extractTitle(section),
      raw: section,
    });
  }

  const { name, ...variables } = meta;

  return {
    name: name ?? null,
    variables,
    entries,
  };
}
