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

You'll be prompted for:
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
  --mock-mode <strict|dev>      Mock mode (default: dev)
  --no-hot-reload               Disable auto-reload on changes
  --no-cache                    Disable schema caching
  -v, --verbose                 Enable verbose logging
  -h, --help                    Show help
```

**Environment Variables**

| Variable | Values | Description |
|---|---|---|
| `MOCK_API_MODE` | `strict`, `dev` | Override mock mode without CLI flag |

Resolution order: CLI `--mock-mode` > `MOCK_API_MODE` env var > config file > default (`dev`).

**Step 3: Call your API**

The server enforces idiomatic REST URL patterns:

| URL | Result |
|---|---|
| `GET /users` | Array of `User` (paginated) |
| `GET /users/123` | Single `User` |
| `GET /users/{uuid}` | Single `User` |
| `GET /users/123/posts` | Array of `Post` (if `Post` is defined) |
| `GET /user` | 404 — singular collection names are rejected |
| `GET /users/123/posts/456` | 404 — nested single-item not supported |

```bash
# List (plural URL) — with pagination metadata
curl http://localhost:8080/users
# → {"data": [...], "meta": {"total": 100, "page": 1, "pageSize": 20, "totalPages": 5}}

# Single item by numeric ID
curl http://localhost:8080/users/1
# → {"id": 482, "name": "John Doe", "email": "john.d@gmail.com", "role": "admin"}

# Single item by UUID
curl http://localhost:8080/users/550e8400-e29b-41d4-a716-446655440000
# → {"id": 482, "name": "John Doe", ...}

# Nested collection (requires Post interface with @endpoint)
curl http://localhost:8080/users/1/posts
# → {"data": [...], "meta": {...}}
```

URL prefix segments `api` and `v{n}` are stripped automatically, so `/api/v1/users/1` works the same as `/users/1`.

**Step 4: View API Documentation**

Access the auto-generated Swagger UI:

```
http://localhost:8080/api-docs
```

All endpoints are documented with examples and you can test them directly from your browser.

---

## Pagination, Filtering & Sorting

All list endpoints (plural routes that return an array) support pagination, filtering, and sorting via query parameters. Responses always use the envelope format:

```json
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 2,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

The server generates a pool of 100 mock items and applies your filters/sort/pagination to that pool, so `total` and `totalPages` reflect realistic numbers.

### Pagination

| Param | Default | Max | Description |
|---|---|---|---|
| `page` | `1` | — | Page number (1-based) |
| `pageSize` | `20` | `100` | Items per page |

```bash
GET /users?page=2&pageSize=50
```

### Filtering

| Convention | Applies to | Example | Description |
|---|---|---|---|
| `field=value` | string, number, boolean | `status=active` | Exact match (case-insensitive for strings) |
| `field_contains=value` | string | `email_contains=@example.com` | Substring match (case-insensitive) |
| `field_gte=value` | number, date | `price_gte=10`, `createdAt_gte=2024-01-01` | Greater than or equal |
| `field_lte=value` | number, date | `price_lte=100`, `createdAt_lte=2024-12-31` | Less than or equal |

Multiple filters are combined with AND logic. Unknown fields are silently ignored. Date values must be ISO 8601.

```bash
GET /users?status=active&email_contains=@example.com&createdAt_gte=2024-01-01
GET /products?price_gte=10&price_lte=100&status=active
```

### Sorting

Use `sort=field:dir` with comma-separated entries for multi-field sort. Direction must be `asc` or `desc`.

```bash
GET /users?sort=createdAt:desc,lastName:asc
```

Sorting by a field that does not exist in the interface returns `400`.

### Combined Example

```bash
GET /users?page=2&pageSize=50&status=active&email_contains=@example.com&sort=createdAt:desc
```

### Error Responses

Invalid query parameters return `400` with a descriptive message:

```json
{ "error": "Invalid query parameters", "message": "\"pageSize\" must not exceed 100" }
{ "error": "Invalid sort parameter", "message": "Cannot sort by unknown field \"foo\". Allowed fields: email, id, name" }
```

---

## 🎯 Field Constraints with JSDoc Annotations

Add validation constraints to your interfaces using JSDoc annotations. This ensures generated mock data follows your API rules.

