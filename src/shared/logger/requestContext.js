/**
 * Contexto de request para el logger (request_id, userId, cultivoId, macetaId).
 * Usado por el middleware y leído por LoggerService para adjuntar a cada log.
 */
const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

/**
 * @typedef {Object} RequestLogContext
 * @property {string} requestId
 * @property {number} [userId]
 * @property {number} [cultivoId]
 * @property {string} [macetaId]
 * @property {string} [cicloId]
 */

/**
 * Obtiene el contexto de log del request actual (si existe).
 * @returns {RequestLogContext | undefined}
 */
function getContext() {
  return storage.getStore();
}

/**
 * Ejecuta fn con el contexto dado. Usado por el middleware.
 * @param {RequestLogContext} context
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>}
 */
function run(context, fn) {
  return storage.run(context, fn);
}

module.exports = {
  getContext,
  run,
};
