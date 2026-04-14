import { useState, useCallback, useEffect } from "react";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { Box, Text, useApp, useInput, useStdin, useStdout } from "ink";
import { getRequestLines, colorRequestLines } from "./request-viewer.js";
import { getResponseLines } from "./response-viewer.js";
import {
  renderCommandBar,
  renderHelpPopup,
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
        rest-tui v0.12.1
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
      const dir = dirname(fileToLoad);
      const { nodeMap } = buildTree(dir);
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
  const [resolvedRequest, setResolvedRequest] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

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
  const requestPrefix = resolvedRequest
    ? (() => {
        for (const line of resolvedRequest.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i.test(trimmed)) {
            return colorRequestLines(trimmed)[0];
          }
          break;
        }
        return null;
      })()
    : null;
  const respLines = response
    ? (() => {
        const lines = getResponseLines(response, paneContentWidth);
        if (requestPrefix) lines[0] = requestPrefix + "  " + lines[0];
        return lines;
      })()
    : loading
      ? [requestPrefix ? requestPrefix + "  Sending request..." : "Sending request..."]
      : error
        ? [requestPrefix ? requestPrefix + "  Error: " + error : "Error: " + error]
        : [];
  const totalResponseLines = respLines.length;

  const clampRequestScroll = (offset: number) =>
    Math.max(0, Math.min(offset, Math.max(0, totalRequestLines - requestVisibleHeight)));
  const clampResponseScroll = (offset: number) =>
    Math.max(0, Math.min(offset, Math.max(0, totalResponseLines - responseVisibleHeight)));

  // Load file and parse collection
  const getAncestorVariables = useCallback((path: string): Record<string, string> => {
    const dir = dirname(path);
    const { nodeMap } = buildTree(dir);
    const fname = basename(path);
    return nodeMap.has(fname) ? resolveVariables(fname, nodeMap) : {};
  }, []);

  const loadCollection = useCallback(
    (path: string, ancestorVariables?: Record<string, string>) => {
      let col: Collection;
      try {
        const content = loadFile(path);
        col = parseCollection(content);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
        return;
      }
      // Merge ancestor variables (ancestors as base, self overrides)
      const ancestors = ancestorVariables ?? getAncestorVariables(path);
      col.variables = { ...ancestors, ...col.variables };
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
    setResolvedRequest(null);
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
    const allVars = { ...(collection?.variables ?? {}), ...envVars };
    const resolved = substituteVariables(request, allVars);
    setResolvedRequest(resolved);
    try {
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
  }, [request, collection, envVars]);

  useInput((input, key) => {
    // Skip all key handling when a text input is active
    if (textInputActive) return;

    // Help popup
    if (showHelp) {
      if (input === "?" || key.escape) {
        setShowHelp(false);
      }
      return;
    }
    if (input === "?") {
      setShowHelp(true);
      return;
    }

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
        const ancestors = getAncestorVariables(filePath);
        col.variables = { ...ancestors, ...col.variables };
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
      if (input === "e" && filePath) {
        setRawMode(false);
        const updated = openInEditor(filePath);
        setRawMode(true);
        try {
          const col = parseCollection(updated);
          const ancestors = getAncestorVariables(filePath);
          col.variables = { ...ancestors, ...col.variables };
          setCollection(col);
        } catch {
          // Parse error — stay on collection view
        }
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
          const ancestors = getAncestorVariables(filePath);
          col.variables = { ...ancestors, ...col.variables };
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
    if (input === "v" && collection) {
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
      let line: number | undefined;
      const idx = fileContent.indexOf(request);
      if (idx !== -1) {
        line = fileContent.slice(0, idx).split("\n").length;
      }
      setRawMode(false);
      const updated = openInEditor(filePath, line);
      setRawMode(true);
      // Re-parse collection and reload current entry
      const col = parseCollection(updated);
      const ancestors = getAncestorVariables(filePath);
      col.variables = { ...ancestors, ...col.variables };
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
        setResolvedRequest(null);
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

  // Context-sensitive help hints
  const currentHints = (() => {
    switch (view) {
      case "file-browser":
        return ["j/k - navigate", "h/l - collapse/expand", "/ - search", "enter - select", "e - edit", "c - create", "n - env", "q - quit"];
      case "collection":
        return ["j/k - navigate", "/ - search", "enter - select", "e - edit", "c - create", "v - vars", "n - env", "esc - back", "q - quit"];
      case "variables":
        return ["e - edit", "n - env", "esc - back", "q - quit"];
      case "env-picker":
        return ["j/k - navigate", "enter - select", "e - edit", "c - create", "esc - back", "q - quit"];
      case "request":
        return focus === "response"
          ? ["j/k - scroll", "u/d - page", "g/G - top/bottom", "h - history", "tab - request", "v - vars", "n - env", "esc - back", "q - quit"]
          : ["enter - send", "e - edit", "h - history", "tab - response", "v - vars", "n - env", "j/k - scroll", "esc - back", "q - quit"];
    }
  })();

  // Help popup
  if (showHelp) {
    const cmdBar = renderCommandBar(["esc/? - close"], width, envName);
    return (
      <Text>
        {renderHelpPopup(currentHints, width, height, cmdBar)}
      </Text>
    );
  }

  // File browser view
  if (view === "file-browser") {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <CommandBar
          hints={textInputActive ? ["enter - confirm", "esc - cancel"] : ["? - help"]}
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
            onEdit={(path) => {
              setRawMode(false);
              openInEditor(path);
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
          hints={textInputActive ? ["enter - confirm", "esc - cancel"] : ["? - help"]}
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
            onTextInput={setTextInputActive}
          />
        </Box>
      </Box>
    );
  }

  // Variables view
  if (view === "variables" && collection) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <CommandBar hints={["? - help"]} env={envName} />
        <Box
          flexGrow={1}
          borderStyle="round"
          paddingX={1}
        >
          <VariablesViewer variables={(() => {
            const tagged: TaggedVariable[] = [];
            const collectionKeys = new Set<string>();

            // Walk the ancestor chain to tag each variable with its true source
            if (filePath) {
              const dir = dirname(filePath);
              const { nodeMap } = buildTree(dir);
              const fname = basename(filePath);
              const chain: { name: string; variables: Record<string, string> }[] = [];
              let cur = fname;
              while (nodeMap.has(cur)) {
                const node = nodeMap.get(cur)!;
                chain.unshift({ name: node.displayName || node.segment, variables: node.variables });
                const bn = cur.slice(0, -5);
                const segs = bn.split(".");
                const parentBn = segs.slice(1).join(".");
                cur = parentBn ? `${parentBn}.http` : "";
              }
              // Track which key is last set by which source (last wins)
              const resolved = new Map<string, { value: string; source: string }>();
              for (const link of chain) {
                for (const [key, value] of Object.entries(link.variables)) {
                  resolved.set(key, { value, source: link.name });
                }
              }
              for (const [key, { value, source }] of resolved) {
                tagged.push({ key, value, source, sourceType: "collection" });
                collectionKeys.add(key);
              }
            } else {
              for (const [key, value] of Object.entries(collection.variables)) {
                tagged.push({ key, value, source: collection.name || "collection", sourceType: "collection" });
                collectionKeys.add(key);
              }
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
          })()} contentWidth={width - 4} />
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
          hints={textInputActive ? ["enter - confirm", "esc - cancel"] : ["? - help"]}
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
  const cmdBar = renderCommandBar(["? - help"], width, envName);
  const reqLines = colorRequestLines(request);

  if (!showSplit) {
    return (
      <Text>
        {renderSinglePane(reqLines, requestScroll, width, height, cmdBar, historyLines)}
      </Text>
    );
  }

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
