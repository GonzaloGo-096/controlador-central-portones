# Informe: Flujo Portones en Telegram (listar grupos y gates)

## 1. Qué fallaba (causa raíz)

**Problema:** Al tocar "Portones" en el menú del bot, solo aparecía el mensaje *"Módulo Portones activo. Usá /abrir {id_porton}."* y **no se listaban los grupos ni los gates**.

**Causa raíz:** El **bot no implementaba la navegación**. El backend ya tenía los endpoints:

- `GET /api/telegram/bot/modulos/portones/grupos`
- `GET /api/telegram/bot/modulos/portones/grupos/:grupoId/portones`

pero el bot en `mod:portones` solo enviaba un mensaje de texto y **nunca llamaba a esos endpoints**.

**Evidencia:**
- `telegram-bot-portones/src/bot/commands.js` línea 10–14: el callback `mod:portones` hacía `sendMessage(chatId, "Módulo Portones activo...")` y retornaba.
- No existían `getPortonGroups` ni `getGatesByGroup` en el backendClient.

**Estado del backend:** OK. Los endpoints responden correctamente y el scope por membership (admin/operator) está bien implementado.

---

## 2. Qué cambié (archivos modificados)

| Archivo | Cambio |
|---------|--------|
| `telegram-bot-portones/src/api/backendClient.js` | Agregados `getPortonGroups(telegramId)` y `getGatesByGroup(telegramId, grupoId)` |
| `telegram-bot-portones/src/bot/commands.js` | Reescrito el handler de `callback_query`: `mod:portones` → lista grupos; `PORTONES:GROUP:<id>` → lista gates; `PORTONES:GATE:<id>:GROUP:<gid>` → detalle + instrucción `/abrir` |
| `telegram-bot-portones/src/bot/commands.js` | Helper `errorMessageForStatus(status)` para 401/404/503/500 |
| `controlador-central-portones/scripts/debug_portones_scope.js` | **Nuevo:** muestra grupos y gates visibles para un `telegramId` |
| `controlador-central-portones/scripts/test_telegram_portones_flow.js` | **Nuevo:** prueba HTTP del flujo menú → grupos → gates |

**Migraciones:** Se aplicaron migraciones pendientes (`20260223180000_identity_membership`, `20260223180100_drop_legacy_user_tables`) antes de diagnosticar.

---

## 3. Cómo probar

### Prerrequisitos

- Backend con `DATABASE_URL` y `TELEGRAM_BOT_INTERNAL_SECRET`
- Bot con `BACKEND_BASE_URL` y `TELEGRAM_BOT_INTERNAL_SECRET` igual al backend
- Seed ejecutado (`node prisma/seed.js`) con usuario Telegram `1837694465`

### Comandos

```bash
# 1. Backend
cd controlador-central-portones
npm run dev

# 2. En otra terminal: scripts de verificación
node scripts/debug_identity.js 1837694465
node scripts/debug_portones_scope.js 1837694465
node scripts/test_telegram_portones_flow.js 1837694465 http://localhost:3030

# 3. Tests unitarios
npm test
```

### Flujo esperado en Telegram

1. `/start` → menú con botones "Portones" y "Cultivos"
2. Tocar "Portones" → teclado con grupos (ej. "Familia - Portones")
3. Tocar un grupo → teclado con gates (ej. "Satlta 608 (id: 4)")
4. Tocar un gate → mensaje con instrucción `/abrir 4` (sin abrir aún)

### Test HTTP (sin Telegram)

```bash
# Con TELEGRAM_BOT_INTERNAL_SECRET en .env
node scripts/test_telegram_portones_flow.js 1837694465
```

---

## 4. Scripts de verificación

| Script | Uso | Salida esperada |
|--------|-----|-----------------|
| `debug_identity.js <telegramId>` | Identity, memberships, counts | Identity + cuenta + role + grupos/gates asignados |
| `debug_portones_scope.js <telegramId>` | Scope de grupos/gates | Grupos visibles, gates visibles, por qué |
| `test_telegram_portones_flow.js <telegramId> [baseUrl]` | Flujo HTTP completo | Status 200 en menu, grupos, portones |

---

## 5. Tests mínimos

- **Unit:** `operador con solo group assignment => Portones enabled` ✅
- **Unit:** `operador con solo gate assignment => Portones enabled` ✅
- **Unit:** `admin => buildPortonGroupScopeForMembership devuelve accountId` ✅
- **Integration:** `test_telegram_portones_flow.js` cubre el flujo HTTP completo (requiere servidor + secret)

---

## 6. Callback_data (formato)

- `mod:portones` → menú Portones
- `PORTONES:GROUP:<grupoId>` → listar gates del grupo
- `PORTONES:GATE:<gateId>:GROUP:<grupoId>` → detalle del gate
