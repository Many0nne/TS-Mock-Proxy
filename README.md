# 🚀 TS-Mock-Proxy

TS-Mock-Proxy is a "Zero-Config" mock server that instantly generates a functional REST API from your TypeScript interfaces. Stop wasting time configuring complex tools or waiting for the backend: your types are your documentation and your server.

## 🎯 Project Goal

Enable Front-end developers to work in total isolation by intercepting API calls and responding with random but coherent data, based strictly on the project's interfaces.

---

## 🛠 Technical Stack

**Core**
- **Language** : TypeScript (strict mode)
- **Runtime** : Node.js 24+
- **Package Manager** : npm

**Server & API**
- **Server** : Express
- **CORS** : cors
- **API Documentation** : Swagger UI Express (auto-generated from TypeScript interfaces)

**Data Generation**
- **Type Analysis** : Intermock (uses TypeScript AST to generate data) | https://github.com/google/intermock#readme
- **Random Data** : Faker-js (via Intermock) | http://fakerjs.dev/

**CLI & Tooling**
- **CLI** : Commander.js | https://github.com/tj/commander.js#readme
- **File Watching** : chokidar (hot-reload) | https://github.com/paulmillr/chokidar
- **Logging** : chalk | https://github.com/chalk/chalk#readme

**Development**
- **Tests** : Jest + ts-jest
- **TS Execution** : tsx (faster than ts-node)
- **Dev Mode** : nodemon + tsx

---

## 🚀 Quick Start

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

#### 1️⃣ Define your TypeScript types

```typescript
// types/user.ts
// @endpoint
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

// types/product.ts
// @endpoint
export interface Product {
  id: string;
  title: string;
  price: number;
  inStock: boolean;
}
```

#### 2️⃣ Start the mock server

**Interactive Mode (Recommended)**

Simply run the command without arguments to launch the interactive configuration wizard:

```bash
npm run dev
# or
npx ts-mock-proxy
```

The wizard will guide you through:
- 📁 Types directory location (required)
- 🔌 Server port selection
- ⚡ Advanced options (hot-reload, cache, latency simulation, logging)

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

**Available Options**

```
Options:
  -t, --types-dir <path>        Directory with TypeScript types (required)
  -p, --port <number>           Server port (default: 8080)
  -l, --latency <range>         Latency simulation "min-max" (e.g., 500-2000)
  --no-hot-reload               Disable auto-reload on changes
  --no-cache                    Disable schema caching
  -v, --verbose                 Enable verbose logging
  --interactive                 Force interactive mode
  -h, --help                    Show help
```

**Commands**

```bash
npx ts-mock-proxy stats        # Display cache statistics
npx ts-mock-proxy clear-cache  # Clear cached schemas
```

#### 🎯 Endpoint Control with `// @endpoint` Flag

The mock server requires you to explicitly mark which TypeScript interfaces should create endpoints using the `// @endpoint` comment:

```typescript
// types/user.ts

// @endpoint
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

// This won't create an endpoint (supporting type)
export interface UserProfile {
  userId: number;
  bio: string;
}
```

**Usage**:
```bash
npm start
# or
npm run dev
```

**Benefits**:
- ✅ Full control over which interfaces are exposed
- ✅ Support for internal/utility types that shouldn't have endpoints
- ✅ Clean separation between public API and internal types
- ✅ Prevents accidentally exposing unintended interfaces

#### 3️⃣ Call your API

```bash
# Single object
curl http://localhost:8080/user
# → {"id": 482, "name": "John Doe", "email": "john.d@gmail.com", "role": "admin"}

# Array of objects (plural)
curl http://localhost:8080/users
# → [{"id": 1, ...}, {"id": 2, ...}, ...]

# With nested routes
curl http://localhost:8080/api/v1/product
# → {"id": "abc123", "title": "Product Name", "price": 29.99, "inStock": true}
```

#### 📚 Swagger UI - API Documentation

The mock server automatically generates an **interactive API documentation** using Swagger/OpenAPI:

```bash
# Access the Swagger UI at:
http://localhost:8080/api-docs
```

**Features**:
- 📖 Auto-generated documentation from your TypeScript interfaces
- 🎯 Interactive UI to test endpoints directly from your browser
- 🔍 View all available endpoints (single object and arrays)
- 📝 See request/response schemas with examples
- ⚡ Real-time updates when contracts change (with hot-reload enabled)

**Available endpoints**:
- `/health` - Server health check and configuration info
- `/{interfaceName}` - Get a single mocked object (e.g., `/user`, `/product`)
- `/{interfaceNames}` - Get an array of mocked objects (e.g., `/users`, `/products`)

The Swagger spec is automatically generated by scanning all exported TypeScript interfaces marked with `// @endpoint` in your types directory.

#### 4️⃣ Use types from an external project

Point to the types folder of another project (backend, shared repo, etc.):

