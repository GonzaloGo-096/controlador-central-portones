/**
 * Servicio de adaptación manual de parámetros de riego.
 * Compara efecto real del último riego (pre/post humedad) con el esperado
 * y ajusta volumen_ml_base si aplica.
 */
const { prisma } = require("../../../infrastructure/database/prismaClient");
const { logger } = require("../../../shared/logger");
const { AppError } = require("../../../shared/errors");

const MODULO = "cultivos";
const EVENTO_ADAPTACION = "riego_adaptacion";
const FACTOR_CONVERSION = 0.05;

function redondear2(n) {
  return Math.round(n * 100) / 100;
}

class RiegoAdaptacionService {
  /**
   * Evalúa el último riego de la maceta y adapta parámetros si corresponde.
   * @param {string} macetaId - UUID de la maceta
   * @returns {Promise<{ adaptado: boolean, motivo?: string, parametrosAnteriores?: object, parametrosNuevos?: object, adaptacionId?: string }>}
   */
  async adaptarMaceta(macetaId) {
    if (!macetaId || typeof macetaId !== "string") {
      throw new AppError("macetaId inválido", {
        statusCode: 400,
        modulo: MODULO,
        evento: EVENTO_ADAPTACION,
      });
    }

    return prisma.$transaction(async (tx) => {
      const ultimoRiego = await tx.riego.findFirst({
        where: { macetaId },
        orderBy: { ejecutadoAt: "desc" },
        take: 1,
      });

      if (!ultimoRiego) {
        const motivo = "No hay riego registrado para la maceta";
        logger.log({
          nivel: "info",
          modulo: MODULO,
          evento: "sin_ajuste_necesario",
          mensaje: motivo,
          macetaId,
        });
        return { adaptado: false, motivo };
      }

      const yaAdaptado = await tx.adaptacion.findFirst({
        where: {
          macetaId,
          riegoId: ultimoRiego.id,
          tipo: "ajuste_volumen",
        },
      });

      if (yaAdaptado) {
        logger.log({
          nivel: "info",
          modulo: MODULO,
          evento: "sin_ajuste_necesario",
          mensaje: "Ya existe adaptación para este riego",
          macetaId,
          contexto: { riegoId: ultimoRiego.id },
        });
        return { adaptado: false, motivo: "ya_adaptado" };
      }

      const [lecturaPre, lecturaPost, parametrosVigentes] = await Promise.all([
        tx.sensoresLectura.findFirst({
          where: {
            macetaId,
            createdAt: { lt: ultimoRiego.ejecutadoAt },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        }),
        tx.sensoresLectura.findFirst({
          where: {
            macetaId,
            createdAt: { gt: ultimoRiego.ejecutadoAt },
          },
          orderBy: { createdAt: "asc" },
          take: 1,
        }),
        tx.parametrosRiego.findFirst({
          where: { macetaId, vigenteHasta: null },
        }),
      ]);

      if (!parametrosVigentes) {
        throw new AppError("No hay parámetros de riego vigentes para la maceta", {
          statusCode: 404,
          modulo: MODULO,
          evento: EVENTO_ADAPTACION,
        });
      }

      if (!lecturaPre || lecturaPre.humedad == null) {
        const motivo = "No hay lectura de humedad anterior al último riego";
        logger.log({
          nivel: "info",
          modulo: MODULO,
          evento: "sin_ajuste_necesario",
          mensaje: motivo,
          macetaId,
        });
        return { adaptado: false, motivo };
      }

      if (!lecturaPost || lecturaPost.humedad == null) {
        const motivo = "No hay lectura de humedad posterior al último riego";
        logger.log({
          nivel: "info",
          modulo: MODULO,
          evento: "sin_ajuste_necesario",
          mensaje: motivo,
          macetaId,
        });
        return { adaptado: false, motivo };
      }

      const humedadPre = Number(lecturaPre.humedad);
      const humedadPost = Number(lecturaPost.humedad);
      const aumentoEsperado = redondear2(ultimoRiego.volumenMl * FACTOR_CONVERSION);
      const deltaReal = redondear2(humedadPost - humedadPre);
      const volumenBase = Number(parametrosVigentes.volumenMlBase) || 0;

      if (deltaReal <= 0) {
        logger.log({
          nivel: "warn",
          modulo: MODULO,
          evento: "sin_ajuste_necesario",
          mensaje: "Delta real no válido (<= 0), no se adapta",
          macetaId,
          contexto: { deltaReal, aumentoEsperado, humedadPre, humedadPost },
        });
        return { adaptado: false, motivo: "delta_no_valido" };
      }

      const umbralBajo = aumentoEsperado * 0.5;
      const umbralAlto = aumentoEsperado * 1.5;

      let nuevoVolumenBase = null;
      let motivoNoAjuste = null;

      if (deltaReal < umbralBajo) {
        nuevoVolumenBase = volumenBase * 1.1;
      } else if (deltaReal > umbralAlto) {
        nuevoVolumenBase = volumenBase * 0.9;
      } else {
        motivoNoAjuste =
          "Delta real dentro del rango esperado; no se requiere ajuste";
      }

      if (nuevoVolumenBase === null) {
        logger.log({
          nivel: "info",
          modulo: MODULO,
          evento: "sin_ajuste_necesario",
          mensaje: motivoNoAjuste,
          macetaId,
          contexto: {
            deltaReal,
            aumentoEsperado,
            humedadPre,
            humedadPost,
          },
        });
        return { adaptado: false, motivo: motivoNoAjuste };
      }

      const efectividadRatio =
        aumentoEsperado > 0 ? redondear2(deltaReal / aumentoEsperado) : 0;

      const now = new Date();
      const parametrosAnteriores = {
        version: parametrosVigentes.version,
        humedadObjetivoMin: parametrosVigentes.humedadObjetivoMin,
        humedadObjetivoMax: parametrosVigentes.humedadObjetivoMax,
        volumenMlBase: parametrosVigentes.volumenMlBase,
      };

      await tx.parametrosRiego.update({
        where: { id: parametrosVigentes.id },
        data: { vigenteHasta: now, updatedAt: now },
      });

      const nuevoParam = await tx.parametrosRiego.create({
        data: {
          macetaId,
          version: parametrosVigentes.version + 1,
          humedadObjetivoMin: parametrosVigentes.humedadObjetivoMin,
          humedadObjetivoMax: parametrosVigentes.humedadObjetivoMax,
          volumenMlBase: Math.round(nuevoVolumenBase),
          vigenteDesde: now,
          vigenteHasta: null,
        },
      });

      const parametrosNuevos = {
        version: nuevoParam.version,
        humedadObjetivoMin: nuevoParam.humedadObjetivoMin,
        humedadObjetivoMax: nuevoParam.humedadObjetivoMax,
        volumenMlBase: nuevoParam.volumenMlBase,
      };

      const parametrosAnterioresConMetricas = {
        ...parametrosAnteriores,
        delta_real: deltaReal,
        aumento_esperado: aumentoEsperado,
        efectividad_ratio: efectividadRatio,
      };

      const adaptacion = await tx.adaptacion.create({
        data: {
          macetaId,
          riegoId: ultimoRiego.id,
          tipo: "ajuste_volumen",
          parametrosAnteriores: parametrosAnterioresConMetricas,
          parametrosNuevos,
        },
      });

      logger.log({
        nivel: "info",
        modulo: MODULO,
        evento: "parametros_ajustados",
        mensaje: "Parámetros de riego adaptados por efecto real del último riego",
        macetaId,
        contexto: {
          riegoId: ultimoRiego.id,
          deltaReal,
          aumentoEsperado,
          efectividad_ratio: efectividadRatio,
          volumenAnterior: parametrosVigentes.volumenMlBase,
          volumenNuevo: nuevoParam.volumenMlBase,
          versionAnterior: parametrosVigentes.version,
          versionNueva: nuevoParam.version,
        },
      });

      return {
        adaptado: true,
        parametrosAnteriores,
        parametrosNuevos,
        adaptacionId: adaptacion.id,
      };
    });
  }
}

module.exports = { RiegoAdaptacionService };
