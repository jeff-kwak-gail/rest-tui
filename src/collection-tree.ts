import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontMatter } from "./parse-collection.js";

export interface CollectionTreeNode {
  segment: string;
  filename: string;
  filePath: string;
  displayName: string | null;
  children: CollectionTreeNode[];
  variables: Record<string, string>;
}

export interface TreeRow {
  node: CollectionTreeNode;
  depth: number;
  hasChildren: boolean;
}

export function buildTree(cwd: string): {
  roots: CollectionTreeNode[];
  nodeMap: Map<string, CollectionTreeNode>;
} {
  const files = readdirSync(cwd)
    .filter((f) => f.endsWith(".http") && !f.startsWith("."))
    .sort();

  const nodeMap = new Map<string, CollectionTreeNode>();

  // First pass: create all nodes
  for (const filename of files) {
    const filePath = join(cwd, filename);
    const content = readFileSync(filePath, "utf-8");
    const { meta } = parseFrontMatter(content);
    const { name, ...variables } = meta;

    const basename = filename.slice(0, -5); // remove .http
    const segments = basename.split(".");
    const segment = segments[0];

    nodeMap.set(filename, {
      segment,
      filename,
      filePath,
      displayName: name ?? null,
      children: [],
      variables,
    });
  }

  // Second pass: attach children to parents
  const roots: CollectionTreeNode[] = [];

  for (const [filename, node] of nodeMap) {
    const basename = filename.slice(0, -5);
    const segments = basename.split(".");
    const parentBasename = segments.slice(1).join(".");
    const parentFilename = parentBasename ? `${parentBasename}.http` : "";

    if (parentFilename && nodeMap.has(parentFilename)) {
      nodeMap.get(parentFilename)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children at each level
  const sortChildren = (nodes: CollectionTreeNode[]) => {
    nodes.sort((a, b) => a.segment.localeCompare(b.segment));
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return { roots, nodeMap };
}

export function flattenTree(
  roots: CollectionTreeNode[],
  expandedSet: Set<string>
): TreeRow[] {
  const rows: TreeRow[] = [];

  const walk = (nodes: CollectionTreeNode[], depth: number) => {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      rows.push({ node, depth, hasChildren });
      if (hasChildren && expandedSet.has(node.filename)) {
        walk(node.children, depth + 1);
      }
    }
  };

  walk(roots, 0);
  return rows;
}

export function resolveVariables(
  filename: string,
  nodeMap: Map<string, CollectionTreeNode>
): Record<string, string> {
  // Walk up the ancestor chain
  const chain: CollectionTreeNode[] = [];
  let current = filename;

  while (nodeMap.has(current)) {
    const node = nodeMap.get(current)!;
    chain.unshift(node); // prepend so root is first

    const basename = current.slice(0, -5);
    const segments = basename.split(".");
    const parentBasename = segments.slice(1).join(".");
    current = parentBasename ? `${parentBasename}.http` : "";
  }

  // Merge: root first, self last (self overrides)
  const merged: Record<string, string> = {};
  for (const node of chain) {
    Object.assign(merged, node.variables);
  }

  return merged;
}
