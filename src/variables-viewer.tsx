import chalk from "chalk";
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
}

export default function VariablesViewer({
  variables,
}: VariablesViewerProps) {
  if (variables.length === 0) {
    return (
      <Box>
        <Text dimColor>No variables defined.</Text>
      </Box>
    );
  }

  const maxKeyLen = Math.max(...variables.map((v) => v.key.length));
  const maxValLen = Math.max(...variables.map((v) => v.value.length));

  const colorSource = (v: TaggedVariable): string => {
    const label = v.overridden ? `${v.source} (overridden)` : v.source;
    if (v.sourceType === "collection") return chalk.magenta(label);
    return chalk.yellow(label);
  };

  const lines = variables.map((v) => {
    const key = v.key.padEnd(maxKeyLen);
    const val = v.value.padEnd(maxValLen);
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
