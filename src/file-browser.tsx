import { useState } from "react";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Box, Text, useInput } from "ink";

interface FileBrowserProps {
  cwd: string;
  onSelect: (filePath: string) => void;
}

export default function FileBrowser({ cwd, onSelect }: FileBrowserProps) {
  const files = readdirSync(cwd)
    .filter((f) => f.endsWith(".http"))
    .sort();
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (files.length === 0) return;

    if (key.upArrow || input === "k") {
      setCursor((c) => (c > 0 ? c - 1 : c));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c < files.length - 1 ? c + 1 : c));
    } else if (key.return) {
      onSelect(join(cwd, files[cursor]));
    }
  });

  if (files.length === 0) {
    return (
      <Box>
        <Text dimColor>No .http files found in {cwd}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Select a .http file:</Text>
      {files.map((file, i) => (
        <Text key={file} color={i === cursor ? "cyan" : undefined}>
          {i === cursor ? "❯ " : "  "}
          {file}
        </Text>
      ))}
    </Box>
  );
}
