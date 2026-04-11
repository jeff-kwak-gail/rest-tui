import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "ink-testing-library";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import App from "./app.js";
import RequestViewer from "./request-viewer.js";
import ResponseViewer, { getResponseLines } from "./response-viewer.js";
import CollectionViewer from "./collection-viewer.js";
import TreeViewer from "./tree-viewer.js";
import { parseRequest } from "./parse-request.js";
import type { HttpResponse } from "./execute-request.js";
import type { Collection } from "./parse-collection.js";

const defaultResponseProps = {
  scrollOffset: 0,
  visibleHeight: 20,
  contentWidth: 80,
};

describe("App", () => {
  it("renders the title and version", () => {
    const { lastFrame } = render(<App />);
    const frame = lastFrame()!;
    expect(frame).toContain("rest-tui");
    expect(frame).toContain("v0.11.0");
  });

  it("shows file browser when no file given", () => {
    const { lastFrame } = render(<App />);
    const frame = lastFrame()!;
    // Should show the tree viewer (or empty message)
    expect(frame).toContain("rest-tui");
  });

  it("goes directly to request view for single-request file", () => {
    const tmp = join(tmpdir(), `rest-tui-test-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const file = join(tmp, "test.http");
    writeFileSync(file, "GET /health\nAccept: text/plain\n");
    const { lastFrame, unmount } = render(<App initialFile={file} />);
    const frame = lastFrame()!;
    expect(frame).toContain("GET");
    expect(frame).toContain("enter - send");
    unmount();
    rmSync(tmp, { recursive: true });
  });

  it("shows collection view for multi-request file", () => {
    const tmp = join(tmpdir(), `rest-tui-test-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const file = join(tmp, "test.http");
    writeFileSync(
      file,
      `---
name: Test
---

### First
GET /a

---

### Second
GET /b
`
    );
    const { lastFrame, unmount } = render(<App initialFile={file} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Test");
    expect(frame).toContain("First");
    expect(frame).toContain("Second");
    unmount();
    rmSync(tmp, { recursive: true });
  });

  it("exits when q is pressed", () => {
    const { stdin, unmount } = render(<App />);
    stdin.write("q");
    unmount();
  });
});

describe("CollectionViewer", () => {
  const collection: Collection = {
    name: "My API",
    variables: {},
    entries: [
      { title: "Create User", raw: "POST https://example.com/users\nContent-Type: application/json\n\n{}" },
      { title: "GET https://example.com/health", raw: "GET https://example.com/health" },
    ],
  };

  it("renders collection name and entries", () => {
    const { lastFrame } = render(
      <CollectionViewer collection={collection} onSelect={() => {}} onBack={() => {}} visibleHeight={20} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("My API");
    expect(frame).toContain("Create User");
    expect(frame).toContain("health");
  });

  it("shows cursor on first entry", () => {
    const { lastFrame } = render(
      <CollectionViewer collection={collection} onSelect={() => {}} onBack={() => {}} visibleHeight={20} />
    );
    expect(lastFrame()).toContain("❯");
  });

  it("selects entry on enter", () => {
    let selected = -1;
    const { stdin } = render(
      <CollectionViewer collection={collection} onSelect={(i) => (selected = i)} onBack={() => {}} visibleHeight={20} />
    );
    stdin.write("\r");
    expect(selected).toBe(0);
  });

  it("shows empty message when no entries", () => {
    const empty: Collection = { name: null, variables: {}, entries: [] };
    const { lastFrame } = render(
      <CollectionViewer collection={empty} onSelect={() => {}} onBack={() => {}} visibleHeight={20} />
    );
    expect(lastFrame()).toContain("No requests found");
  });
});

describe("parseRequest", () => {
  it("parses method and url", () => {
    const result = parseRequest("GET https://example.com/api\n");
    expect(result.method).toBe("GET");
    expect(result.url).toBe("https://example.com/api");
    expect(result.body).toBe("");
  });

  it("parses headers", () => {
    const raw = `POST https://example.com
Authorization: Bearer abc123
Content-Type: application/json
`;
    const result = parseRequest(raw);
    expect(result.headers["Authorization"]).toBe("Bearer abc123");
    expect(result.headers["Content-Type"]).toBe("application/json");
  });

  it("parses body after blank line", () => {
    const raw = `POST https://example.com
Content-Type: application/json

{"key": "value"}`;
    const result = parseRequest(raw);
    expect(result.body).toBe('{"key": "value"}');
  });

  it("skips comment lines", () => {
    const raw = `# This is a comment
GET https://example.com
# Another comment
Authorization: Bearer token
`;
    const result = parseRequest(raw);
    expect(result.method).toBe("GET");
    expect(result.url).toBe("https://example.com");
    expect(result.headers["Authorization"]).toBe("Bearer token");
  });

  it("throws on invalid request line", () => {
    expect(() => parseRequest("not a valid request")).toThrow(
      "Invalid request line"
    );
  });
});

describe("ResponseViewer", () => {
  it("shows loading state", () => {
    const { lastFrame } = render(
      <ResponseViewer response={null} loading={true} error={null} {...defaultResponseProps} />
    );
    expect(lastFrame()).toContain("Sending request...");
  });

  it("shows error", () => {
    const { lastFrame } = render(
      <ResponseViewer
        response={null}
        loading={false}
        error="Connection refused"
        {...defaultResponseProps}
      />
    );
    expect(lastFrame()).toContain("Error: Connection refused");
  });

  it("renders response status and body", () => {
    const res: HttpResponse = {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: '{"result": true}',
      elapsed: 42,
      timestamp: "2026-01-01T00:00:00.000Z",
      requestMethod: "GET",
      requestUrl: "https://example.com",
    };
    const { lastFrame } = render(
      <ResponseViewer response={res} loading={false} error={null} {...defaultResponseProps} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("200");
    expect(frame).toContain("OK");
    expect(frame).toContain("42ms");
    expect(frame).toContain("content-type");
    expect(frame).toContain("result");
  });

  it("renders nothing when no response and not loading", () => {
    const { lastFrame } = render(
      <ResponseViewer response={null} loading={false} error={null} {...defaultResponseProps} />
    );
    expect(lastFrame()).toBe("");
  });

  it("orders output as status, blank, headers, blank, body", () => {
    const res: HttpResponse = {
      status: 200,
      statusText: "OK",
      headers: { "x-foo": "bar" },
      body: '{"a":1}',
      elapsed: 10,
      timestamp: "2026-01-01T00:00:00.000Z",
      requestMethod: "GET",
      requestUrl: "https://example.com",
    };
    const lines = getResponseLines(res);
    expect(lines[0]).toContain("200");
    expect(lines[1]).toBe("");
    expect(lines[2]).toContain("x-foo");
    expect(lines[2]).toContain("bar");
    expect(lines[3]).toBe("");
    expect(lines.slice(4).join("")).toContain('"a"');
  });

  it("respects scrollOffset", () => {
    const res: HttpResponse = {
      status: 200,
      statusText: "OK",
      headers: { "x-one": "1", "x-two": "2", "x-three": "3" },
      body: '{"a":1}',
      elapsed: 10,
      timestamp: "2026-01-01T00:00:00.000Z",
      requestMethod: "GET",
      requestUrl: "https://example.com",
    };
    const { lastFrame } = render(
      <ResponseViewer response={res} loading={false} error={null} scrollOffset={1} visibleHeight={2} contentWidth={80} />
    );
    const frame = lastFrame()!;
    expect(frame).not.toContain("200");
    expect(frame).toContain("x-one");
  });
});

describe("TreeViewer", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `rest-tui-tv-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true });
  });

  it("shows message when no .http files found", () => {
    const { lastFrame } = render(
      <TreeViewer cwd={tmp} onSelect={() => {}} onCreate={() => {}} visibleHeight={20} />
    );
    expect(lastFrame()).toContain("No .http files found");
  });

  it("renders tree with parent and child", () => {
    writeFileSync(
      join(tmp, "parent.http"),
      "---\nname: Parent API\n---\n\nGET /a\n"
    );
    writeFileSync(join(tmp, "child.parent.http"), "GET /b\n");
    const { lastFrame } = render(
      <TreeViewer cwd={tmp} onSelect={() => {}} onCreate={() => {}} visibleHeight={20} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("parent");
    expect(frame).toContain("Parent API");
    expect(frame).toContain("child");
  });

  it("shows cursor on first item", () => {
    writeFileSync(join(tmp, "test.http"), "GET /a\n");
    const { lastFrame } = render(
      <TreeViewer cwd={tmp} onSelect={() => {}} onCreate={() => {}} visibleHeight={20} />
    );
    expect(lastFrame()).toContain("❯");
  });

  it("selects with enter and passes variables", () => {
    writeFileSync(
      join(tmp, "root.http"),
      "---\nbaseUrl: https://example.com\n---\n\nGET /a\n"
    );
    let selectedPath = "";
    let selectedVars: Record<string, string> = {};
    const { stdin } = render(
      <TreeViewer
        cwd={tmp}
        onSelect={(p, v) => { selectedPath = p; selectedVars = v; }}
        onCreate={() => {}}
        visibleHeight={20}
      />
    );
    stdin.write("\r");
    expect(selectedPath).toBe(join(tmp, "root.http"));
    expect(selectedVars).toEqual({ baseUrl: "https://example.com" });
  });
});

describe("RequestViewer", () => {
  it("shows placeholder when request is empty", () => {
    const { lastFrame } = render(<RequestViewer request="" />);
    expect(lastFrame()).toContain("No request. Press e to edit.");
  });

  it("renders HTTP headers and JSON body", () => {
    const req = `GET /api/test
Content-Type: application/json

{"key": "value"}`;
    const { lastFrame } = render(<RequestViewer request={req} />);
    const frame = lastFrame()!;
    expect(frame).toContain("GET");
    expect(frame).toContain("Content-Type");
    expect(frame).toContain("key");
  });

  it("renders request with no body", () => {
    const req = `GET /api/health
Accept: text/plain`;
    const { lastFrame } = render(<RequestViewer request={req} />);
    const frame = lastFrame()!;
    expect(frame).toContain("GET");
    expect(frame).toContain("Accept");
  });
});
