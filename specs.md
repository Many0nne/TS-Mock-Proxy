# Spec: Full REST Methods Support (POST / PUT / PATCH / DELETE)

## Context

TS-Mock-API currently only handles GET requests and returns mock data based on TypeScript interfaces. The goal is to extend the server to simulate a complete REST API, usable as a drop-in backend mock for frontend or integration development. The mock server should behave as closely as possible to a real REST API so that frontend developers can build and test against it without modifying their API client code.

---

## Guiding Principles

> "La logique de mock vient vraiment de la génération des données, mais le reste doit être conçu pour être utilisé dans une application réelle."

This feature is **not** about adding more mock generation logic. It's about making the server behave like a real REST API so that a frontend application can be built and tested against it without modification. Specifically:

- **Observability of changes**: a developer must be able to verify that data was actually modified. POST then GET must reflect the change. PATCH then GET must show the patched fields.
- **Standard HTTP semantics**: status codes, headers (Location, Allow), and method behaviors follow REST conventions, not convenience shortcuts.
- **Mock generation is the data source**: intermock + TypeScript interface constraints remain the single source of truth for generating data shapes. Write operations build on top of this — they don't bypass it.

---

## Scope

**In scope:**
- POST, PUT, PATCH, DELETE HTTP methods for all `@endpoint`-annotated interfaces
- Semi-stateful behavior (ID-aware in-memory store, survives within a session)
- Swagger/OpenAPI spec update (requestBody schemas per method)
- CLI wizard options to enable/disable write methods per method
- Integration into existing middleware chain (latency, x-mock-status, CORS, logging)
- Unit tests + integration tests

**Out of scope:**
- Persistence across server restarts (intentionally stateless at restart)
- Request body runtime type validation (permissive — extra fields ignored)
- Per-interface method restrictions via JSDoc annotation
- Latency configuration per method (uniform latency for all methods)

---

## Breaking Changes

This is a **breaking change** for any consumer currently sending POST/PUT/PATCH/DELETE requests. Previously these fell through and returned a GET-like response. After this change:
- POST → 201 Created
- PUT/PATCH → 200 OK
- DELETE → 204 No Content (or forced via x-mock-status)
- Disabled methods → 405 Method Not Allowed

Document in CHANGELOG.

---

## Architecture: Semi-Stateful Write Store

### Principle
The server becomes semi-stateful: write operations persist their effects **in memory** for the duration of the server session. The store is cleared on `/mock-reset` or hot-reload.

### mockDataStore extension (`src/core/cache.ts`)
Extend the existing `mockDataStore` class with ID-aware methods:

```
getById(typeName, id)      → Record<string, unknown> | undefined
setById(typeName, id, obj) → void
deleteById(typeName, id)   → boolean
getDeletedIds(typeName)    → Set<string>
markDeleted(typeName, id)  → void
```

The collection pool (GET /users) and the individual store (GET /users/42) are **unified**:
- POST adds to both the collection pool and the ID store
- DELETE removes from both the collection pool and marks the ID as deleted
- PUT/PATCH updates both the pool entry and the ID store entry

The pool is indexed by the item's ID field (detected as `id`, `uuid`, `_id` — first match in the mock object).

### Write store stats
`mockDataStore.getWriteStats()` returns `{ [typeName]: { count: number, deletedCount: number } }`, exposed in `GET /health`.

---

## HTTP Method Behaviors

### POST `/{resources}`

- **URL shape**: collection only (e.g., `/users`, `/api/v1/orders`)
- **POST `/col/{id}`** → 405 Method Not Allowed (semantically incorrect)
- **POST `/col/{id}/subcol`** → resolves to subcollection type (e.g., `Order`), creates an Order
- **Request body**: JSON (optional but expected). 400 if body is present but not valid JSON.
- **Response construction**: Generate a full mock from the TypeScript interface, then **override** mock fields with matching fields from the request body (body-over-mock merge). Extra fields not in the interface are silently ignored.
- **Type mismatch in body**: If a body field exists in the interface but carries the wrong type (e.g., `age: "foo"` when the interface expects `age: number`), the value is accepted as-is and stored without validation. No runtime type-checking is performed — the server is intentionally permissive. The resulting stored object may not conform to the TypeScript interface type; this is a known and accepted trade-off.
- **ID assignment**: Use the `id`/`uuid`/`_id` field from the generated mock (intermock handles type-correct generation). Body can override this field too.
- **State**: Store the result in the write store under `(typeName, id)`. Add to the collection pool.
- **Response**: 201 Created + the merged object + `Location: /{resources}/{generatedId}` header.

