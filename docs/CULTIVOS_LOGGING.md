# Logging profesional – Módulo Cultivos

## Estructura de archivos

```
src/
├── shared/
│   ├── logger/
│   │   ├── LoggerService.js    # log() → logs_sistema + consola en dev
│   │   ├── requestContext.js   # AsyncLocalStorage (requestId, userId, cultivoId, macetaId)
│   │   └── index.js
│   └── errors/
│       ├── AppError.js          # Error con statusCode, modulo, evento
│       └── index.js
├── middleware/
│   ├── requestLoggerContext.js # request_id, user, inyectar cultivo/maceta, AsyncLocalStorage
│   └── errorHandler.js         # Captura AppError y otros; loguea y responde
├── modules/
│   └── cultivos/
│       └── cultivos.log-demo.controller.js  # Rutas mock de ejemplo
└── index.js                    # app.use(requestLoggerContext); app.use(errorHandler);
```

## Uso desde un controller

```javascript
const { logger } = require("../../shared/logger");
const { AppError } = require("../../shared/errors");

// Log simple (request_id y userId se inyectan desde el contexto del request)
logger.log({
  nivel: "info",
  modulo: "cultivos",
  evento: "maceta_consultada",
  mensaje: "Consulta de maceta",
  macetaId: req.params.macetaId,
  contexto: { extra: "dato" },
});

// Lanzar error de aplicación (el errorHandler lo loguea y responde)
if (!maceta) {
  throw new AppError("Maceta no encontrada", {
    statusCode: 404,
    modulo: "cultivos",
    evento: "maceta_no_encontrada",
  });
}

// En rutas async, pasar el error al middleware con next(err)
try {
  await algo();
} catch (err) {
  next(err);
}
```

## Rutas de demo (mock)

- **GET /api/cultivos/log-demo** (auth) – Log info y devuelve `requestId` y `logContext`.
- **GET /api/cultivos/log-demo/error** (auth) – Lanza `AppError` 400; se loguea y responde con `requestId`.
- **POST /api/cultivos/log-demo/with-context** (auth) – Body `{ cultivoId, macetaId, cicloId }`; log con ese contexto.

## Flujo

1. `requestLoggerContext` corre en cada request: genera `request_id`, extrae `userId` de `req.user`, toma `cultivoId`/`macetaId` de params o body y guarda todo en `req.logContext` y en AsyncLocalStorage.
2. Cualquier `logger.log()` dentro del request recibe automáticamente `request_id` (y opcionalmente `userId`, `cultivoId`, `macetaId`) en el contexto que se persiste en `logs_sistema.contexto`.
3. Si se lanza `AppError`, `errorHandler` lo captura, llama a `logger.log` con nivel `error` y responde con `statusCode` y cuerpo `{ error, modulo, evento, requestId }`.
