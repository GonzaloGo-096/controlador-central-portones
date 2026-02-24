/**
 * Controller de evaluación de riego por maceta.
 * GET /macetas/:macetaId/evaluar → resultado de RiegoAdaptativoService.evaluarMaceta
 */
const express = require("express");
const { RiegoAdaptativoService } = require("../services/RiegoAdaptativoService");
const { logger } = require("../../../shared/logger");

const router = express.Router();

router.get("/:macetaId/evaluar", async (req, res, next) => {
  const macetaId = req.params.macetaId;
  if (!macetaId) {
    return res.status(400).json({ ok: false, error: "macetaId requerido" });
  }

  try {
    const service = new RiegoAdaptativoService();
    const resultado = await service.evaluarMaceta(macetaId);

    logger.log({
      nivel: "info",
      modulo: "cultivos",
      evento: "evaluacion_maceta",
      mensaje: "Evaluación ejecutada",
      macetaId,
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
