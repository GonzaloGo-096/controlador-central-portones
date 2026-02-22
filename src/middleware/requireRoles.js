const { USER_ROLES } = require("../shared/types/auth.types");

function requireRoles(allowedRoles) {
  const allowed = new Set(Array.isArray(allowedRoles) ? allowedRoles : []);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }

    if (!allowed.has(req.user.role)) {
      return res.status(403).json({ error: "Sin permisos para esta operación" });
    }

    return next();
  };
}

const ADMIN_ACCESS_ROLES = [USER_ROLES.SUPERADMIN, USER_ROLES.ADMIN_CUENTA];

module.exports = {
  requireRoles,
  ADMIN_ACCESS_ROLES,
};
