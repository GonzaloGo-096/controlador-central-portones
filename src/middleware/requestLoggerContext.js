/**
 * Middleware de request para logging:
 * - Genera request_id único
 * - Extrae user_id autenticado (req.user)
 * - Permite inyectar cultivoId / macetaId desde params o body
 * - Adjunta request_id (y contexto) al AsyncLocalStorage para el LoggerService
 * - Registra startTime y al finalizar (res.on('finish')) loguea request_completed
 */
const crypto = require("crypto");
const { run } = require("../shared/logger/requestContext");
const { logger } = require("../shared/logger");

function generateRequestId() {
  return crypto.randomUUID?.() ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Extrae un número de req.user (membership_id, account_id, o sub si es numérico).
 * logs_sistema.user_id es INT; si no hay número, queda undefined.
 */
function extractUserId(req) {
  if (!req.user) return undefined;
  const m = req.user.membership_id ?? req.user.membershipId;
  if (typeof m === "number") return m;
  const a = req.user.account_id ?? req.user.accountId;
  if (typeof a === "number") return a;
  const s = req.user.sub;
  if (typeof s === "number") return s;
  return undefined;
}

/**
 * Middleware que debe ir después de authenticateJwt si se quiere userId.
 * No depende de auth: si no hay user, requestId y opcionales cultivo/maceta siguen disponibles.
 */
function requestLoggerContext(req, res, next) {
  const startTime = Date.now();
  req.startTime = startTime;

  const requestId = generateRequestId();
  req.requestId = requestId;

  const cultivoIdParam = req.params.cultivoId ?? req.params.cultivo_id;
  const macetaIdParam = req.params.macetaId ?? req.params.maceta_id;
  const cultivoIdBody = req.body?.cultivoId ?? req.body?.cultivo_id;
  const macetaIdBody = req.body?.macetaId ?? req.body?.maceta_id;

  const cultivoId = cultivoIdParam ?? cultivoIdBody;
  const macetaId = macetaIdParam ?? macetaIdBody;

  const numericCultivoId = cultivoId != null ? Number(cultivoId) : undefined;
  const context = {
    requestId,
    userId: extractUserId(req),
    cultivoId: Number.isNaN(numericCultivoId) ? undefined : numericCultivoId,
    macetaId: typeof macetaId === "string" ? macetaId : (macetaId != null ? String(macetaId) : undefined),
    cicloId: req.body?.cicloId ?? req.params.cicloId ?? undefined,
  };

  req.logContext = context;

  res.on("finish", () => {
    const duracion_ms = Date.now() - startTime;
    logger.log({
      nivel: "info",
      modulo: "http",
      evento: "request_completed",
      mensaje: `${req.method} ${req.originalUrl}`,
      userId: context.userId,
      cultivoId: context.cultivoId,
      macetaId: context.macetaId,
      cicloId: context.cicloId,
      contexto: {
        request_id: requestId,
        statusCode: res.statusCode,
        duracion_ms,
      },
    });
  });

  run(context, () => {
    next();
  });
}

module.exports = {
  requestLoggerContext,
  generateRequestId,
  extractUserId,
};
