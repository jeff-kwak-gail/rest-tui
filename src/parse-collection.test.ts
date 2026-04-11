import { describe, it, expect } from "vitest";
import { parseCollection, substituteVariables } from "./parse-collection.js";

describe("parseCollection", () => {
  it("parses front matter and multiple entries", () => {
    const content = `---
name: My API
baseUrl: https://example.com
---

### Create User
POST https://example.com/users
Content-Type: application/json

{"name": "test"}

---

### Get Users
GET https://example.com/users
`;
    const col = parseCollection(content);
    expect(col.name).toBe("My API");
    expect(col.variables["baseUrl"]).toBe("https://example.com");
    expect(col.entries).toHaveLength(2);
    expect(col.entries[0].title).toBe("Create User");
    expect(col.entries[1].title).toBe("Get Users");
  });

  it("falls back to method+url when no ### title", () => {
    const content = `---
name: Test
---

GET https://example.com/health
`;
    const col = parseCollection(content);
    expect(col.entries[0].title).toBe("GET https://example.com/health");
  });

  it("handles files with no front matter", () => {
    const content = `GET https://example.com/health

---

POST https://example.com/data
Content-Type: application/json

{"key": "value"}
`;
    const col = parseCollection(content);
    expect(col.name).toBeNull();
    expect(col.entries).toHaveLength(2);
  });

  it("handles single-request files with no separators", () => {
    const content = `GET https://example.com/health
Accept: application/json
`;
    const col = parseCollection(content);
    expect(col.entries).toHaveLength(1);
    expect(col.entries[0].title).toBe(
      "GET https://example.com/health"
    );
  });

  it("skips empty sections between consecutive separators", () => {
    const content = `---
name: Test
---

GET https://example.com/a

---

---

GET https://example.com/b
`;
    const col = parseCollection(content);
    expect(col.entries).toHaveLength(2);
  });

  it("throws on section with multiple requests", () => {
    const content = `---
name: Test
---

GET https://example.com/a
POST https://example.com/b
`;
    expect(() => parseCollection(content)).toThrow(
      "contains 2 requests"
    );
  });

  it("handles separator variations (more than 3 dashes)", () => {
    const content = `---
name: Test
---

GET https://example.com/a

------

GET https://example.com/b
`;
    const col = parseCollection(content);
    expect(col.entries).toHaveLength(2);
  });

  it("does not split on lines with text after dashes", () => {
    const content = `---
name: Test
---

POST https://example.com/upload
Content-Type: multipart/form-data

------OmegaBoundary
Content-Disposition: form-data; name="file"

data
------OmegaBoundary--
`;
    const col = parseCollection(content);
    expect(col.entries).toHaveLength(1);
    expect(col.entries[0].raw).toContain("OmegaBoundary");
  });

  it("preserves ### title in raw text", () => {
    const content = `---
name: Test
---

### My Request
GET https://example.com/test
`;
    const col = parseCollection(content);
    expect(col.entries[0].raw).toContain("### My Request");
    expect(col.entries[0].title).toBe("My Request");
  });

  it("uses first ### title when multiple exist", () => {
    const content = `---
name: Test
---

### First Title
# just a comment
### Second Title
GET https://example.com/test
`;
    const col = parseCollection(content);
    expect(col.entries[0].title).toBe("First Title");
  });

  it("separates name from variables", () => {
    const content = `---
name: My API
baseUrl: https://example.com
token: abc123
---

GET https://example.com/test
`;
    const col = parseCollection(content);
    expect(col.name).toBe("My API");
    expect(col.variables["baseUrl"]).toBe("https://example.com");
    expect(col.variables["token"]).toBe("abc123");
    expect(col.variables).not.toHaveProperty("name");
  });
});

describe("substituteVariables", () => {
  it("replaces {{var}} with values", () => {
    const result = substituteVariables(
      "GET {{baseUrl}}/api\nAuthorization: Bearer {{token}}",
      { baseUrl: "https://example.com", token: "abc123" }
    );
    expect(result).toBe(
      "GET https://example.com/api\nAuthorization: Bearer abc123"
    );
  });

  it("leaves unmatched variables as-is", () => {
    const result = substituteVariables(
      "GET {{baseUrl}}/{{unknown}}",
      { baseUrl: "https://example.com" }
    );
    expect(result).toBe("GET https://example.com/{{unknown}}");
  });

  it("handles empty variables", () => {
    const result = substituteVariables("GET {{url}}/api", {});
    expect(result).toBe("GET {{url}}/api");
  });

  it("replaces multiple occurrences of the same variable", () => {
    const result = substituteVariables(
      "{{host}}/a and {{host}}/b",
      { host: "localhost" }
    );
    expect(result).toBe("localhost/a and localhost/b");
  });
});
