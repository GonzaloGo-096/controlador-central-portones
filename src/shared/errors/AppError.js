/**
 * Error de aplicación con statusCode, modulo y evento.
 * Se integra con el logger en el middleware de errores.
 */
class AppError extends Error {
  /**
   * @param {string} message
   * @param {Object} opts
   * @param {number} [opts.statusCode=500]
   * @param {string} [opts.modulo='app']
   * @param {string} [opts.evento='error']
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = typeof opts.statusCode === "number" ? opts.statusCode : 500;
    this.modulo = typeof opts.modulo === "string" ? opts.modulo : "app";
    this.evento = typeof opts.evento === "string" ? opts.evento : "error";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

module.exports = { AppError };
