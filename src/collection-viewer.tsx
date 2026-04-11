import { useState } from "react";
import { Box, Text, useInput } from "ink";
import Scrollbar from "./scrollbar.js";
import type { Collection } from "./parse-collection.js";

interface CollectionViewerProps {
  collection: Collection;
  onSelect: (index: number) => void;
  onBack: () => void;
  visibleHeight: number;
}

export default function CollectionViewer({
  collection,
  onSelect,
  onBack,
  visibleHeight,
}: CollectionViewerProps) {
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const { entries } = collection;
  const totalLines = entries.length;

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (entries.length === 0) return;

    if (key.upArrow || input === "k") {
      setCursor((c) => {
        const next = Math.max(0, c - 1);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
    } else if (key.downArrow || input === "j") {
      setCursor((c) => {
        const next = Math.min(entries.length - 1, c + 1);
        if (next >= scrollOffset + visibleHeight) {
          setScrollOffset(next - visibleHeight + 1);
        }
        return next;
      });
    } else if (key.return) {
      onSelect(cursor);
    }
  });

  if (entries.length === 0) {
    return (
      <Box>
        <Text dimColor>No requests found in this collection.</Text>
      </Box>
    );
  }

  const visibleEntries = entries.slice(
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
        {visibleEntries.map((entry, i) => {
          const idx = scrollOffset + i;
          const selected = idx === cursor;
          // Extract method for coloring
          const methodMatch = entry.raw.match(
            /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/m
          );
          const method = methodMatch ? methodMatch[1] : "";
          const titleWithoutMethod = entry.title.startsWith(method)
            ? entry.title.slice(method.length).trim()
            : entry.title;

          return (
            <Box key={idx} gap={1}>
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
