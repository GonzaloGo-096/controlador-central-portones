/**
 * Servicio central de logging para el módulo cultivos.
 * Persiste en logs_sistema y opcionalmente en consola (dev).
 * Nunca rompe el flujo: fallos de log se tragan internamente.
 * LOG_LEVEL: debug | info | warn | error (ignora niveles inferiores).
 */
const { prisma } = require("../../infrastructure/database/prismaClient");
const { getContext } = require("./requestContext");

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_DEV = NODE_ENV === "development";

const NIVELES_VALIDOS = ["debug", "info", "warn", "error"];
const NIVEL_ORDEN = { debug: 0, info: 1, warn: 2, error: 3 };

const LOG_LEVEL_RAW = (process.env.LOG_LEVEL || "info").toString().toLowerCase();
const LOG_LEVEL = NIVELES_VALIDOS.includes(LOG_LEVEL_RAW) ? LOG_LEVEL_RAW : "info";
const LOG_LEVEL_PESO = NIVEL_ORDEN[LOG_LEVEL];

const CONTEXTO_MAX_BYTES = 10 * 1024;

function normalizarNivel(nivel) {
  const n = typeof nivel === "string" ? nivel.toLowerCase() : "";
  return NIVELES_VALIDOS.includes(n) ? n : "info";
}

function limitarContexto(contexto) {
  if (contexto === null || contexto === undefined) return null;
  const obj = typeof contexto === "object" && contexto !== null ? contexto : { value: contexto };
  let jsonStr = "";
  try {
    jsonStr = JSON.stringify(obj);
  } catch (_) {
    return { contexto_truncado: true, error: "JSON.stringify" };
  }
  const bytes = Buffer.byteLength(jsonStr, "utf8");
  if (bytes <= CONTEXTO_MAX_BYTES) {
    return obj;
  }
  const buf = Buffer.from(jsonStr, "utf8");
  const previewMaxBytes = Math.floor(CONTEXTO_MAX_BYTES / 2) - 100;
  const previewBuf = buf.slice(0, previewMaxBytes);
  let preview = previewBuf.toString("utf8");
  if (buf.length > previewMaxBytes) {
    preview += "...";
  }
  return {
    contexto_truncado: true,
    _truncado_bytes: bytes,
    _preview: preview,
  };
}

/**
 * @param {Object} opts
 * @param {'info'|'warn'|'error'|'debug'} opts.nivel
 * @param {string} opts.modulo
 * @param {string} opts.evento
 * @param {string} opts.mensaje
 * @param {number} [opts.userId]
 * @param {number} [opts.cultivoId]
 * @param {string} [opts.macetaId]
 * @param {string} [opts.cicloId]
 * @param {Record<string, any>} [opts.contexto]
 */
function log(opts) {
  const nivel = normalizarNivel(opts.nivel);
  if (NIVEL_ORDEN[nivel] < LOG_LEVEL_PESO) {
    return;
  }

  const modulo = typeof opts.modulo === "string" ? opts.modulo : "app";
  const evento = typeof opts.evento === "string" ? opts.evento : "event";
  const mensaje = typeof opts.mensaje === "string" ? opts.mensaje : "";

  const ctx = getContext();
  const userId = opts.userId ?? ctx?.userId;
  const cultivoId = opts.cultivoId ?? ctx?.cultivoId;
  const macetaId = opts.macetaId ?? ctx?.macetaId;
  const cicloId = opts.cicloId ?? ctx?.cicloId;

  const contextoBruto = {
    ...(ctx?.requestId ? { request_id: ctx.requestId } : {}),
    ...(typeof opts.contexto === "object" && opts.contexto !== null ? opts.contexto : {}),
  };
  const contexto = limitarContexto(
    Object.keys(contextoBruto).length > 0 ? contextoBruto : null
  );

  try {
    if (IS_DEV) {
      const prefix = `[${nivel.toUpperCase()}] [${modulo}] [${evento}]`;
      const payload = { mensaje, userId, cultivoId, macetaId, cicloId, requestId: ctx?.requestId };
      if (nivel === "error") {
        console.error(prefix, mensaje, payload);
      } else if (nivel === "warn") {
        console.warn(prefix, mensaje, payload);
      } else {
        console.log(prefix, mensaje, payload);
      }
    }

    prisma.logSistema
      .create({
        data: {
          nivel,
          mensaje,
          modulo,
          evento,
          userId: userId ?? null,
          cultivoId: cultivoId ?? null,
          macetaId: macetaId ?? null,
          cicloId: cicloId ?? null,
          contexto,
        },
      })
      .catch((err) => {
        if (IS_DEV) {
          console.error("[LoggerService] Fallo al persistir log (no se rompe el flujo):", err?.message ?? err);
        }
      });
  } catch (err) {
    if (IS_DEV) {
      console.error("[LoggerService] Error interno en log:", err?.message ?? err);
    }
  }
}

module.exports = {
  log,
};
