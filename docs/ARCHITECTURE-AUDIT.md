# Architectural Audit — Controlador Central de Portones

**Date:** 2026-02  
**Scope:** Full codebase after FSM dispatcher refactor and Telegram/PostgreSQL integration  
**Constraint:** Analysis only; no code changes or refactors.

---

## Executive summary

The architecture is **coherent, minimal, and well aligned** with the stated goals. Responsibilities are clearly split: entrypoint orchestrates; core holds FSM and the single side-effect bridge (actionDispatcher); MQTT and HTTP are adapters; the Telegram feature follows a clean repository → service → controller flow. There are no circular dependencies, no unnecessary abstractions, and no framework lock-in.

**Verdict:** The current shape is **good enough to keep**. The main gaps are: (1) configuration is split (MQTT in config, DB in pool only) and DB is not validated at startup; (2) no explicit place yet for “who can trigger which gate” when you add authorization; (3) events.controller leaks error messages to the client on 500. None of these require structural change now; they are small, localized improvements when you touch those areas.

---

## What is well done

**1. Entrypoint as orchestrator**  
`index.js` only: loads env, validates MQTT config, creates the FSM registry and `getStateMachine`, composes `onStateChange` with the dispatcher, builds the MQTT client and Express app, mounts routers, and handles SIGINT. It does not contain business logic or data access. The only “state” it holds is the registry and the composed callbacks—appropriate for composition root.

**2. Dependency direction**  
- **Core:** `stateMachine` has no app dependencies; `actionDispatcher` depends only on `stateMachine` (for `STATES`).  
- **MQTT:** Depends on `core` (EVENTS for validation). Receives `getStateMachine` and `onStateChange` by injection; does not know about Express or DB.  
- **HTTP:** Events router receives `getStateMachine` and `onStateChange`; Telegram router uses only the Telegram service.  
- **Telegram vertical:** Controller → Service → Repository → Pool. One-way; no back-references.  
No circular dependencies; dependencies point toward infrastructure (DB, MQTT) or core, not the other way around.

**3. Layer discipline**  
- **Repository:** Single parameterized query, returns raw rows or empty array. No business rules, no throwing for “not found.”  
- **Service:** Calls repository, maps rows to domain-shaped objects (tenantId, tenantName, gates). No HTTP, no SQL, no Express.  
- **Controller:** Validates input, calls service, sets status and JSON. No DB, no business rules.  
FSM and MQTT side effects are isolated: FSM returns a result; the only place that turns state changes into hardware commands is `actionDispatcher`, which is invoked from a single callback used by both MQTT and HTTP.

**4. Dispatcher pattern**  
`actionDispatcher` has one job: given `(portonId, fsmResult, mqttClient)`, if the state changed and the new state has a hardware command, call `publishCommand`. It is stateless, synchronous, and lives next to the FSM. It removed duplicated logic from two call sites and keeps the “state → command” mapping in one place. Adding a new state that implies a command is a one-line change. The pattern is justified and not over-engineered.

**5. FSM and MQTT boundaries**  
The FSM does not import MQTT or HTTP. The MQTT client does not know the state→command mapping; it only calls `onStateChange`. The events controller does not know MQTT. Side effects are triggered only via the callback passed from the entrypoint. This keeps the core testable and the transport layers swappable in concept.

**6. Telegram API contract**  
GET `/api/telegram/tenants?telegram_id=...` always returns 200 with `{ tenants: [...] }`. Empty result is an empty array, not a distinct error. Validation is only “telegram_id required”; unexpected errors become 500 with a generic message. Simple and consistent.

---

## Risks / smells

**1. Configuration split and DB not validated at startup**  
- **Where:** `config/env.js` exposes only MQTT. `src/db/pool.js` reads `DB_*` from `process.env` at module load.  
- **Why it’s a risk:** If DB env vars are missing or wrong, the app still starts. The first Telegram request that hits the repository will fail (pool connects with undefined host, etc.), and the client gets 500. Operators may think the service is healthy until the first user request. MQTT, in contrast, is validated before `connect()`, and the process exits if config is invalid.  
- **Severity:** Low if the Telegram API is used from day one; medium if DB is added “for later” and most traffic is MQTT/events.

**2. events.controller exposes internal errors on 500**  
- **Where:** `events.controller.js` catch block: `res.status(500).json({ error: err.message || "..." })`.  
- **Why it’s a smell:** Any exception from `getStateMachine(portonId)` or `stateMachine.handleEvent(event)` (e.g. a future validation throw) is sent to the client. That can leak implementation details.  
- **Severity:** Low today (FSM doesn’t throw in normal use); becomes relevant when you add validation or more complex logic in that path.

