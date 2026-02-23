# Guía de migración: Identity + AccountMembership

Migración big-bang al modelo multi-tenant con **Identity**, **Credential**, **AccountMembership** y scopes por membership. Sin compatibilidad con el modelo legacy.

---

## 1. Prerrequisitos

- Node.js >= 20.19.0
- PostgreSQL configurado
- Variables de entorno: `DATABASE_URL` (y las que use tu `.env`)

---

## 2. Aplicar migraciones Prisma

```bash
cd controlador-central-portones
npx prisma migrate deploy
```

O en desarrollo (crea migraciones si faltan):

```bash
npx prisma migrate dev
```

---

## 3. Migrar datos (si tenés datos legacy)

Si tenés tablas `users`, `user_credentials`, `user_porton_groups`, `user_gates`, ejecutá el script de migración **después** de aplicar la migración que crea las tablas nuevas y **antes** de la que borra las legacy:

```bash
node scripts/migrate_to_identity_membership.js
```

Para forzar re-ejecución:

```bash
node scripts/migrate_to_identity_membership.js --force
```

El script es idempotente (salvo con `--force`) y reporta conteos de migración y huérfanos detectados.

---

## 4. Fresh install (sin datos legacy)

Si arrancás de cero, después de `prisma migrate deploy`:

```bash
npx prisma db seed
```

---

## 5. Verificar identidad por Telegram ID

```bash
node scripts/debug_identity.js <telegramId>
```

Ejemplo:

```bash
node scripts/debug_identity.js 123456789
```

Imprime Identity, memberships, cuenta(s) y conteos de grupos y gates asignados.

---

## 6. Probar endpoint menú del bot

Con el servidor backend levantado:

```bash
npm run dev
```

En otra terminal:

```bash
curl -s "http://localhost:3000/api/telegram/bot/menu?telegramId=123456789"
```

Respuesta esperada (JSON):

- `user`: datos del usuario
- `modules`: array de módulos (ej. `{ id: "portones", label: "Portones" }`)
- `requiresAccountSelection`: `true` si hay más de una cuenta (el bot muestra placeholder)

---

## 7. Ejecutar tests

```bash
npm test
```

Tests cubren:

- `resolveIdentityFromTelegramId` (ok / 404)
- Operador con solo group assignment → Portones enabled
- Operador con solo gate assignment → Portones enabled
- Admin scope por `accountId`
- Scopes de membership (buildPortonGroupScopeForMembership, buildGateScopeForMembership)

---

## Orden de ejecución recomendado

| Paso | Comando |
|------|---------|
| 1 | `npx prisma migrate dev` (o `deploy`) |
| 2 | `node scripts/migrate_to_identity_membership.js` (solo si hay datos legacy) |
| 3 | `node scripts/debug_identity.js <telegramId>` |
| 4 | `npm run dev` y `curl .../api/telegram/bot/menu?telegramId=...` |
| 5 | `npm test` |

---

## Notas

- **MQTT** y **abrir portón** no están implementados aún.
- El bot responde `requiresAccountSelection: true` cuando hay varias cuentas; muestra: *"Tenés más de una cuenta, seleccioná una (pendiente)"*.
- Los mensajes de error 401/404/503 están diferenciados en el bot.
