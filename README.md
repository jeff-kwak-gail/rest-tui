# rest-tui

A terminal REST client with vim-style navigation, collection management, environment variables, and syntax-highlighted request/response views.

Built with React, [Ink](https://github.com/vadimdemedes/ink), and TypeScript.

![Version](https://img.shields.io/badge/version-0.11.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D16-brightgreen)

## Features

- **Vim-style navigation** -- `j/k` movement, `g/G` jump, `u/d` page scroll across all views
- **Collection files** -- organize requests in `.http` files with YAML front matter and `{{variable}}` substitution
- **Hierarchical collections** -- dotted filenames (`api.http` > `api.users.http`) create parent-child trees with inherited variables
- **Environment support** -- switch between `.env` files to override variables per environment
- **Split-pane layout** -- request and response side-by-side with tab-switching focus
- **Request & response history** -- last 10 of each, navigable with number keys
- **Syntax highlighting** -- HTTP methods, headers, JSON bodies, and status codes are color-coded
- **External editor integration** -- press `e` to open any file in `$EDITOR` (defaults to vim)
- **Persistent settings** -- remembers last opened file, selected entry, and active environment

## Installation

```bash
git clone <repo-url>
cd rest-tui
npm install
```

Requires **Node.js 16+**.

## Usage

```bash
# Open the file browser
npm start

# Open a specific collection file
npm start path/to/collection.http
```

## Collection File Format

Collection files use the `.http` extension. Requests are separated by `---` (three or more dashes). An optional YAML front matter block defines the collection name and variables.

```http
---
name: My API
baseUrl: https://api.example.com
token: abc123
---

### List Users
GET {{baseUrl}}/users
Authorization: Bearer {{token}}

---

### Create User
POST {{baseUrl}}/users
Content-Type: application/json

{
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

### Variable Resolution

Variables use `{{name}}` syntax and resolve in this order (later sources override earlier):

1. **Ancestor collection variables** -- inherited from parent files via dotted naming
2. **Collection variables** -- defined in the file's front matter
3. **Environment variables** -- loaded from the active `.env` file

### Hierarchical Collections

Dotted filenames create a tree structure. Child collections inherit variables from their parents:

```
api.http              # defines baseUrl
api.users.http        # inherits baseUrl, can override or add variables
api.users.admin.http  # inherits from both parents
```

## Environment Files

Environment files are standard `.env` files in the working directory:

```env
# production.env
baseUrl=https://api.example.com
apiKey=sk-live-xxx
```

```env
# development.env
baseUrl=http://localhost:3000
apiKey=sk-test-xxx
```

Switch environments with `n` from any view. Create new environments with `c` in the environment picker.

## Keyboard Shortcuts

### Global

| Key     | Action                    |
|---------|---------------------------|
| `q`     | Quit                      |
| `n`     | Open environment picker   |
| `Esc`   | Go back                   |

### File Browser

| Key       | Action                    |
|-----------|---------------------------|
| `j` / `k` | Navigate up/down         |
| `l` / `h` | Expand / collapse node   |
| `Enter`   | Open collection          |
| `c`       | Create new collection    |

### Collection View

| Key       | Action                        |
|-----------|-------------------------------|
| `j` / `k` | Navigate requests            |
| `Enter`   | Select request               |
| `c`       | Add new request to file      |
| `e`       | Edit file in `$EDITOR`       |
| `v`       | View merged variables        |

### Request View

| Key            | Action                        |
|----------------|-------------------------------|
| `Enter`        | Send request                  |
| `j` / `k`     | Scroll up/down                |
| `u` / `d`     | Page up/down                  |
| `g` / `G`     | Jump to top/bottom            |
| `Tab`          | Switch focus to response      |
| `h`           | Toggle request history         |
| `e`           | Edit in `$EDITOR`              |
| `v`           | View merged variables          |
| `1`-`9`, `0`  | Jump to history item           |

### Response View

| Key            | Action                        |
|----------------|-------------------------------|
| `j` / `k`     | Scroll up/down                |
| `u` / `d`     | Page up/down                  |
| `g` / `G`     | Jump to top/bottom            |
| `Tab`          | Switch focus to request       |
| `h`           | Toggle response history        |
| `1`-`9`, `0`  | Jump to history item           |

### Environment Picker

| Key       | Action                    |
|-----------|---------------------------|
| `j` / `k` | Navigate environments    |
| `Enter`   | Select environment       |
| `c`       | Create new environment   |
| `e`       | Edit environment file    |

## Settings

Settings are stored in `.rest-tui/` in the working directory:

| File                    | Purpose                              |
|-------------------------|--------------------------------------|
| `settings.ini`          | Last file, entry, and environment    |
| `request-history.json`  | Last 10 sent requests                |
| `response-history.json` | Last 10 received responses           |

## Development

```bash
# Run the app
npm start

# Run tests
npm test
```

### Tech Stack

- **[Ink](https://github.com/vadimdemedes/ink)** -- React renderer for the terminal
- **React 19** -- UI component model and state management
- **TypeScript 6** -- type safety
- **[tsx](https://github.com/privatenumber/tsx)** -- direct TypeScript execution, no build step needed
- **[Vitest](https://vitest.dev/)** -- test runner

### Project Structure

```
src/
  main.tsx                # Entry point
  app.tsx                 # Main app component, state management, key handling
  parse-collection.ts     # .http file parsing and variable substitution
  parse-request.ts        # HTTP request line parsing
  execute-request.ts      # HTTP execution via fetch
  collection-tree.ts      # Hierarchical file tree from dotted filenames
  settings.ts             # Persistent settings (INI format)
  environment.ts          # .env file management
  tree-viewer.tsx         # File browser component
  collection-viewer.tsx   # Request list component
  request-viewer.tsx      # Request display with syntax highlighting
  response-viewer.tsx     # Response display with status coloring
  env-picker.tsx          # Environment selector component
  variables-viewer.tsx    # Merged variable display
  render-screen.ts        # Screen layout (command bar, split panes, history)
  render-pane.ts          # Low-level pane rendering with scrollbars
  editor.ts               # $EDITOR integration
```

## License

MIT
