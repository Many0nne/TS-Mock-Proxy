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

## Field Constraints with JSDoc Annotations

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
- `npm test -- constraintExtractor.test.ts` - Test constraint JSDoc extraction
- `npm test -- constraintValidator.test.ts` - Test constraint validation
- `npm test -- constrainedGenerator.test.ts` - Test constrained data generation

---

## How It Works

The server maps URL paths to TypeScript interfaces by converting the route to PascalCase and singularizing it. For example:

- `/user` → looks for `User` interface → returns single object
- `/users` → looks for `User` interface → returns array of 3-10 objects

Only interfaces marked with `// @endpoint` are exposed. The server uses Intermock to parse TypeScript AST and Faker to generate realistic test data. 

**Constraint Processing**: When a request is made, the system:
1. Extracts JSDoc annotations from each field in the interface
2. Generates initial mock data using Intermock/Faker
3. Applies constraints (length, range, enum, pattern) to ensure valid test data
4. Caches schemas in memory for performance

---

## 📄 License

MIT
