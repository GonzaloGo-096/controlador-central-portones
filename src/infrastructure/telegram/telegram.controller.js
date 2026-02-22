const express = require("express");
const { authenticateJwt } = require("../../middleware/authenticateJwt");
const { requireRoles } = require("../../middleware/requireRoles");
const { requireGateAccess } = require("../../middleware/requireGateAccess");
const { USER_ROLES } = require("../../shared/types/auth.types");
const { abrirPortonConDebounce } = require("../../modules/portones/portones.service");

const router = express.Router();

router.use(authenticateJwt);
router.use(
  requireRoles([USER_ROLES.SUPERADMIN, USER_ROLES.ADMIN_CUENTA, USER_ROLES.OPERADOR])
);

router.post(
  "/portones/:id/abrir",
  requireGateAccess((req) => req.params.id, { permission: "open" }),
  async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

    try {
      const result = await abrirPortonConDebounce({
        portonId: id,
        usuarioToken: req.user,
        canal: "telegram",
      });

      if (result.notFound) return res.status(404).json({ error: "Portón no encontrado" });
      if (result.debounced) {
        return res.status(429).json({ error: "Comando bloqueado por debounce" });
      }
      return res.status(200).json({ ok: true, canal: "telegram" });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
