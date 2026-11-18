# URL shortener

A TypeScript, Node.js, and PostgreSQL starter built as a modular monolith: one application process and database, with business features kept inside their own modules. The first module owns URL creation and redirects. It implements the contract in [api.txt](api.txt).

## Run locally

Requires Node.js 24+ and PostgreSQL 17+ (or Docker Compose for the supplied development database).

```powershell
npm ci
Copy-Item .env.example .env
docker compose up -d --wait
npm run db:migrate
npm run dev
```

With an existing PostgreSQL installation, create a database and configure `DATABASE_URL` in `.env` instead of running Compose. The app listens on `http://localhost:3000`. Set `BASE_URL` to the public origin used in generated short URLs. `HOST` defaults to loopback; use `0.0.0.0` when running the app inside a container.

Migrations run explicitly before starting the app. Startup fails if the URL table is unavailable. Development database credentials in Compose are for local use.

```powershell
$body = @{
  url = 'https://example.com/very/long/url'
  customAlias = 'my-link'
  expiresAt = '2027-12-31T23:59:59Z'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/urls -ContentType application/json -Body $body
curl.exe -i http://localhost:3000/my-link
```

`customAlias` and `expiresAt` are optional. Opening the returned `shortUrl` in a browser redirects to the destination.

## Structure and boundaries

```text
src/
  main.ts                         # Composition, startup, graceful shutdown
  app.ts                          # HTTP server and shared error handling
  config.ts                       # Validated environment configuration
  modules/
    urls/
      index.ts                    # Public module API and factory
      domain/                     # Types and repository interface
      application/                # URL creation and resolution rules
      infrastructure/             # PostgreSQL repository
      http/                       # Routes and JSON Schema validation
  platform/database/              # Shared pool and migration runner
  scripts/migrate.ts              # Migration command
  shared/                         # Small cross-module building blocks
migrations/                       # Ordered SQL migrations, owned by modules
tests/                            # Application and HTTP tests
  integration/                    # Real PostgreSQL verification
```

```mermaid
flowchart LR
  Client --> HTTP[URLs HTTP routes]
  HTTP --> Service[URL service]
  Service --> Contract[Repository interface]
  PostgreSQL[PostgreSQL adapter] -. implements .-> Contract
  PostgreSQL --> DB[(urls schema)]
```

The application layer depends on its repository interface, with the PostgreSQL implementation supplied at startup. It does not import Fastify or `pg`. HTTP routes validate transport input and delegate business decisions to the service. The shared database layer does not contain URL business rules.

When adding another feature, create `src/modules/<feature>/index.ts` and keep its internal files private by convention. Import another module through its `index.ts`; communicate through its public methods instead of accessing its tables. Module boundaries are a code convention in this starter, not an automated dependency rule. The URLs module owns the `urls` database schema. Add new SQL migrations instead of editing applied migrations.

## API behavior

| Endpoint | Result |
| --- | --- |
| `POST /api/urls` | `201` with `shortUrl`, `code`, `url`, and `expiresAt` |
| `GET /api/urls/:code` | `302`, `Location` header, empty body |
| `GET /:code` | Same redirect for public short URLs |
| `GET /health/live` | `200` while the process is running |
| `GET /health/ready` | `200` if the URL table can be queried, otherwise `503` |

Aliases are case-sensitive, 3–64 characters, and accept letters, digits, underscores, and hyphens. PostgreSQL enforces uniqueness, including simultaneous requests. Duplicate custom aliases return `409`; generated code collisions retry up to five times before returning `503`.

Destination URLs must use HTTP(S), contain no credentials or unescaped whitespace, and fit within 8,192 characters after normalization. Unknown fields and incorrect JSON types are rejected. Expiration timestamps require a timezone and must be in the future. Missing expiration produces `expiresAt: null`. Responses normalize timestamps to UTC and destination URLs through the standard URL parser.

Expired links return `410`; unknown codes return `404`. Expired aliases stay reserved. Redirect responses use `Cache-Control: no-store` so cached redirects do not outlive expiration. Errors use `{ "error": { "code": "...", "message": "..." } }`; unexpected failures are logged without exposing internal details to clients.

## Verify and build

```powershell
npm run check
```

This runs strict TypeScript checks, business and HTTP tests, and the production build. The default tests use an in-memory repository and require no running database.

To verify PostgreSQL migrations, parameterized persistence, concurrent alias claims, redirects, and expiration, create a **separate test database** and run:

```powershell
docker compose exec postgres createdb -U shortener shortener_test
$env:TEST_DATABASE_URL = 'postgresql://shortener:shortener@localhost:5432/shortener_test'
npm run test:integration
```

Integration tests apply migrations and remove only the rows they create. They skip explicitly if `TEST_DATABASE_URL` is unset; they never fall back to the application's database URL.

```powershell
npm run build
npm run db:migrate:prod
npm start
```

Keep the root `migrations/` directory alongside `dist/` when packaging the application. The migration runner takes a transaction-scoped advisory lock, applies changes in a transaction, and checks hashes to detect edits to applied migrations. Production runtime installation needs only `npm ci --omit=dev`; compiled startup and migrations do not require TypeScript tooling.

## Scope

This is a backend foundation. Authentication, rate limiting, destination abuse screening, analytics, and administrative link management are future modules or capabilities. HTTP(S) destinations are validated syntactically and are not fetched by the server.

Implementation references: [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) and [node-postgres parameterized queries](https://node-postgres.com/features/queries).