**3. No designated place for authorization**  
- **Where:** `/api/events` accepts any `portonId`; there is no notion of “current user” or “allowed gates.” The Telegram flow returns tenants/gates but does not yet link “this user” to “this user may trigger this gate/porton.”  
- **Why it matters:** When you add “open gate from Telegram,” you will need: (1) identity (e.g. telegram_id), (2) gate or portonId, (3) a check that this user is allowed to command that gate. That logic (e.g. “user → tenants → gates → portonId”) does not naturally sit only in the controller (no FSM/repo there) or only in the service (no HTTP). You’ll need a clear place (e.g. a small authz step in a service or a dedicated helper) and possibly a shared way to pass identity into the events path.  
- **Severity:** Not a bug today; a design gap for the next feature.

**4. Slight inconsistency in router export style**  
- **Where:** `events.controller.js` exports a factory `createEventsRouter(...)`; `telegram.controller.js` exports a pre-built router.  
- **Why it’s minor:** Both are valid. The factory exists because the events router needs injected `getStateMachine` and `onStateChange`. The Telegram router needs no injection, so a plain router is fine. No change needed; only worth noting so future routers follow the same rule: factory when you need injection, plain router when you don’t.

---

## Recommended improvements (only if justified)

**1. Validate DB config when the pool is first used (lazy)**  
If you want the app to fail fast when DB is misconfigured without making DB required for startup: in `user.repository.js` (or a thin wrapper around the pool), on first query, check that `process.env.DB_HOST` (and optionally `DB_USER`, `DB_NAME`) are set; if not, throw a clear error so the first Telegram request fails with a meaningful message. Alternatively, validate in index after requiring the telegram router (so the app only starts if either DB is configured or the Telegram route is not mounted). Only do this if you care about failing fast for DB; otherwise the current “fail on first request” is acceptable.

**2. Unify configuration in one place**  
When you next touch env handling: read all `DB_*` (and any other vars) in `config/env.js` and export a `db` object, and have `db/pool.js` receive that config (e.g. `require("../config/env").db`) instead of reading `process.env` directly. That gives a single place to document and validate env vars. Not urgent; only when you want one source of truth for config.

**3. Use a generic 500 message in events.controller**  
When you next touch error handling there: in the catch block, respond with a fixed message (e.g. `"Internal server error"`) instead of `err.message`, and log `err` server-side. That aligns with the Telegram controller and avoids leaking internal errors. No need to do it before you add more logic that might throw.

---

## Explicit “do not change” notes

- **FSM (`stateMachine.js`):** Keep it free of I/O, HTTP, and MQTT. It should only transition state and return `{ previousState, currentState, changed }`. No new dependencies.
- **MQTT client:** Keep the current contract: receives config, `getStateMachine`, and `onStateChange`; does not know the state→command map. Do not move STATE_TO_COMMAND into MQTT.
- **actionDispatcher:** Keep it in `core/`, stateless and synchronous. Do not add logging, retries, or async logic unless there is a concrete requirement.
- **Repository:** Keep it to a single responsibility (one query, parameterized, return rows). Do not add business rules or “user not found” throws to satisfy HTTP status codes; the current “empty array” contract is clear and keeps the repo dumb.
- **Service:** Keep it free of Express and SQL. It may call one or more repositories and shape data; it should not set HTTP status or know about `req`/`res`.
- **index.js:** Do not add business logic or new responsibilities. If you add more routers or startup checks, keep them as wiring only.
- **No frameworks or ORMs:** Do not introduce Nest, TypeORM, or similar to “improve” structure. The current layering is sufficient.
- **No DI container or event bus:** The current manual wiring (inject callbacks and clients where needed) is clear and enough for this size.

---

## Summary table

| Area                    | Status   | Note                                              |
|-------------------------|----------|---------------------------------------------------|
| High-level architecture| ✅ Solid | Two verticals (events/FSM/MQTT vs Telegram/DB).   |
| index.js role           | ✅ Good  | Orchestrator only.                                |
| Module boundaries       | ✅ Good  | No circular deps; dependencies flow correctly.     |
| Repositories            | ✅ Good  | Data only.                                        |
| Services                | ✅ Good  | Domain transform only.                            |
| Controllers             | ✅ Good  | HTTP only.                                        |
| FSM / MQTT side effects | ✅ Good  | Isolated in dispatcher + callback.                  |
| Dispatcher pattern      | ✅ Good  | Justified, minimal, correctly scoped.              |
| Error handling          | ⚠️ Minor | events 500 leaks err.message; otherwise clear.    |
| Configuration           | ⚠️ Minor | DB not in config; DB not validated at startup.    |
| Growth / authz          | ⚠️ Later | No place yet for “who can trigger which gate.”    |

Overall: the codebase is in good shape for its goals. Address the minor items when you touch those areas; avoid large refactors or new abstractions until there is a concrete pain.
