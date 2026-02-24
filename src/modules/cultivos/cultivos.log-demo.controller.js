/**
 * Controller mock para demostrar el uso del LoggerService y AppError.
 * No es lógica de negocio; solo ejemplos de uso de la infraestructura de logging.
 */
const express = require("express");
const { logger } = require("../../shared/logger");
const { AppError } = require("../../shared/errors");
const { authenticateJwt } = require("../../middleware/authenticateJwt");
const { requireRoles, ADMIN_ACCESS_ROLES } = require("../../middleware/requireRoles");

const router = express.Router();

// Rutas de demo: requieren auth para tener userId en contexto
router.use("/log-demo", authenticateJwt);
router.use("/log-demo", requireRoles(ADMIN_ACCESS_ROLES));

/**
 * GET /api/cultivos/log-demo
 * Ejemplo: loguear evento y devolver requestId y logContext.
 */
router.get("/log-demo", async (req, res) => {
  logger.log({
    nivel: "info",
    modulo: "cultivos",
    evento: "log_demo_consultado",
    mensaje: "Consulta de demo de logging",
    contexto: { source: "cultivos.log-demo.controller" },
  });

  return res.status(200).json({
    ok: true,
    requestId: req.requestId,
    logContext: req.logContext,
    message: "Revisá logs_sistema y consola (dev) para ver el log.",
  });
});

/**
 * GET /api/cultivos/log-demo/error
 * Ejemplo: lanzar AppError y ver integración con logger (status 400 y log automático).
 */
router.get("/log-demo/error", async (req, res, next) => {
  try {
    logger.log({
      nivel: "warn",
      modulo: "cultivos",
      evento: "log_demo_error_solicitado",
      mensaje: "El cliente pidió simular un error",
    });

    throw new AppError("Error de ejemplo para demo de logging", {
      statusCode: 400,
      modulo: "cultivos",
      evento: "demo_error",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cultivos/log-demo/with-context
 * Ejemplo: inyectar cultivoId/macetaId por body y loguear con ese contexto.
 * Body: { cultivoId?: number, macetaId?: string, cicloId?: string }
 */
router.post("/log-demo/with-context", async (req, res) => {
  const { cultivoId, macetaId, cicloId } = req.body || {};

  logger.log({
    nivel: "info",
    modulo: "cultivos",
    evento: "log_demo_con_contexto",
    mensaje: "Log con cultivo/maceta/ciclo inyectados",
    cultivoId: cultivoId != null ? Number(cultivoId) : undefined,
    macetaId: macetaId != null ? String(macetaId) : undefined,
    cicloId: cicloId != null ? String(cicloId) : undefined,
    contexto: { body: { cultivoId, macetaId, cicloId } },
  });

  return res.status(200).json({
    ok: true,
    requestId: req.requestId,
    logContext: req.logContext,
    received: { cultivoId, macetaId, cicloId },
  });
});

module.exports = router;
