/**
 * Motor adaptativo de riego por maceta.
 * Evalúa humedad actual vs rango objetivo y recomienda acción y volumen.
 * No persiste en base; solo lectura y cálculo.
 */
const { prisma } = require("../../../infrastructure/database/prismaClient");
const { logger } = require("../../../shared/logger");
const { AppError } = require("../../../shared/errors");

const MODULO = "cultivos";
const EVENTO_EVALUACION = "riego_adaptativo_evaluacion";

class RiegoAdaptativoService {
  /**
   * Evalúa una maceta y devuelve recomendación de riego.
   * @param {string} macetaId - UUID de la maceta
   * @returns {Promise<{
   *   macetaId: string,
   *   humedadActual: number | null,
   *   rangoObjetivo: { min: number, max: number },
   *   desviacionPorcentual: number,
   *   accionRecomendada: 'regar' | 'no_regar',
   *   volumenRecomendadoMl: number,
   *   diagnostico: string
   * }>}
   */
  async evaluarMaceta(macetaId) {
    if (!macetaId || typeof macetaId !== "string") {
      throw new AppError("macetaId inválido", {
        statusCode: 400,
        modulo: MODULO,
        evento: EVENTO_EVALUACION,
      });
    }

    const [ultimaLectura, parametrosVigentes, ultimoRiego] = await Promise.all([
      this._obtenerUltimaLectura(macetaId),
      this._obtenerParametrosVigentes(macetaId),
      this._obtenerUltimoRiego(macetaId),
    ]);

    if (!parametrosVigentes) {
      throw new AppError("No hay parámetros de riego vigentes para la maceta", {
        statusCode: 404,
        modulo: MODULO,
        evento: EVENTO_EVALUACION,
      });
    }

    const min = parametrosVigentes.humedadObjetivoMin ?? 0;
    const max = parametrosVigentes.humedadObjetivoMax ?? 100;
    const volumenBase = parametrosVigentes.volumenMlBase ?? 0;

    const humedadActual =
      ultimaLectura?.humedad != null ? Number(ultimaLectura.humedad) : null;

    if (humedadActual === null) {
      throw new AppError("No hay lectura de humedad para la maceta", {
        statusCode: 404,
        modulo: MODULO,
        evento: EVENTO_EVALUACION,
      });
    }

    const rangoObjetivo = { min, max };

    // Desviación formal: respecto al mínimo o al máximo; 0 si dentro del rango.
    let desviacionPorcentual = 0;
    if (humedadActual < min && min > 0) {
      desviacionPorcentual = ((min - humedadActual) / min) * 100;
    } else if (humedadActual > max && max > 0) {
      desviacionPorcentual = ((humedadActual - max) / max) * 100;
    }
    desviacionPorcentual = Math.round(desviacionPorcentual * 100) / 100;

    let accionRecomendada = "no_regar";
    if (humedadActual < min) {
      accionRecomendada = "regar";
    }

    // Volumen: 0 si no_regar; solo aplicar multiplicadores cuando se va a regar; entero final.
    let volumenRecomendadoMl = 0;
    if (accionRecomendada === "regar") {
      let v = Number(volumenBase) || 0;
      if (desviacionPorcentual > 40) {
        v = v * 1.4;
      } else if (desviacionPorcentual > 20) {
        v = v * 1.2;
      }
      volumenRecomendadoMl = Math.round(v);
    }

    const diagnostico = this._construirDiagnostico({
      macetaId,
      humedadActual,
      rangoObjetivo,
      desviacionPorcentual,
      accionRecomendada,
      volumenRecomendadoMl,
      ultimaLectura,
      ultimoRiego,
    });

    logger.log({
      nivel: "debug",
      modulo: MODULO,
      evento: EVENTO_EVALUACION,
      mensaje: "Evaluación de maceta",
      macetaId,
      contexto: {
        humedadActual,
        rangoObjetivo,
        desviacionPorcentual,
        accionRecomendada,
        volumenRecomendadoMl,
        diagnostico: diagnostico.slice(0, 200),
      },
    });

    return {
      macetaId,
      humedadActual,
      rangoObjetivo,
      desviacionPorcentual,
      accionRecomendada,
      volumenRecomendadoMl,
      diagnostico,
    };
  }

  async _obtenerUltimaLectura(macetaId) {
    const lectura = await prisma.sensoresLectura.findFirst({
      where: { macetaId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    return lectura;
  }

  async _obtenerParametrosVigentes(macetaId) {
    const params = await prisma.parametrosRiego.findFirst({
      where: { macetaId, vigenteHasta: null },
    });
    return params;
  }

  async _obtenerUltimoRiego(macetaId) {
    const riego = await prisma.riego.findFirst({
      where: { macetaId },
      orderBy: { ejecutadoAt: "desc" },
      take: 1,
    });
    return riego;
  }

  _construirDiagnostico(datos) {
    const {
      macetaId,
      humedadActual,
      rangoObjetivo,
      desviacionPorcentual,
      accionRecomendada,
      volumenRecomendadoMl,
      ultimaLectura,
      ultimoRiego,
    } = datos;

    const partes = [];
    partes.push(
      `Humedad actual: ${humedadActual}%. Rango objetivo: [${rangoObjetivo.min}, ${rangoObjetivo.max}]%.`
    );
    partes.push(`Desviación: ${desviacionPorcentual.toFixed(2)}%.`);
    partes.push(`Acción: ${accionRecomendada}.`);
    if (accionRecomendada === "regar") {
      partes.push(`Volumen recomendado: ${volumenRecomendadoMl} ml.`);
    }
    if (ultimaLectura?.createdAt) {
      partes.push(
        `Última lectura: ${ultimaLectura.createdAt.toISOString()}.`
      );
    }
    if (ultimoRiego?.ejecutadoAt) {
      partes.push(
        `Último riego: ${ultimoRiego.ejecutadoAt.toISOString()} (${ultimoRiego.volumenMl} ml).`
      );
    }

    return partes.join(" ");
  }
}

module.exports = { RiegoAdaptativoService };
