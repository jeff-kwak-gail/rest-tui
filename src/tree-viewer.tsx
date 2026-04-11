import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Scrollbar from "./scrollbar.js";
import {
  buildTree,
  flattenTree,
  resolveVariables,
} from "./collection-tree.js";

interface TreeViewerProps {
  cwd: string;
  onSelect: (filePath: string, mergedVariables: Record<string, string>) => void;
  onCreate: (name: string, parentFilename: string | null) => void;
  onTextInput?: (active: boolean) => void;
  visibleHeight: number;
  refreshKey?: number;
}

export default function TreeViewer({
  cwd,
  onSelect,
  onCreate,
  onTextInput,
  visibleHeight,
  refreshKey,
}: TreeViewerProps) {
  const { roots, nodeMap } = useMemo(
    () => buildTree(cwd),
    [cwd, refreshKey]
  );

  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    const walk = (nodes: typeof roots) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          set.add(node.filename);
          walk(node.children);
        }
      }
    };
    walk(roots);
    return set;
  });

  const rows = useMemo(
    () => flattenTree(roots, expanded),
    [roots, expanded]
  );

  useInput((input, key) => {
    if (creating) {
      if (key.escape) {
        setCreating(false);
        setNewName("");
        onTextInput?.(false);
      }
      return;
    }

    if (input === "c") {
      setCreating(true);
      setNewName("");
      onTextInput?.(true);
      return;
    }

    if (rows.length === 0) return;

    if (key.upArrow || input === "k") {
      setCursor((c) => {
        const next = Math.max(0, c - 1);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
    } else if (key.downArrow || input === "j") {
      setCursor((c) => {
        const next = Math.min(rows.length - 1, c + 1);
        if (next >= scrollOffset + visibleHeight) {
          setScrollOffset(next - visibleHeight + 1);
        }
        return next;
      });
    } else if (input === "l" || key.rightArrow) {
      const row = rows[cursor];
      if (row && row.hasChildren) {
        setExpanded((prev) => new Set([...prev, row.node.filename]));
      }
    } else if (input === "h" || key.leftArrow) {
      const row = rows[cursor];
      if (row) {
        if (expanded.has(row.node.filename)) {
          setExpanded((prev) => {
            const next = new Set(prev);
            next.delete(row.node.filename);
            return next;
          });
        } else if (row.depth > 0) {
          for (let i = cursor - 1; i >= 0; i--) {
            if (rows[i].depth < row.depth) {
              setCursor(i);
              if (i < scrollOffset) setScrollOffset(i);
              break;
            }
          }
        }
      }
    } else if (key.return) {
      const row = rows[cursor];
      if (row) {
        const merged = resolveVariables(row.node.filename, nodeMap);
        onSelect(row.node.filePath, merged);
      }
    }
  });

  const handleCreateSubmit = (value: string) => {
    const name = value.trim();
    if (name) {
      const parentRow = rows[cursor];
      const parentFilename = parentRow ? parentRow.node.filename : null;
      onCreate(name, parentFilename);
    }
    setCreating(false);
    setNewName("");
    onTextInput?.(false);
  };

  if (creating) {
    const parentRow = rows[cursor];
    const parentLabel = parentRow
      ? parentRow.node.displayName || parentRow.node.segment
      : null;

    return (
      <Box flexDirection="column">
        <Text bold>New Collection</Text>
        {parentLabel ? (
          <Text dimColor>Under: {parentLabel}</Text>
        ) : null}
        <Text>{" "}</Text>
        <Box>
          <Text color="cyan">Name: </Text>
          <TextInput
            value={newName}
            onChange={setNewName}
            onSubmit={handleCreateSubmit}
          />
        </Box>
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box>
        <Text dimColor>No .http files found. Press c to create one.</Text>
      </Box>
    );
  }

  const visibleRows = rows.slice(scrollOffset, scrollOffset + visibleHeight);

  return (
    <Box>
      <Box flexDirection="column" flexGrow={1}>
        {visibleRows.map((row, i) => {
          const idx = scrollOffset + i;
          const selected = idx === cursor;
          const indent = "  ".repeat(row.depth);
          const icon = row.hasChildren
            ? expanded.has(row.node.filename)
              ? "▼ "
              : "▶ "
            : "  ";
          const label = row.node.displayName || row.node.filename;

          return (
            <Text key={row.node.filename} color={selected ? "cyan" : undefined}>
              {selected ? "❯ " : "  "}
              {indent}
              {icon}
              {label}
            </Text>
          );
        })}
      </Box>
      <Scrollbar
        totalLines={rows.length}
        visibleHeight={visibleHeight}
        scrollOffset={scrollOffset}
      />
    </Box>
  );
}
