import { useState, useCallback, useEffect } from "react";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { Box, Text, useApp, useInput, useStdin, useStdout } from "ink";
import { getRequestLines, colorRequestLines } from "./request-viewer.js";
import { getResponseLines } from "./response-viewer.js";
import {
  renderCommandBar,
  renderSinglePane,
  renderSplitPane,
  renderHistoryPanel,
  renderResponseHistoryPanel,
} from "./render-screen.js";
import TreeViewer from "./tree-viewer.js";
import CollectionViewer from "./collection-viewer.js";
import VariablesViewer, { type TaggedVariable } from "./variables-viewer.js";
import EnvPicker from "./env-picker.js";
import { listEnvironments, createEnvironment, type Environment } from "./environment.js";
import {
  loadSettings,
  saveSettings,
  loadRequestHistory,
  saveRequestHistory,
  loadResponseHistory,
  saveResponseHistory,
} from "./settings.js";
import { openInEditor } from "./editor.js";
import { executeRequest, type HttpResponse } from "./execute-request.js";
import {
  parseCollection,
  type Collection,
  substituteVariables,
} from "./parse-collection.js";
import { buildTree, resolveVariables } from "./collection-tree.js";

type View = "file-browser" | "collection" | "request" | "variables" | "env-picker";
type Focus = "request" | "response";

interface AppProps {
  initialFile?: string | null;
}

function CommandBar({ hints, env }: { hints: string[]; env?: string | null }) {
  return (
    <Box width="100%" gap={2}>
      <Text bold color="cyan">
        rest-tui v0.11.0
      </Text>
      {env ? (
        <Text color="yellow">[{env}]</Text>
      ) : null}
      {hints.map((hint) => (
        <Text key={hint} color="gray">
          {hint}
        </Text>
      ))}
    </Box>
  );
}

