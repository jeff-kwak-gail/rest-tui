import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { Environment } from "./environment.js";

interface EnvPickerProps {
  environments: Environment[];
  currentEnv: string | null;
  onSelect: (env: Environment) => void;
  onClear: () => void;
  onBack: () => void;
  onEdit: (env: Environment) => void;
  onCreate: (name: string) => void;
  onTextInput?: (active: boolean) => void;
}

export default function EnvPicker({
  environments,
  currentEnv,
  onSelect,
  onClear,
  onBack,
  onEdit,
  onCreate,
  onTextInput,
}: EnvPickerProps) {
  const itemCount = environments.length + 1;
  const [cursor, setCursor] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useInput(
    (input, key) => {
      if (creating) {
        if (key.escape) {
          setCreating(false);
          setNewName("");
          onTextInput?.(false);
        }
        return;
      }

      if (key.escape) {
        onBack();
        return;
      }

      if (key.upArrow || input === "k") {
        setCursor((c) => Math.max(0, c - 1));
      } else if (key.downArrow || input === "j") {
        setCursor((c) => Math.min(itemCount - 1, c + 1));
      } else if (key.return) {
        if (cursor === 0) {
          if (currentEnv === null) {
            onBack();
          } else {
            onClear();
          }
        } else {
          const env = environments[cursor - 1];
          if (env.name === currentEnv) {
            onBack();
          } else {
            onSelect(env);
          }
        }
      } else if (input === "e") {
        const current = environments.find((env) => env.name === currentEnv);
        if (current) onEdit(current);
      } else if (input === "c") {
        setCreating(true);
        setNewName("");
        onTextInput?.(true);
      }
    },
  );

  const handleCreateSubmit = (value: string) => {
    const name = value.trim();
    if (name) {
      onCreate(name);
    }
    setCreating(false);
    setNewName("");
    onTextInput?.(false);
  };

  if (creating) {
    return (
      <Box flexDirection="column">
        <Text bold>New Environment</Text>
        <Text>{" "}</Text>
        <Box>
          <Text color="cyan">Name: </Text>
          <TextInput
            value={newName}
            onChange={setNewName}
            onSubmit={handleCreateSubmit}
          />
        </Box>
        <Text dimColor>Enter to create, Esc handled by input</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Select Environment</Text>
      <Text>{" "}</Text>
      <Box>
        <Text color={cursor === 0 ? "cyan" : undefined}>
          {cursor === 0 ? "❯ " : "  "}(none)
        </Text>
        {currentEnv === null ? <Text dimColor> {" "}← current</Text> : null}
      </Box>
      {environments.map((env, i) => {
        const idx = i + 1;
        const selected = idx === cursor;
        const isCurrent = currentEnv === env.name;
        return (
          <Box key={env.name}>
            <Text color={selected ? "cyan" : undefined}>
              {selected ? "❯ " : "  "}{env.name}
            </Text>
            {isCurrent ? <Text dimColor> {" "}← current</Text> : null}
          </Box>
        );
      })}
      {environments.length === 0 ? (
        <Text dimColor>  No environments yet.</Text>
      ) : null}
    </Box>
  );
}
