/**
 * Middleware de manejo de errores global.
 * - AppError: se loguea con LoggerService y se responde con statusCode/modulo/evento.
 * - Otros errores: se loguean como error genérico y 500.
 * Nunca rompe: si el logger falla, se ignora y se envía la respuesta.
 */
const { logger } = require("../shared/logger");
const { AppError } = require("../shared/errors");
const { getContext } = require("../shared/logger/requestContext");

function errorHandler(err, req, res, _next) {
  const ctx = getContext();

  try {
    if (err instanceof AppError) {
      logger.log({
        nivel: "error",
        modulo: err.modulo,
        evento: err.evento,
        mensaje: err.message,
        userId: ctx?.userId,
        cultivoId: ctx?.cultivoId,
        macetaId: ctx?.macetaId,
        cicloId: ctx?.cicloId,
        contexto: {
          request_id: ctx?.requestId,
          statusCode: err.statusCode,
          stack: err.stack,
        },
      });
      return res.status(err.statusCode).json({
        error: err.message,
        modulo: err.modulo,
        evento: err.evento,
        ...(req.requestId ? { requestId: req.requestId } : {}),
      });
    }

    logger.log({
      nivel: "error",
      modulo: "app",
      evento: "unhandled_error",
      mensaje: err?.message ?? String(err),
      userId: ctx?.userId,
      cultivoId: ctx?.cultivoId,
      macetaId: ctx?.macetaId,
      contexto: {
        request_id: ctx?.requestId,
        name: err?.name,
        stack: err?.stack,
      },
    });
  } catch (_logErr) {
    // no romper el flujo si falla el log
  }

  const statusCode = err?.statusCode ?? 500;
  const message = statusCode === 500 ? "Error interno del servidor" : (err?.message ?? "Error");
  return res.status(statusCode).json({
    error: message,
    ...(req.requestId ? { requestId: req.requestId } : {}),
  });
}

module.exports = { errorHandler };