```bash
# Point to a shared types directory
npx ts-mock-proxy --types-dir /path/to/backend-project/src/types

# Using relative path (parent directory)
npx ts-mock-proxy --types-dir ../my-backend/src/types

# Absolute path (Windows)
npx ts-mock-proxy --types-dir "C:\Users\dev\backend-api\src\types"
```

**Benefits**:
- ✅ No duplication: use your backend types directly
- ✅ Automatic synchronization: changes in the source project are detected (with `--hot-reload`)
- ✅ Single Source of Truth: backend types are the unique reference
- ✅ Compatible with mono-repos or separate projects

**Example**: React Frontend + NestJS Backend
```bash
# In your frontend project
cd my-frontend
npx ts-mock-proxy --types-dir ../my-backend/src/dto --port 3001
```

---

## ⚙️ CLI Configuration

```bash
ts-mock-proxy --types-dir <path> [options]

Required Options:
  -t, --types-dir <path>    Directory containing TypeScript type definitions

Optional Options:
  -p, --port <number>       Server port (default: 8080)
  -l, --latency <range>     Simulated latency min-max (e.g., 500-2000)
  --no-hot-reload           Disable file hot-reload
  --no-cache                Disable schema caching
  -v, --verbose             Verbose mode for logging
  --interactive             Force interactive wizard mode
  -h, --help                Display help message
  --version                 Show version
```

### NPM Scripts

```bash
npm run dev              # Start the server in development mode
npm run build            # Compile TypeScript to dist/
npm start                # Start the server in production (after build)
npm test                 # Run Jest tests
npm run test:watch       # Tests in watch mode
npm run test:coverage    # Coverage report
npm run clean            # Remove dist/ folder
```

---

## 📖 How It Works

### Naming Conventions (Route ↔ Type)

| Requested URL | Type searched | Mode |
|--------------|----------------|------|
| `/user` | `User` | Single object |
| `/users` | `User` | Array of objects |
| `/api/customer` | `Customer` | Single object |
| `/api/customers` | `Customer` | Array of objects |

**Algorithm**:
1. Extract the last segment of the URL (`/api/users` → `users`)
2. Convert to PascalCase and singularize (`users` → `User`)
3. Search for the corresponding interface in the files
4. If plural detected, return an array of 3-10 objects

### Cache & Performance

- **In-memory cache**: Map<string, ParsedSchema> to avoid re-parsing on each request
- **Invalidation**: The file watcher invalidates the cache when a .ts file changes
- **TTL**: Optional, configurable (default infinite in dev)

### Error Handling

- Type not found → **404** with clear message
- Parsing error → **500** with TypeScript error details

---

## 🏗 Project Architecture

```
ts-mock-proxy/
├── src/
│   ├── index.ts              # Entry point (CLI with Commander)
│   ├── server.ts             # Express server configuration and startup
│   ├── core/
│   │   ├── parser.ts         # Type extraction with Intermock
│   │   ├── router.ts         # Dynamic routing and URL <-> Type matching
│   │   ├── cache.ts          # In-memory cache for TypeScript schemas
│   │   └── swagger.ts        # OpenAPI spec generation from TypeScript interfaces
│   ├── middlewares/
│   │   ├── latency.ts        # Latency simulator
│   │   ├── statusOverride.ts # HTTP status override via header
│   │   └── logger.ts         # Request logging
│   ├── utils/
│   │   ├── typeMapping.ts    # Naming conventions (route -> type)
│   │   ├── fileWatcher.ts    # Hot-reload with chokidar
│   │   └── pluralize.ts      # Singular/plural handling
│   └── types/
│       └── config.ts         # Configuration types
├── contracts/                # TypeScript interface examples
│   └── user.ts
├── dist/                     # Compiled code (generated by `npm run build`)
├── tests/                    # Jest tests
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
├── jest.config.js
├── .gitignore
└── README.md
```

---

## 🗺️ Roadmap - Upcoming Features

### 🔜 Git Support - Fetch from GitHub

Ability to automatically clone a GitHub repository containing types, for even more flexibility.

**Planned usage**:
```bash
# Clone a GitHub repo and use its types
ts-mock-proxy \
  --git-repo https://github.com/company/api-contracts \
  --git-path src/types \
  --git-branch main
```

**Benefits**:
- 📦 No need to have the backend project locally
- 🔄 Automatic synchronization with remote repo
- 🌐 Ideal for teams with shared contract repos

**Use cases**:
- Team with a centralized contract repo (`company/shared-contracts`)
- Frontend wanting to use backend types without cloning manually
- CI/CD generating a mock server from a remote repo

### 🔜 Configuration File

Support for a `ts-mock-proxy.config.json` file for advanced configurations:

```json
{
  "sources": [
    { "type": "local", "path": "./contracts" },
    { "type": "external", "path": "../backend/types" },
    { "type": "git", "url": "github.com/company/contracts", "branch": "main" }
  ],
  "port": 8080,
  "latency": { "min": 500, "max": 2000 },
  "cache": true,
  "exclude": ["**/*.test.ts", "**/internal/**"]
}
```

---

## 📄 License

MIT