### PUT `/{resources}/{id}`

- **URL shape**: `col-id` only (e.g., `/users/42`)
- **Semantics**: Full replacement (upsert). Creates the resource if it doesn't exist (no prior POST required).
- **Request body**: JSON required. 400 if body is absent or not valid JSON.
- **Response construction**: Generate a full mock, override with body fields (body-over-mock).
- **State**: Store/overwrite in write store under `(typeName, id)`. Update pool entry if present.
- **Response**: 200 OK + the merged object.

### PATCH `/{resources}/{id}`

- **URL shape**: `col-id` only (e.g., `/users/42`)
- **Semantics**: Partial update. If ID exists in write store, merge patch onto stored object. If not, upsert (same as PUT).
- **Request body**: JSON required. 400 if body is absent or not valid JSON.
- **Response construction**: If stored: apply body fields on top of stored object. If not stored: generate mock + apply body (same as PUT).
- **State**: Store/overwrite in write store. Update pool entry.
- **Response**: 200 OK + the merged object.

### DELETE `/{resources}/{id}`

- **URL shape**: `col-id` only (e.g., `/users/42`)
- **State**: Mark ID as deleted in write store. Remove from collection pool.
- **Response**: 204 No Content (no body).
- **Subsequent GET `/users/42`**: 404 Not Found (ID is marked deleted).
- **Subsequent GET `/users`**: Pool no longer includes this item.

---

## GET Behavior Changes (Statefulness)

### GET `/{resources}/{id}` (single item)
- If ID is marked as **deleted** → 404 Not Found.
- If ID exists in **write store** → return stored object (result of POST/PUT/PATCH).
- If ID is **unknown** (never created) → **404 Not Found**. (Breaking change from current behavior which generated a random mock.)

### GET `/{resources}` (collection)
- Pool is **dynamic**: reflects all POSTs (added) and DELETEs (removed).
- Pagination (`?page`, `?limit`, `?sort`, `?filter`) operates on the live pool.
- New items from POST are appended to the pool; deleted items are filtered out before pagination.
- Pool is still seeded with `POOL_SIZE` generated items on first request if empty.

---

## Configuration: `ServerConfig`

Add `writeMethods` field to `ServerConfig` (`src/types/config.ts`):

```typescript
writeMethods?: {
  post?: boolean;    // default: true
  put?: boolean;     // default: true
  patch?: boolean;   // default: true
  delete?: boolean;  // default: true
};
```

When a method is disabled (set to `false`):
- Return **405 Method Not Allowed**
- Include `Allow` header listing the currently enabled methods (e.g., `Allow: GET, POST, PUT`)

---

## CLI Wizard (`src/cli/wizard.ts`)

Add a step: **"Write methods configuration"**
- Option: Enable all write methods (default)
- Option: Read-only mode (disable all write methods)
- Option: Custom — toggle each method individually (POST / PUT / PATCH / DELETE)

Store the selection in `ServerConfig.writeMethods`.

---

## Middleware Integration

### Latency (`src/middlewares/latency.ts`)
- Applied uniformly to all HTTP methods (no per-method config).
- No changes required; the global middleware already applies to all routes.

### Status override (`src/middlewares/statusOverride.ts`)
- `x-mock-status` header works for all methods.
- For write methods: if `forcedStatus >= 400`, return the forced error (same logic as GET).
- Example: `x-mock-status: 409` on POST simulates a conflict.

### CORS (`cors()`)
- Default `cors()` configuration handles OPTIONS preflight automatically.
- No explicit configuration needed for local dev use.

### Logging (`src/middlewares/logger.ts`)
- No changes required. All methods are already logged.

---

## Swagger / OpenAPI Spec (`src/core/swagger.ts`)

For each `@endpoint`-annotated interface, generate operations for all active write methods:

### POST `/{resources}`
```yaml
requestBody:
  required: true
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/User'  # all fields, required as per interface
responses:
  201:
    description: Created
    headers:
      Location:
        schema: { type: string }
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/User'
```

### PUT `/{resources}/{id}`
```yaml
requestBody:
  required: true
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/User'  # all fields required (full replacement)
responses:
  200: { ... }
```

### PATCH `/{resources}/{id}`
```yaml
requestBody:
  required: true
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/UserPartial'  # all fields optional (Partial<T>)
responses:
  200: { ... }
```

### DELETE `/{resources}/{id}`
```yaml
responses:
  204:
    description: No Content
```

**Swagger requestBody schema generation**:
- Reuse the existing TypeScript AST parser to extract interface fields and types.
- For PATCH: generate a `Partial<T>` variant where all properties are `required: false`.
- For PUT/POST: all fields required as defined in the interface.

---

## `/mock-reset` and Swagger "Rebuild Data" Button

`POST /mock-reset` clears:
- `schemaCache` (schema object cache)
- `mockDataStore` pools (GET collection pools)
- `mockDataStore` write store (ID-aware entries)
- `mockDataStore` deleted ID sets

This is the same behavior triggered by the "Rebuild Data" button in Swagger UI.

---

## Hot-Reload Interaction

When a `.ts` file changes in `typesDir`:
- The Swagger spec is regenerated (existing behavior).
- The write store entries for the **affected type** are cleared (new behavior).
- The collection pool for the affected type is cleared and will regenerate on next GET.

---

## `GET /health` Changes

Add `writeStore` stats to the response:

```json
{
  "status": "ok",
  "uptime": 123.4,
  "cache": { ... },
  "writeStore": {
    "User": { "count": 3, "deletedCount": 1 },
    "Order": { "count": 7, "deletedCount": 0 }
  },
  "config": { ... }
}
```

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| `POST /users/42` (col-id) | 405 Method Not Allowed |
| `POST /users/42/orders` (col-id-col) | 201 — creates Order (subresource type) |
| `DELETE /users/99` (unknown ID) | 204 (stateless delete — idempotent) |
| `GET /users/99` (unknown, never created) | 404 Not Found |
| `PUT /users/99` (unknown ID) | Upsert — 200 + created object |
| `PATCH /users/99` (unknown ID) | Upsert — 200 + created object |
| `DELETE /users/42` then `GET /users/42` | 404 Not Found |
| `DELETE /users/42` then `GET /users` | Pool excludes item 42 |
| Body missing for POST/PUT/PATCH | 400 Bad Request |
| Body with extra fields (not in interface) | Fields silently ignored |
| `x-mock-status: 422` on PATCH | 422 returned (forced status, no body processing) |
| Disabled method (writeMethods.delete: false) | 405 + Allow header |

---

## Testing Strategy

### Unit tests (`tests/unit/`)
- `router.test.ts`: Test each method handler in isolation with mocked `findTypeForUrl`, `generateMockFromInterface`, and `mockDataStore`.
- Cases: successful create/update/delete, 400 for missing body, 404 for deleted ID, 405 for disabled method, 405 for POST on col-id URL.

### Integration tests (`tests/integration/`)
- Full CRUD cycle: `POST /users` → `GET /users/{id}` (verify state) → `PUT /users/{id}` → `PATCH /users/{id}` → `DELETE /users/{id}` → `GET /users/{id}` (verify 404).
- Collection coherence: POST adds to `GET /users` pool, DELETE removes from pool.
- `x-mock-status` override on write methods.
- `/mock-reset` clears write store (verify state gone).
- Disabled methods return 405 with Allow header.
- Body merge: verify body fields appear in response.
- Location header present on 201.

---

## Open Questions (Deferred)

- Should `POST /users/42/orders` store the created Order with a reference to `userId: 42`? (Parent ID injection — not in scope for v1, could be addressed via body-override if the client sends it.)
- Should a future `@readonly` JSDoc annotation be supported to mark specific interfaces as GET-only? (Out of scope for v1 — use `writeMethods` config instead.)
- Should write store entries be exportable/importable (e.g., `GET /mock-state`, `POST /mock-state`) to seed tests with known state? (Potential future feature.)