function loadFile(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

export default function App({ initialFile }: AppProps) {
  const { exit } = useApp();
  const { setRawMode } = useStdin();
  const { stdout } = useStdout();

  const [initialState] = useState(() => {
    const fileToLoad = initialFile ?? (() => {
      const settings = loadSettings(process.cwd());
      if (settings.lastFile && existsSync(settings.lastFile)) {
        return settings.lastFile;
      }
      return null;
    })();
    const restoredEntry = !initialFile ? loadSettings(process.cwd()).lastEntry : undefined;

    if (!fileToLoad) return null;
    try {
      const content = loadFile(fileToLoad);
      const col = parseCollection(content);

      // Resolve ancestor variables via the tree
      const cwd = process.cwd();
      const { nodeMap } = buildTree(cwd);
      const fname = basename(fileToLoad);
      const ancestorVars = nodeMap.has(fname) ? resolveVariables(fname, nodeMap) : {};
      col.variables = { ...ancestorVars, ...col.variables };

      if (restoredEntry !== undefined && restoredEntry >= 0 && restoredEntry < col.entries.length) {
        return { view: "request" as View, collection: col, request: col.entries[restoredEntry].raw, selectedEntry: restoredEntry, filePath: fileToLoad, parseError: null };
      }
      if (col.entries.length === 1) {
        return { view: "request" as View, collection: col, request: col.entries[0].raw, selectedEntry: 0, filePath: fileToLoad, parseError: null };
      }
      return { view: "collection" as View, collection: col, request: "", selectedEntry: 0, filePath: fileToLoad, parseError: null };
    } catch (err) {
      return { view: "file-browser" as View, collection: null, request: "", selectedEntry: 0, filePath: null, parseError: err instanceof Error ? err.message : String(err) };
    }
  });

  const [view, setView] = useState<View>(initialState?.view ?? "file-browser");
  const [filePath, setFilePath] = useState<string | null>(
    initialState?.filePath ?? null
  );
  const [collection, setCollection] = useState<Collection | null>(initialState?.collection ?? null);
  const [selectedEntry, setSelectedEntry] = useState(initialState?.selectedEntry ?? 0);
  const [request, setRequest] = useState(initialState?.request ?? "");
  const [parseError, setParseError] = useState<string | null>(initialState?.parseError ?? null);
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>("request");
  const [requestScroll, setRequestScroll] = useState(0);
  const [responseScroll, setResponseScroll] = useState(0);
  const [initialEnv] = useState(() => {
    const settings = loadSettings(process.cwd());
    if (settings.environment) {
      const envs = listEnvironments(process.cwd());
      const env = envs.find((e) => e.name === settings.environment);
      if (env) return env;
      // Stale setting — clear it
      saveSettings(process.cwd(), { ...settings, environment: undefined });
    }
    return null;
  });
  const [envVars, setEnvVars] = useState<Record<string, string>>(initialEnv?.variables ?? {});
  const [envName, setEnvName] = useState<string | null>(initialEnv?.name ?? null);
  const [previousView, setPreviousView] = useState<View>("file-browser");
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [textInputActive, setTextInputActive] = useState(false);
  const [history, setHistory] = useState<string[]>(() => loadRequestHistory(process.cwd()));
  const [showHistory, setShowHistory] = useState(false);
  const [responseHistory, setResponseHistory] = useState<HttpResponse[]>(() => loadResponseHistory(process.cwd()));
  const [showResponseHistory, setShowResponseHistory] = useState(false);

  const [width, setWidth] = useState(stdout?.columns ?? 80);
  const [height, setHeight] = useState(stdout?.rows ?? 24);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setWidth(stdout.columns);
      setHeight(stdout.rows);
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  useEffect(() => {
    if (history.length > 0) saveRequestHistory(process.cwd(), history);
  }, [history]);

  useEffect(() => {
    if (responseHistory.length > 0) saveResponseHistory(process.cwd(), responseHistory);
  }, [responseHistory]);

  const contentHeight = height - 3;
  // For getResponseLines width estimation: screen - borders(2) - divider(1) / 2 - scrollbar(1)
  const innerWidth = width - 2;
  const paneContentWidth = Math.floor((innerWidth - 1) / 2) - 1;
  const halfPage = Math.max(1, Math.floor(contentHeight / 2));

  const hasResponse = response !== null || loading || error !== null;
  const showSplit = hasResponse || focus === "response";
  const historyPanelWidth = showSplit ? paneContentWidth : innerWidth - 1;
  const historyLines = showHistory ? renderHistoryPanel(history, historyPanelWidth) : [];
  const responseHistoryLines = showResponseHistory ? renderResponseHistoryPanel(responseHistory, paneContentWidth) : [];
  const requestVisibleHeight = contentHeight - historyLines.length;
  const responseVisibleHeight = contentHeight - responseHistoryLines.length;
  const totalRequestLines = getRequestLines(request).length;
  const totalResponseLines = response
    ? getResponseLines(response, paneContentWidth).length
    : 0;

  const clampRequestScroll = (offset: number) =>
    Math.max(0, Math.min(offset, Math.max(0, totalRequestLines - requestVisibleHeight)));
  const clampResponseScroll = (offset: number) =>
    Math.max(0, Math.min(offset, Math.max(0, totalResponseLines - responseVisibleHeight)));

  // Load file and parse collection
  const loadCollection = useCallback(
    (path: string, ancestorVariables: Record<string, string> = {}) => {
      let col: Collection;
      try {
        const content = loadFile(path);
        col = parseCollection(content);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
        return;
      }
      // Merge ancestor variables (ancestors as base, self overrides)
      col.variables = { ...ancestorVariables, ...col.variables };
      setParseError(null);
      setFilePath(path);
      setCollection(col);

      if (col.entries.length === 1) {
        // Single request — skip collection view
        setSelectedEntry(0);
        setRequest(col.entries[0].raw);
        setView("request");
        saveSettings(process.cwd(), { ...loadSettings(process.cwd()), lastFile: path, lastEntry: 0 });
      } else {
        setView("collection");
        saveSettings(process.cwd(), { ...loadSettings(process.cwd()), lastFile: path, lastEntry: undefined });
      }
    },
    []
  );

  const handleFileSelect = (path: string, mergedVariables: Record<string, string>) => {
    loadCollection(path, mergedVariables);
  };

  const handleEntrySelect = (index: number) => {
    if (!collection) return;
    setSelectedEntry(index);
    setRequest(collection.entries[index].raw);
    setResponse(null);
    setError(null);
    setRequestScroll(0);
    setResponseScroll(0);
    setFocus("request");
    setView("request");
    if (filePath) {
      saveSettings(process.cwd(), { ...loadSettings(process.cwd()), lastFile: filePath, lastEntry: index });
    }
  };

  const sendRequest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setResponseScroll(0);
    // Push to history (dedup, cap at 10)
    setHistory((prev) => {
      const filtered = prev.filter((h) => h !== request);
      return [request, ...filtered].slice(0, 10);
    });
    try {
      const allVars = { ...envVars, ...(collection?.variables ?? {}) };
      const resolved = substituteVariables(request, allVars);
      const res = await executeRequest(resolved);
      setResponse(res);
      setResponseHistory((prev) => [res, ...prev].slice(0, 10));
      setFocus("response");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFocus("response");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useInput((input, key) => {
    // Skip all key handling when a text input is active
    if (textInputActive) return;

    // Global: n opens env picker from any view (except env-picker itself)
    if (input === "n" && view !== "env-picker") {
      setPreviousView(view);
      setView("env-picker");
      return;
    }

    // Env picker view
    if (view === "env-picker") {
      if (input === "q") exit();
      // Navigation handled by EnvPicker component
      return;
    }

    // Variables view
    if (view === "variables") {
      if (input === "q") exit();
      if (key.escape) {
        setView("request");
      }
      if (input === "e" && filePath) {
        // Open editor at line 1 (front matter)
        setRawMode(false);
        const updated = openInEditor(filePath, 1);
        setRawMode(true);
        const col = parseCollection(updated);
        setCollection(col);
        if (selectedEntry < col.entries.length) {
          setRequest(col.entries[selectedEntry].raw);
        } else if (col.entries.length > 0) {
          setSelectedEntry(0);
          setRequest(col.entries[0].raw);
        }
      }
      return;
    }

    if (view === "collection") {
      if (input === "q") exit();
      if (input === "v" && collection) {
        setView("variables");
      }
      if (input === "c" && filePath) {
        // Append a new request section and open editor there
        const content = loadFile(filePath);
        const lineCount = content.split("\n").length;
        const newSection = "\n---\n\n### New Request\nGET https://example.com\n";
        appendFileSync(filePath, newSection);
        const newLine = lineCount + 3; // skip blank + --- + blank, land on ###
        setRawMode(false);
        const updated = openInEditor(filePath, newLine);
        setRawMode(true);
        // Re-parse and select the new entry
        try {
          const col = parseCollection(updated);
          setCollection(col);
          if (col.entries.length > 0) {
            const lastIdx = col.entries.length - 1;
            setSelectedEntry(lastIdx);
            setRequest(col.entries[lastIdx].raw);
            setView("request");
          }
        } catch {
          // Parse error — stay on collection view
        }
      }
      if (key.escape) {
        setView("file-browser");
        setFilePath(null);
        setCollection(null);
        setTreeRefreshKey((k) => k + 1);
      }
      return;
    }

    if (view !== "request") {
      if (input === "q") exit();
      return;
    }

    // Request view keybindings
    if (input === "q") {
      exit();
    }
    if (input === "v" && collection && focus === "request") {
      setView("variables");
    }
    if (key.tab) {
      setFocus((f) => f === "request" ? "response" : "request");
    }
    if (key.escape) {
      if (collection && collection.entries.length > 1) {
        setView("collection");
        setResponse(null);
        setError(null);
        setFocus("request");
      } else {
        setView("file-browser");
        setFilePath(null);
        setCollection(null);
        setFocus("request");
        setTreeRefreshKey((k) => k + 1);
      }
    }
    if (input === "e" && filePath && focus === "request") {
      // Find the line number of the current request in the file
      const fileContent = loadFile(filePath);
      const entryRaw = collection?.entries[selectedEntry]?.raw;
      let line: number | undefined;
      if (entryRaw) {
        const idx = fileContent.indexOf(entryRaw);
        if (idx !== -1) {
          line = fileContent.slice(0, idx).split("\n").length;
        }
      }
      setRawMode(false);
      const updated = openInEditor(filePath, line);
      setRawMode(true);
      // Re-parse collection and reload current entry
      const col = parseCollection(updated);
      setCollection(col);
      if (selectedEntry < col.entries.length) {
        setRequest(col.entries[selectedEntry].raw);
      } else if (col.entries.length > 0) {
        setSelectedEntry(0);
        setRequest(col.entries[0].raw);
      } else {
        setView("collection");
      }
    }
    if (key.return && focus === "request" && !loading) {
      sendRequest();
    }
    if (input === "h") {
      if (focus === "request") {
        setShowHistory((s) => !s);
      } else if (focus === "response") {
        setShowResponseHistory((s) => !s);
      }
    }

    // History number keys — focus-aware
    const numKey = input === "0" ? 10 : Number(input);
    if (numKey >= 1 && numKey <= 10) {
      const idx = numKey - 1;
      if (focus === "request" && idx < history.length) {
        setRequest(history[idx]);
        setResponse(null);
        setError(null);
        setRequestScroll(0);
        setResponseScroll(0);
        setFocus("request");
      } else if (focus === "response" && idx < responseHistory.length) {
        setResponse(responseHistory[idx]);
        setResponseScroll(0);
      }
    }

    // Request scrolling
    if (focus === "request") {
      if (input === "j" || key.downArrow) {
        setRequestScroll((s) => clampRequestScroll(s + 1));
      } else if (input === "k" || key.upArrow) {
        setRequestScroll((s) => clampRequestScroll(s - 1));
      } else if (input === "d") {
        setRequestScroll((s) => clampRequestScroll(s + halfPage));
      } else if (input === "u") {
        setRequestScroll((s) => clampRequestScroll(s - halfPage));
      } else if (input === "g") {
        setRequestScroll(0);
      } else if (input === "G") {
        setRequestScroll(clampRequestScroll(totalRequestLines));
      }
    }

    // Response scrolling
    if (focus === "response" && response) {
      if (input === "j" || key.downArrow) {
        setResponseScroll((s) => clampResponseScroll(s + 1));
      } else if (input === "k" || key.upArrow) {
        setResponseScroll((s) => clampResponseScroll(s - 1));
      } else if (input === "d") {
        setResponseScroll((s) => clampResponseScroll(s + halfPage));
      } else if (input === "u") {
        setResponseScroll((s) => clampResponseScroll(s - halfPage));
      } else if (input === "g") {
        setResponseScroll(0);
      } else if (input === "G") {
        setResponseScroll(clampResponseScroll(totalResponseLines));
      }
    }
  });

  // File browser view
  if (view === "file-browser") {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <CommandBar
          hints={textInputActive
            ? ["enter - confirm", "esc - cancel"]
            : ["j/k - navigate", "h/l - collapse/expand", "enter - select", "c - create", "n - env", "q - quit"]
          }
          env={envName}
        />
        <Box
          flexGrow={1}
          borderStyle="round"
          paddingX={1}
        >
          <TreeViewer
            cwd={process.cwd()}
            onSelect={handleFileSelect}
            onCreate={(name, parentFilename) => {
              // Normalize to lower-kebab-case for filename
              const slug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
              const filename = parentFilename
                ? `${slug}.${parentFilename}`
                : `${slug}.http`;
              const filePath = join(process.cwd(), filename);
              writeFileSync(filePath, `---\nname: ${name}\n---\n\n### New Request\nGET https://example.com\n`);
              setRawMode(false);
              openInEditor(filePath);
              setRawMode(true);
              setTreeRefreshKey((k) => k + 1);
            }}
            onTextInput={setTextInputActive}
            visibleHeight={contentHeight}
            refreshKey={treeRefreshKey}
          />
        </Box>
        {parseError ? (
          <Box>
            <Text color="red">Error: {parseError}</Text>
          </Box>
        ) : null}
      </Box>
    );
  }

  // Collection view
  if (view === "collection" && collection) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <CommandBar
          hints={["j/k - navigate", "enter - select", "c - new request", "v - vars", "n - env", "esc - back", "q - quit"]}
          env={envName}
        />
        <Box
          flexGrow={1}
          borderStyle="round"
          paddingX={1}
        >
          <CollectionViewer
            collection={collection}
            onSelect={handleEntrySelect}
            onBack={() => {
              setView("file-browser");
              setFilePath(null);
              setCollection(null);
            }}
            visibleHeight={contentHeight}
          />
        </Box>
      </Box>
    );
  }

  // Variables view
  if (view === "variables" && collection) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <CommandBar hints={["e - edit", "n - env", "esc - back", "q - quit"]} env={envName} />
        <Box
          flexGrow={1}
          borderStyle="round"
          paddingX={1}
        >
          <VariablesViewer variables={(() => {
            const tagged: TaggedVariable[] = [];
            const collectionKeys = new Set<string>();
            for (const [key, value] of Object.entries(collection.variables)) {
              tagged.push({ key, value, source: collection.name || "collection", sourceType: "collection" });
              collectionKeys.add(key);
            }
            for (const [key, value] of Object.entries(envVars)) {
              tagged.push({
                key,
                value,
                source: envName || "env",
                sourceType: "env",
                overridden: collectionKeys.has(key),
              });
            }
            return tagged;
          })()} />
        </Box>
      </Box>
    );
  }

  // Env picker view
  if (view === "env-picker") {
    const envs = listEnvironments(process.cwd());
    return (
      <Box flexDirection="column" width={width} height={height}>
        <CommandBar
          hints={textInputActive
            ? ["enter - confirm", "esc - cancel"]
            : ["j/k - navigate", "enter - select", "e - edit", "c - create", "esc - back", "q - quit"]
          }
          env={envName}
        />
        <Box
          flexGrow={1}
          borderStyle="round"
          paddingX={1}
        >
          <EnvPicker
            environments={envs}
            currentEnv={envName}
            onSelect={(env) => {
              setEnvVars(env.variables);
              setEnvName(env.name);
              saveSettings(process.cwd(), { environment: env.name });
            }}
            onClear={() => {
              setEnvVars({});
              setEnvName(null);
              saveSettings(process.cwd(), { environment: undefined });
            }}
            onBack={() => {
              setView(previousView);
            }}
            onEdit={(env) => {
              setRawMode(false);
              openInEditor(env.filePath);
              setRawMode(true);
              // Reload the env file after editing
              const reloaded = listEnvironments(process.cwd());
              const updated = reloaded.find((e) => e.name === env.name);
              if (updated && envName === env.name) {
                setEnvVars(updated.variables);
              }
            }}
            onCreate={(name) => {
              const env = createEnvironment(process.cwd(), name);
              setEnvVars(env.variables);
              setEnvName(env.name);
              saveSettings(process.cwd(), { environment: env.name });
              // Open it in the editor right away
              setRawMode(false);
              openInEditor(env.filePath);
              setRawMode(true);
              // Reload after editing
              const reloaded = listEnvironments(process.cwd());
              const updated = reloaded.find((e) => e.name === env.name);
              if (updated) {
                setEnvVars(updated.variables);
              }
            }}
            onTextInput={setTextInputActive}
          />
        </Box>
      </Box>
    );
  }

  // Request view
  const requestHints = [
    "enter - send",
    "e - edit",
    "h - history",
    "tab - response",
    "v - vars",
    "n - env",
    "j/k - scroll",
    "esc - back",
    "q - quit",
  ];

  const responseHints = [
    "j/k - scroll",
    "u/d - page",
    "g/G - top/bottom",
    "h - history",
    "tab - request",
    "n - env",
    "esc - back",
    "q - quit",
  ];

  const hints = focus === "response" ? responseHints : requestHints;
  const cmdBar = renderCommandBar(hints, width, envName);
  const reqLines = colorRequestLines(request);

  if (!showSplit) {
    return (
      <Text>
        {renderSinglePane(reqLines, requestScroll, width, height, cmdBar, historyLines)}
      </Text>
    );
  }

  const respLines = response
    ? getResponseLines(response, paneContentWidth)
    : loading
      ? ["Sending request..."]
      : error
        ? [`Error: ${error}`]
        : [];

  return (
    <Text>
      {renderSplitPane(
        reqLines,
        requestScroll,
        respLines,
        responseScroll,
        width,
        height,
        cmdBar,
        focus === "request",
        historyLines,
        responseHistoryLines
      )}
    </Text>
  );
}
