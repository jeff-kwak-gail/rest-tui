import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Fuse from "fuse.js";
import Scrollbar from "./scrollbar.js";
import type { Collection } from "./parse-collection.js";

interface CollectionViewerProps {
  collection: Collection;
  onSelect: (index: number) => void;
  onBack: () => void;
  visibleHeight: number;
  onTextInput?: (active: boolean) => void;
}

export default function CollectionViewer({
  collection,
  onSelect,
  onBack,
  visibleHeight,
  onTextInput,
}: CollectionViewerProps) {
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const { entries } = collection;

  const fuse = useMemo(
    () =>
      new Fuse(
        entries.map((entry, index) => ({ ...entry, index })),
        {
          keys: ["title", "raw"],
          threshold: 0.4,
        }
      ),
    [entries]
  );

  // Filtered entries: each item carries its original index into entries[]
  const filtered = useMemo(() => {
    if (!query) return entries.map((entry, index) => ({ entry, index }));
    return fuse.search(query).map((result) => ({
      entry: entries[result.item.index],
      index: result.item.index,
    }));
  }, [query, entries, fuse]);

  const totalLines = filtered.length;

  useInput((input, key) => {
    if (searching) {
      if (key.escape) {
        setSearching(false);
        setQuery("");
        setCursor(0);
        setScrollOffset(0);
        onTextInput?.(false);
      } else if (key.return) {
        setSearching(false);
        onTextInput?.(false);
        // Reset cursor to top of filtered results
        setCursor(0);
        setScrollOffset(0);
      }
      return;
    }

    if (key.escape) {
      if (query) {
        // Clear search first
        setQuery("");
        setCursor(0);
        setScrollOffset(0);
      } else {
        onBack();
      }
      return;
    }

    if (filtered.length === 0) return;

    if (input === "/") {
      setSearching(true);
      onTextInput?.(true);
      return;
    }

    if (key.upArrow || input === "k") {
      setCursor((c) => {
        const next = Math.max(0, c - 1);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
    } else if (key.downArrow || input === "j") {
      setCursor((c) => {
        const next = Math.min(filtered.length - 1, c + 1);
        if (next >= scrollOffset + visibleHeight) {
          setScrollOffset(next - visibleHeight + 1);
        }
        return next;
      });
    } else if (key.return) {
      onSelect(filtered[cursor].index);
    }
  });

  if (entries.length === 0) {
    return (
      <Box>
        <Text dimColor>No requests found in this collection.</Text>
      </Box>
    );
  }

  const visibleEntries = filtered.slice(
    scrollOffset,
    scrollOffset + visibleHeight
  );

  return (
    <Box>
      <Box flexDirection="column" flexGrow={1}>
        {collection.name ? (
          <Text bold color="cyan">
            {collection.name}
          </Text>
        ) : null}
        {searching ? (
          <Box>
            <Text color="yellow">/</Text>
            <TextInput value={query} onChange={(value) => {
              setQuery(value);
              setCursor(0);
              setScrollOffset(0);
            }} />
          </Box>
        ) : query ? (
          <Text dimColor>search: {query} ({filtered.length} match{filtered.length !== 1 ? "es" : ""})</Text>
        ) : null}
        {filtered.length === 0 && query ? (
          <Text dimColor>No matching requests.</Text>
        ) : null}
        {visibleEntries.map((item, i) => {
          const idx = scrollOffset + i;
          const selected = idx === cursor;
          const { entry } = item;
          // Extract method for coloring
          const methodMatch = entry.raw.match(
            /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/m
          );
          const method = methodMatch ? methodMatch[1] : "";
          const titleWithoutMethod = entry.title.startsWith(method)
            ? entry.title.slice(method.length).trim()
            : entry.title;

          return (
            <Box key={item.index} gap={1}>
              <Text color={selected ? "cyan" : undefined}>
                {selected ? "❯" : " "}
              </Text>
              {method && titleWithoutMethod !== entry.title ? (
                <>
                  <Text color="green" bold>
                    {method}
                  </Text>
                  <Text color={selected ? "cyan" : undefined}>
                    {titleWithoutMethod}
                  </Text>
                </>
              ) : (
                <Text color={selected ? "cyan" : undefined}>
                  {entry.title}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
      <Scrollbar
        totalLines={totalLines}
        visibleHeight={visibleHeight}
        scrollOffset={scrollOffset}
      />
    </Box>
  );
}
