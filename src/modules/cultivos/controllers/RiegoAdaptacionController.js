/**
 * Controller de adaptación manual de parámetros de riego por maceta.
 * POST /macetas/:macetaId/adaptar → RiegoAdaptacionService.adaptarMaceta
 */
const express = require("express");
const { RiegoAdaptacionService } = require("../services/RiegoAdaptacionService");
const { logger } = require("../../../shared/logger");
const { AppError } = require("../../../shared/errors");

const router = express.Router();

router.post("/:macetaId/adaptar", async (req, res, next) => {
  const macetaId = req.params.macetaId;
  if (!macetaId || typeof macetaId !== "string" || macetaId.trim() === "") {
    return next(
      new AppError("macetaId inválido o requerido", {
        statusCode: 400,
        modulo: "cultivos",
        evento: "adaptacion_maceta",
      })
    );
  }

  try {
    const service = new RiegoAdaptacionService();
    const resultado = await service.adaptarMaceta(macetaId);

    logger.log({
      nivel: "info",
      modulo: "cultivos",
      evento: resultado.adaptado ? "adaptacion_ejecutada" : "adaptacion_sin_cambios",
      mensaje: resultado.adaptado
        ? "Adaptación de parámetros ejecutada"
        : "Sin cambios en adaptación",
      macetaId,
      contexto: { adaptado: resultado.adaptado, motivo: resultado.motivo },
    });

    return res.status(200).json({
      ok: true,
      data: resultado,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
