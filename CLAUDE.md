# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with nodemon + tsx (interactive wizard)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled server (dist/index.js)
npm test             # Run all tests with Jest
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
npm run clean        # Remove dist/
```

Run a single test file:
```bash
npm test -- constraintExtractor.test.ts
npm test -- --testPathPattern=pluralize
```

TypeScript is strict (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, etc.). Tests live in `tests/` and are excluded from `tsconfig.json`.

## Architecture

**Entry point**: `src/index.ts` — parses CLI args via Commander; if no args, runs the interactive `src/cli/wizard.ts`. Both paths call `startServer(config)`.

**Request lifecycle** (`src/server.ts` → `src/core/router.ts`):
1. Express middleware chain: CORS → JSON → logger → `statusOverride` → optional latency
2. All non-system routes hit `dynamicRouteHandler` (catch-all `app.all('*')`)
3. Router calls `findTypeForUrl(url, typesDir)` to resolve a TypeScript interface name from the URL
4. Calls `generateMockFromInterface` or `generateMockArray` from `src/core/parser.ts`
5. Results cached in `schemaCache` (single objects only, not arrays)

**URL → Interface resolution** (`src/utils/typeMapping.ts` + `src/utils/pluralize.ts`):
- Scans `typesDir` recursively for `.ts` files
- Only interfaces with `// @endpoint` (or in a JSDoc block containing `@endpoint`) are exposed
- `parseUrlSegments` strips leading `api` and `v{n}` prefix segments, then `isIdSegment` classifies each remaining segment as `col` (collection name) or `id` (numeric / UUID / MongoDB ObjectId)
- Supported URL shapes (anything else → 404):
  - `col` → plural collection → `isArray: true` (singular names like `/user` are rejected)
  - `col-id` → `/{resources}/{id}` → single item, `isArray: false`
  - `col-id-col` → `/{resources}/{id}/{sub-resources}` → `isArray: true` on the sub-resource type

**Mock generation** (`src/core/parser.ts`):
- Uses `intermock` with `isFixedMode: false` for random data
- After generation, `extractConstraints` parses the TypeScript AST (via `typescript` compiler API) for JSDoc annotations (`@min`, `@max`, `@minLength`, `@maxLength`, `@pattern`, `@enum`)
- `applyConstraintsToMock` in `src/core/constrainedGenerator.ts` then regenerates non-conforming fields using Faker

**Special headers**:
- `x-mock-status: <code>` — forces the response HTTP status code (handled by `src/middlewares/statusOverride.ts`)

**System routes** (not matched by dynamic handler):
- `GET /health` — server status + cache stats
- `GET /api-docs` — Swagger UI (spec auto-regenerated on hot-reload file changes)

**Key types** (`src/types/config.ts`): `ServerConfig`, `RouteTypeMapping`, `InterfaceMetadata`, `ParsedSchema`, `MockGenerationOptions`
