# 🔗 Using External Type Directories

TS-Mock-Proxy can scan TypeScript interfaces from **external projects** or **remote repositories**, eliminating the need to duplicate your types in the `contracts/` folder.

## 📁 Use Cases

### 1. **Frontend + Backend in separate projects**
```bash
my-workspace/
├── frontend/          # Your React/Vue/Angular app
└── backend/           # Your API (NestJS, Express, etc.)
    └── src/
        └── types/     # TypeScript interfaces
```

**Solution:**
```bash
cd frontend
npx ts-mock-proxy --external-dir ../backend/src/types
```

---

### 2. **Mono-repo with shared types**
```bash
my-monorepo/
├── packages/
│   ├── web-app/
│   ├── mobile-app/
│   └── api/
│       └── src/dto/   # Data Transfer Objects
└── shared/
    └── types/         # Shared contracts
```

**Solution:**
```bash
cd packages/web-app
npx ts-mock-proxy --external-dir ../../shared/types --external-dir ../api/src/dto
```

---

### 3. **External project (absolute path)**
```bash
# Windows
ts-mock-proxy --external-dir "C:\Users\dev\backend-api\src\contracts"

# Linux/Mac
ts-mock-proxy --external-dir /home/dev/backend-api/src/contracts
```

---

### 4. **Multiple sources with priority**
The scanner respects **priority order**:
1. `./contracts` (local) - **highest priority**
2. First `--external-dir`
3. Second `--external-dir`
4. ...

If the same interface name exists in multiple locations, the **first one found wins**.

```bash
# Local contracts override external types
ts-mock-proxy \
  --dir ./contracts \
  --external-dir ../backend/types \
  --external-dir ../legacy-api/types
```

---

## 🔥 Hot-Reload

The file watcher monitors **all directories** (local + external):

```bash
ts-mock-proxy --external-dir ../backend/src/types --hot-reload
```

When you modify a file in `../backend/src/types`, the mock server **automatically reloads** 🚀

---

## 🧪 Example

### Setup

1. Create an external types directory:
```bash
mkdir -p /tmp/external-types
```

2. Add some TypeScript interfaces:
```typescript
// /tmp/external-types/blog.ts
export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: number;
  publishedAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  text: string;
  userId: number;
}
```

3. Start the mock server:
```bash
npx tsx src/index.ts --external-dir /tmp/external-types
```

4. Call the API:
```bash
curl http://localhost:8080/post
# → {"id": "uuid", "title": "...", "content": "...", ...}

curl http://localhost:8080/comments
# → [{"id": "uuid", "postId": "...", ...}, ...]
```

---

## 📊 Verify Configuration

Check the `/health` endpoint to see loaded directories:

```bash
curl http://localhost:8080/health | jq '.config'
```

**Output:**
```json
{
  "contractsDir": "C:\\Users\\dev\\ts-mock-proxy\\contracts",
  "externalDirs": [
    "/tmp/external-types"
  ],
  "port": 8080,
  "hotReload": true,
  "cache": true
}
```

---

## 🚀 Future: Git Repository Support (Phase 2)

**Coming soon:**
```bash
# Clone a GitHub repo and use its types
ts-mock-proxy \
  --git-repo https://github.com/company/api-contracts \
  --git-path src/types \
  --git-branch main
```

Stay tuned! 🎯
