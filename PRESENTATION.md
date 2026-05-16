# Programming Language Concepts — Hunt-Hub Backend

> Oral assessment presentation | TypeScript / Node.js project

---

## 0 — Project Introduction

**Hunt-Hub** is a multi-tenant hunting estate management platform.

**Stack:** Node.js · TypeScript · Express · tRPC · Drizzle ORM · PostgreSQL

**Why this project demonstrates PL concepts:**
- TypeScript is statically typed at compile time
- It compiles to JavaScript, which is dynamically typed at runtime
- Both worlds are visible in the same codebase
- OOP and functional patterns are used to solve real problems

---

## 1 — Static / Dynamic Typing

> TypeScript is statically typed. It compiles to JavaScript, which is dynamically typed. The types exist only at compile time — they are erased in the output.

### TypeScript source — types enforced at compile time

📄 [`backend/src/middlewares/requireRole.ts` lines 8–11](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/middlewares/requireRole.ts#L8-L11)

```ts
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
```

Every parameter has a declared type. If you pass the wrong type, **the build fails**.

### Compiled JavaScript output — types gone at runtime

📄 [`backend/dist/src/middlewares/requireRole.js` lines 23–27](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/dist/src/middlewares/requireRole.js#L23-L27)

```js
function requireAuth(req, res, next) {
    if (!req.session.user)
        return res.redirect('/login');
    next();
}
```

`Request`, `Response`, `NextFunction` — all gone. The runtime has no idea what types these parameters are supposed to be. That is dynamic JavaScript.

**Key point:** TypeScript types are a compile-time safety net. At runtime you are back to dynamic JavaScript.

---

## 2 — Type Inference

> Type inference means the compiler deduces types automatically — you don't write them manually.

📄 [`backend/src/schemas/index.ts` lines 3–6](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/schemas/index.ts#L3-L6)

```ts
export const loginSchema = z.object({
  email:    z.email(),
  password: z.string().min(1),
});
```

TypeScript infers the type `{ email: string, password: string }` automatically from the Zod schema definition. You never write that type manually.

The same schema also validates data at runtime — one source of truth for both compile-time types and runtime checks.

**Key point:** Change the schema → the inferred type updates everywhere automatically. Nothing can get out of sync.

---

## 3 — Classes and Objects

> A class is a blueprint. An object is a concrete instance built from that blueprint.

📄 [`backend/src/db/schema/users.ts` lines 14–27](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/db/schema/users.ts#L14-L20)

```ts
export const usersTable = pgTable("users", {
  id:        integer().primaryKey().generatedAlwaysAsIdentity(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName:  varchar('last_name',  { length: 255 }).notNull(),
  role:      roleEnum().notNull(),
  estateId:  integer('estate_id').references(() => estatesTable.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

`usersTable` is an **object** — a concrete value with named properties. Each column (`integer()`, `varchar()`, `timestamp()`) is itself an object created by a Drizzle class constructor.

`pgTable()` is a factory that constructs and returns the object. The blueprint (Drizzle's `PgTable` class) is never exposed directly — we only use the object it produced.

**Key point:** TypeScript uses class-based syntax but compiles to JavaScript's prototype chains. Classes are syntactic sugar over prototype-based inheritance at the runtime level.

---

## 4 — Inheritance

> Inheritance lets one type reuse and extend the definition of another — the child gets everything the parent has, and can add more.

### Interface inheritance — extending a type you don't own

📄 [`backend/src/types/express.d.ts` lines 15–24](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/types/express.d.ts#L15-L24)

```ts
declare module 'express-session' {
  interface SessionData {
    user?:                SessionUser;
    csrfToken?:           string;
    pendingAdminId?:      number;
    pendingAdminExpires?: number;
    pendingTotpSecret?:   string;
    pendingBackupCodes?:  string[];
  }
}
```

`SessionData` already exists inside the `express-session` library. By redeclaring it here, TypeScript **merges** both declarations. The result inherits all original library fields plus the custom ones added here — without touching the library source code.

This is **declaration merging**: a TypeScript form of interface inheritance.

### Class inheritance — for contrast

📄 [`backend/src/utils/geofile-parsers.ts` lines 39–53](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/utils/geofile-parsers.ts#L39-L53)

```ts
export abstract class GeoFileParser {
  abstract parse(buf: Buffer): Promise<string>;
}

export class GeoJsonParser extends GeoFileParser {
  override async parse(buf: Buffer): Promise<string> { ... }
}

export class KmlParser extends GeoFileParser {
  override async parse(buf: Buffer): Promise<string> { ... }
}
```

Interface inheritance shares a **contract only**. Class inheritance shares both a **contract and implementation**.

**Key point:** TypeScript supports single class inheritance (one `extends`) to avoid the diamond problem, but you can implement multiple interfaces. Declaration merging allows extending interfaces from libraries you don't own.

---

## 5 — Polymorphism, Dynamic Dispatch & Late Binding

> One interface, many implementations. The runtime decides which one runs.

📄 [`backend/src/utils/geofile-parsers.ts` lines 136–143](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/utils/geofile-parsers.ts#L136-L143)

```ts
export function createParser(filename: string): GeoFileParser {
  if (filename.endsWith('.geojson')) return new GeoJsonParser();
  if (filename.endsWith('.kml'))     return new KmlParser();
  if (filename.endsWith('.gpx'))     return new GpxParser();
  if (filename.endsWith('.zip'))     return new ShapefileParser();
  if (filename.endsWith('.gpkg'))    return new GeoPackageParser();
  throw new ParseError(400, 'Unsupported file type.');
}
```

The caller receives a `GeoFileParser` — the abstract type. It never imports the concrete subclass.

```ts
const parser = createParser(filename);
await parser.parse(buf); // which parse() runs? decided at runtime
```

- **Polymorphism:** one interface (`GeoFileParser`), five implementations
- **Dynamic dispatch:** the runtime walks the prototype chain of the actual object and calls the right `parse()`
- **Late binding:** the link between the call site and the method code is resolved at runtime, not compile time

**Key point:** Adding a new file format requires one new class and one new line in the factory. No callers change. That extensibility is only possible because of polymorphism.

---

## 6 — Pure Functions & Referential Transparency

> A pure function always produces the same output for the same input and has no side effects.

📄 [`backend/src/utils/geofile-parsers.ts` lines 15–37](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/utils/geofile-parsers.ts#L15-L37)

```ts
export function toGeometryCollection(geojson: string): string {
  const parsed = JSON.parse(geojson);
  if (parsed.type === 'FeatureCollection') {
    return JSON.stringify({
      type: 'GeometryCollection',
      geometries: parsed.features.map((f: any) => f.geometry).filter(Boolean),
    });
  }
  // ...
}
```

- Same input string → always same output string
- No database calls, no file writes, no global state read or modified
- **Referentially transparent:** `toGeometryCollection(x)` can be replaced with its return value and the program behaves identically

### Contrast — impure function

📄 [`backend/src/services/audit.ts` lines 49–60](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/services/audit.ts#L49-L60)

```ts
export async function audit({ userId, event, ip, metadata }: AuditOptions) {
  await db.insert(auditLogsTable).values({ userId, event, ip, metadata });
}
```

`audit()` writes to the database on every call — the same inputs change the world state each time. It is **not** pure.

**Key point:** Pure functions have no hidden dependencies and are trivial to test — pass an input, check the output, no mocking required.

---

## 7 — Anonymous Functions & Lambda Expressions

> A lambda is a function with no name, defined inline and passed as a value. Functions are first-class values in JavaScript/TypeScript.

📄 [`backend/src/controllers/manager/estate.ts` lines 32–37](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/controllers/manager/estate.ts#L32-L37)

```ts
const people = allPeople.sort((a, b) => {
  const roleOrder: Record<string, number> = { manager: 0, staff: 1, admin: 2, guest: 3 };
  const roleDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
  if (roleDiff !== 0) return roleDiff;
  return a.lastName.localeCompare(b.lastName);
});
```

`(a, b) => { ... }` is an anonymous function — no name, defined inline, passed directly to `.sort()` as an argument.

It contains real business logic: sort managers before staff, then alphabetically by last name within a role.

**Key point:** Functions are first-class values in JavaScript — they can be passed as arguments just like numbers or strings. Anonymous does not mean simple — a lambda can be as complex as any named function.

---

## 8 — Higher-Order Functions (map, filter, reduce)

> A higher-order function takes one or more functions as arguments, or returns a function.

📄 [`backend/src/controllers/manager/events.ts` lines 18–26](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/controllers/manager/events.ts#L18-L26)

```ts
const upcomingEvents = allEvents
  .filter(e => new Date(e.date) >= now)
  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const pastEvents = allEvents
  .filter(e => new Date(e.date) < now)
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
```

- **`filter`** takes a predicate function and returns only elements where it returns `true`
- **`sort`** takes a comparator function and reorders elements by it
- Both are chained — the output of `filter` feeds into `sort`
- The original `allEvents` array is never modified

**`reduce`** — not used here directly, but the most general HOF: it folds a list into a single accumulated value. Both `map` and `filter` can be expressed as a `reduce`.

Example from the domain:
```ts
invitations.reduce((count, inv) => inv.response === 'yes' ? count + 1 : count, 0)
```

**Key point:** Higher-order functions abstract over behaviour, not just data. They let you build pipelines that transform data without loops or mutation.

---

## 9 — Where PL Concepts Made a Critical Architectural Difference

> Level 2: identifying points where the choice of concept had a measurable consequence on the architecture or technology.

---

### Point 1 — Polymorphism → zero-touch extensibility

📄 [`backend/src/utils/geofile-parsers.ts` lines 136–143](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/utils/geofile-parsers.ts#L136-L143)

```ts
export function createParser(filename: string): GeoFileParser {
  if (filename.endsWith('.geojson')) return new GeoJsonParser();
  if (filename.endsWith('.kml'))     return new KmlParser();
  if (filename.endsWith('.gpx'))     return new GpxParser();
  if (filename.endsWith('.zip'))     return new ShapefileParser();
  if (filename.endsWith('.gpkg'))    return new GeoPackageParser();
  throw new ParseError(400, 'Unsupported file type.');
}
```

**Without polymorphism:** every file upload handler would contain its own `if/else` chain for each format — duplicated across the codebase.

**With polymorphism:** every caller does one thing: `parser.parse(buf)`. Adding a new format means one new class and one new line in the factory. No existing code changes.

The architectural consequence: the system is **open for extension, closed for modification** — directly enabled by the abstract class + polymorphism choice.

---

### Point 2 — Type inference → validation and types can never drift

📄 [`backend/src/schemas/index.ts` lines 3–6](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/schemas/index.ts#L3-L6)

```ts
export const loginSchema = z.object({
  email:    z.email(),
  password: z.string().min(1),
});
```

**Without type inference:** you maintain two separate things — a runtime validation function and a compile-time type declaration. As the codebase evolves they inevitably drift apart: the validator accepts a field the type doesn't know about, or vice versa.

**With type inference:** `loginSchema` is simultaneously the runtime validator and the compile-time type. There is one object to change. Drift is structurally impossible.

The architectural consequence: an entire class of bugs — where validated data doesn't match the declared type — is eliminated by the language feature itself.

---

### Point 3 — Pure functions → safe worker thread isolation

📄 [`backend/src/utils/geofile-parsers.ts` lines 15–37](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/utils/geofile-parsers.ts#L15-L37) and [`backend/src/workers/geofile.worker.ts`](https://github.com/carl-castell/hunt-hub_backend/blob/main/backend/src/workers/geofile.worker.ts)

```ts
// geofile.worker.ts — runs in a separate thread with its own heap
const parser = createParser(filename);
const geometryCollection = await parser.parse(buf);
parentPort!.postMessage({ ok: true, geometryCollection });
```

Geo-file parsing is CPU-heavy. It runs in a **worker thread** — a separate thread with its own memory heap — so it cannot block the main server thread.

**This is only safe because the parsers are pure.** They read the input buffer and return a string. No shared globals, no external state, no mutations. If the parsers had side effects, concurrent execution across threads would risk race conditions or corrupted shared state.

The architectural consequence: the performance decision (worker thread) was only viable because of the functional concept (pure functions). The two choices depend on each other.

---

*Presentation prepared for oral assessment — Concepts of Programming Languages*
