# TS-Mock-Proxy

A "Zero-Config" mock server that instantly generates a functional REST API from your TypeScript interfaces. Write your types, get a working API. Perfect for frontend developers who need to work independently of the backend.

---

## Tech Stack

Built with TypeScript, Express, and Swagger UI. Uses Intermock for type analysis and Faker for realistic test data generation.

---

## Quick Start

### Installation

```bash
# Clone the project
git clone <repo-url>
cd ts-mock-proxy

# Install dependencies
npm install

# Build the project
npm run build
```

### Usage

**Step 1: Define your TypeScript types**

Mark interfaces with `// @endpoint` to expose them as API endpoints:

```typescript
// types/user.ts
// @endpoint
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
}
```

**Step 2: Start the mock server**

**Interactive Mode (Recommended)**

```bash
npm run dev
# or
npx ts-mock-proxy
```

Y ou'll be prompted for:
- Types directory location
- Server port (default: 8080)
- Optional features (hot-reload, caching, latency simulation)

**CLI Mode (Automation)**

Use command-line options for scripting or CI/CD:

```bash
# Basic usage - specify your types directory
npx ts-mock-proxy --types-dir ./types --port 3000

# Examples
npx ts-mock-proxy --types-dir ./types --port 3000 --verbose

# With latency simulation
npx ts-mock-proxy --types-dir ./types --port 3000 --latency 500-2000

# Disable features
npx ts-mock-proxy --types-dir ./types --no-cache --no-hot-reload
```

**Available CLI Options**

```
Options:
  -t, --types-dir <path>        Directory with TypeScript types (required)
  -p, --port <number>           Server port (default: 8080)
  -l, --latency <range>         Latency simulation "min-max" (e.g., 500-2000)
  --no-hot-reload               Disable auto-reload on changes
  --no-cache                    Disable schema caching
  -v, --verbose                 Enable verbose logging
  -h, --help                    Show help
```

**Step 3: Call your API**

```bash
# Single object
curl http://localhost:8080/user
# → {"id": 482, "name": "John Doe", "email": "john.d@gmail.com", "role": "admin"}

# Array of objects (plural)
curl http://localhost:8080/users
# → [{"id": 1, ...}, {"id": 2, ...}, ...]
```

**Step 4: View API Documentation**

Access the auto-generated Swagger UI:

```
http://localhost:8080/api-docs
```

All endpoints are documented with examples and you can test them directly from your browser.

---

## Available Commands

- `npm run dev` - Start development server
- `npm run build` - Compile TypeScript  
- `npm start` - Start production server
- `npm test` - Run tests

---

## How It Works

The server maps URL paths to TypeScript interfaces by converting the route to PascalCase and singularizing it. For example:

- `/user` → looks for `User` interface → returns single object
- `/users` → looks for `User` interface → returns array of 3-10 objects

Only interfaces marked with `// @endpoint` are exposed. The server uses Intermock to parse TypeScript AST and Faker to generate realistic test data. Schemas are cached in memory for performance.

---

## 📄 License

MIT
