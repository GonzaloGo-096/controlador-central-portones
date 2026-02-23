const authRepository = require("../modules/auth/auth.repository");
const { USER_ROLES } = require("../shared/types/auth.types");
const { requireAccountId } = require("../shared/utils/scope");

function requireGateAccess(gateIdResolver, options = {}) {
  const { permission } = options;
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }

    if (
      req.user.role === USER_ROLES.SUPERADMIN ||
      req.user.role === USER_ROLES.ADMIN_CUENTA
    ) {
      return next();
    }

    const gateId = typeof gateIdResolver === "function" ? gateIdResolver(req) : gateIdResolver;
    const gateIdNum = Number(gateId);
    if (Number.isNaN(gateIdNum)) {
      return res.status(400).json({ error: "gateId inválido para autorización" });
    }

    const accountId = requireAccountId(req.user);
    const access = await authRepository.hasGateAccessByAccount(
      String(req.user.sub),
      gateIdNum,
      accountId,
      permission
    );
    if (!access) {
      return res.status(403).json({ error: "Sin acceso al portón" });
    }

    return next();
  };
}

module.exports = {
  requireGateAccess,
};
