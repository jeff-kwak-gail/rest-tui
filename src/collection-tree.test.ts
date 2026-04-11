import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildTree,
  flattenTree,
  resolveVariables,
} from "./collection-tree.js";

describe("buildTree", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `rest-tui-tree-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true });
  });

  it("builds a simple parent-child tree", () => {
    writeFileSync(
      join(tmp, "company.http"),
      "---\nname: Company API\nbaseUrl: https://api.example.com\n---\n\nGET https://api.example.com/health\n"
    );
    writeFileSync(
      join(tmp, "team.company.http"),
      "---\nname: Team API\ntoken: abc\n---\n\nGET https://api.example.com/team\n"
    );

    const { roots } = buildTree(tmp);
    expect(roots).toHaveLength(1);
    expect(roots[0].segment).toBe("company");
    expect(roots[0].displayName).toBe("Company API");
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].segment).toBe("team");
    expect(roots[0].children[0].displayName).toBe("Team API");
  });

  it("handles orphan files at root level", () => {
    writeFileSync(
      join(tmp, "orphan.missing-parent.http"),
      "GET https://example.com/test\n"
    );

    const { roots } = buildTree(tmp);
    expect(roots).toHaveLength(1);
    expect(roots[0].segment).toBe("orphan");
  });

  it("builds multi-level tree", () => {
    writeFileSync(join(tmp, "root.http"), "GET /a\n");
    writeFileSync(join(tmp, "child.root.http"), "GET /b\n");
    writeFileSync(join(tmp, "grandchild.child.root.http"), "GET /c\n");

    const { roots } = buildTree(tmp);
    expect(roots).toHaveLength(1);
    expect(roots[0].segment).toBe("root");
    expect(roots[0].children[0].segment).toBe("child");
    expect(roots[0].children[0].children[0].segment).toBe("grandchild");
  });

  it("handles siblings", () => {
    writeFileSync(join(tmp, "parent.http"), "GET /a\n");
    writeFileSync(join(tmp, "alpha.parent.http"), "GET /b\n");
    writeFileSync(join(tmp, "beta.parent.http"), "GET /c\n");

    const { roots } = buildTree(tmp);
    expect(roots[0].children).toHaveLength(2);
    expect(roots[0].children[0].segment).toBe("alpha");
    expect(roots[0].children[1].segment).toBe("beta");
  });

  it("ignores hidden files", () => {
    writeFileSync(join(tmp, ".hidden.http"), "GET /a\n");
    writeFileSync(join(tmp, "visible.http"), "GET /b\n");

    const { roots } = buildTree(tmp);
    expect(roots).toHaveLength(1);
    expect(roots[0].segment).toBe("visible");
  });
});

describe("flattenTree", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `rest-tui-flat-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, "root.http"), "GET /a\n");
    writeFileSync(join(tmp, "child.root.http"), "GET /b\n");
    writeFileSync(join(tmp, "grandchild.child.root.http"), "GET /c\n");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true });
  });

  it("flattens with all expanded", () => {
    const { roots } = buildTree(tmp);
    const expanded = new Set(["root.http", "child.root.http"]);
    const rows = flattenTree(roots, expanded);
    expect(rows).toHaveLength(3);
    expect(rows[0].depth).toBe(0);
    expect(rows[1].depth).toBe(1);
    expect(rows[2].depth).toBe(2);
  });

  it("hides children when collapsed", () => {
    const { roots } = buildTree(tmp);
    const expanded = new Set<string>();
    const rows = flattenTree(roots, expanded);
    expect(rows).toHaveLength(1);
    expect(rows[0].node.segment).toBe("root");
  });

  it("partially expands", () => {
    const { roots } = buildTree(tmp);
    const expanded = new Set(["root.http"]);
    const rows = flattenTree(roots, expanded);
    expect(rows).toHaveLength(2);
    expect(rows[0].node.segment).toBe("root");
    expect(rows[1].node.segment).toBe("child");
  });
});

describe("resolveVariables", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `rest-tui-vars-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true });
  });

  it("inherits parent variables", () => {
    writeFileSync(
      join(tmp, "parent.http"),
      "---\nbaseUrl: https://prod.example.com\n---\n\nGET /a\n"
    );
    writeFileSync(
      join(tmp, "child.parent.http"),
      "---\ntoken: abc123\n---\n\nGET /b\n"
    );

    const { nodeMap } = buildTree(tmp);
    const vars = resolveVariables("child.parent.http", nodeMap);
    expect(vars).toEqual({
      baseUrl: "https://prod.example.com",
      token: "abc123",
    });
  });

  it("child overrides parent variables", () => {
    writeFileSync(
      join(tmp, "parent.http"),
      "---\nbaseUrl: https://prod.example.com\n---\n\nGET /a\n"
    );
    writeFileSync(
      join(tmp, "child.parent.http"),
      "---\nbaseUrl: https://staging.example.com\n---\n\nGET /b\n"
    );

    const { nodeMap } = buildTree(tmp);
    const vars = resolveVariables("child.parent.http", nodeMap);
    expect(vars["baseUrl"]).toBe("https://staging.example.com");
  });

  it("resolves three-level chain", () => {
    writeFileSync(
      join(tmp, "root.http"),
      "---\na: 1\nb: 2\n---\n\nGET /a\n"
    );
    writeFileSync(
      join(tmp, "mid.root.http"),
      "---\nb: override\nc: 3\n---\n\nGET /b\n"
    );
    writeFileSync(
      join(tmp, "leaf.mid.root.http"),
      "---\nd: 4\n---\n\nGET /c\n"
    );

    const { nodeMap } = buildTree(tmp);
    const vars = resolveVariables("leaf.mid.root.http", nodeMap);
    expect(vars).toEqual({ a: "1", b: "override", c: "3", d: "4" });
  });
});