### Supported Constraints

| Annotation | Type | Example | Description |
|---|---|---|---|
| `@minLength` | string | `@minLength 3` | Minimum string length |
| `@maxLength` | string | `@maxLength 10` | Maximum string length |
| `@pattern` | string | `@pattern ^[a-z]+$` | Regex pattern validation |
| `@min` | number | `@min 1` | Minimum numeric value |
| `@max` | number | `@max 100` | Maximum numeric value |
| `@enum` | any | `@enum ACTIVE,INACTIVE,PENDING` | Allowed values (comma-separated) |

### Usage Examples

```typescript
// @endpoint
export interface Badge {
  /** @maxLength 10 */
  label: string;
  
  /** @min 1 @max 5 */
  level: number;
  
  /** @enum ACTIVE,INACTIVE,PENDING */
  status: string;
}
```

Response:
```json
{ "label": "New", "level": 3, "status": "ACTIVE" }
```

### More Examples

```typescript
// @endpoint
export interface User {
  id: number;
  
  /** @minLength 3 @maxLength 20 */
  username: string;
  
  // not needed, email is one of the types handled by intermock
  email: string;
  
  /** @min 18 @max 120 */
  age: number;
}

// @endpoint
export interface Product {
  /** @maxLength 50 */
  title: string;
  
  /** @minLength 10 @maxLength 500 */
  description: string;
  
  /** @min 0.01 @max 999999.99 */
  price: number;
  
  /** @enum DRAFT,PUBLISHED,ARCHIVED */
  status: string;
}
```

### How It Works

1. Constraints are extracted from JSDoc comments when generating mock data
2. Intermock generates base mock data
3. The constraint resolver applies your rules to ensure valid data
4. **No validation** - constraints are applied, not enforced. Mocks always return valid data.



## Available Commands

- `npm run dev` - Start development server
- `npm run build` - Compile TypeScript
- `npm start` - Start production server
- `npm test` - Run all tests
- `npm test -- queryProcessor.test.ts` - Test pagination/filtering/sorting
- `npm test -- constraintExtractor.test.ts` - Test constraint JSDoc extraction
- `npm test -- constraintValidator.test.ts` - Test constraint validation
- `npm test -- constrainedGenerator.test.ts` - Test constrained data generation

---

## Mock Modes

The server supports two modes controlled by `mockMode`:

| Mode | Description |
|---|---|
| `dev` (default) | All mock features enabled: `x-mock-status` header, artificial latency |
| `strict` | Clean REST simulation — mock features disabled, behaviour matches a real API |

In `strict` mode, the `statusOverride` and `latency` middlewares are not mounted at all.

```bash
# CLI
npx ts-mock-proxy --types-dir ./types --mock-mode strict

# Environment variable
MOCK_API_MODE=strict npx ts-mock-proxy --types-dir ./types
```

### Mock features (dev mode only, non-prod)

These features are active only in `dev` mode and should not be used to simulate real API behaviour:

**`x-mock-status`** — forces any response to return the specified HTTP status code:

```bash
# Force a 503 response
curl -H "x-mock-status: 503" http://localhost:8080/users
```

**Artificial latency** — simulates network delay (configured via `--latency` or the wizard):

```bash
npx ts-mock-proxy --types-dir ./types --latency 200-800
```

---

## How It Works

The server enforces idiomatic REST URL patterns. URLs are parsed into segments (stripping `api` and `v{n}` prefixes) and each segment is classified as either a **collection name** or an **ID** (numeric, UUID, or MongoDB ObjectId).

Supported shapes:

| URL shape | Resolves to |
|---|---|
| `/resources` | Array of the matching interface (plural names only) |
| `/resources/{id}` | Single instance of the matching interface |
| `/resources/{id}/sub-resources` | Array of the sub-resource interface |
| Anything else | 404 |

Only interfaces marked with `// @endpoint` are exposed. The server uses Intermock to parse TypeScript AST and Faker to generate realistic test data.

**Constraint Processing**: When a request is made, the system:
1. Extracts JSDoc annotations from each field in the interface
2. Generates initial mock data using Intermock/Faker
3. Applies constraints (length, range, enum, pattern) to ensure valid test data
4. Caches schemas in memory for performance

---

## 📄 License

MIT
