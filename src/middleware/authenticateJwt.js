const { verifyAccessToken } = require("../shared/utils/jwt");

function authenticateJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token requerido" });
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch (_err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

module.exports = {
  authenticateJwt,
};
