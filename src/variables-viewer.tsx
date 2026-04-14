import chalk from "chalk";
import cliTruncate from "cli-truncate";
import { Box, Text } from "ink";

export interface TaggedVariable {
  key: string;
  value: string;
  source: string;
  sourceType: "collection" | "env";
  overridden?: boolean;
}

interface VariablesViewerProps {
  variables: TaggedVariable[];
  contentWidth?: number;
}

export default function VariablesViewer({
  variables,
  contentWidth,
}: VariablesViewerProps) {
  if (variables.length === 0) {
    return (
      <Box>
        <Text dimColor>No variables defined.</Text>
      </Box>
    );
  }

  const maxKeyLen = Math.max(...variables.map((v) => v.key.length));
  const maxSourceLen = Math.max(
    ...variables.map((v) => (v.overridden ? `${v.source} (overridden)` : v.source).length)
  );
  // key(padded) + 2 gaps of 2 + source(padded) = fixed columns
  const fixedWidth = maxKeyLen + 2 + 2 + maxSourceLen;
  const maxValLen = contentWidth
    ? Math.max(8, contentWidth - fixedWidth)
    : Math.max(...variables.map((v) => v.value.length));

  const colorSource = (v: TaggedVariable): string => {
    const label = v.overridden ? `${v.source} (overridden)` : v.source;
    if (v.sourceType === "collection") return chalk.magenta(label);
    return chalk.yellow(label);
  };

  const lines = variables.map((v) => {
    const key = v.key.padEnd(maxKeyLen);
    const val = cliTruncate(v.value, maxValLen, { position: "end" });
    if (v.overridden) {
      return `${chalk.strikethrough.dim(key)}  ${chalk.strikethrough.dim(val)}  ${colorSource(v)}`;
    }
    return `${chalk.cyan(key)}  ${val}  ${colorSource(v)}`;
  });

  return (
    <Box flexDirection="column">
      <Text bold>Variables</Text>
      <Text>{" "}</Text>
      <Text>{lines.join("\n")}</Text>
    </Box>
  );
}
