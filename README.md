# Controlador central de portones

Controlador basado en MQTT, Express y modelo multi-tenant (Identity + AccountMembership).

## Migración Identity + Membership

Para migrar al nuevo esquema y ejecutar la aplicación, seguí la guía:

**[Guía de migración →](docs/MIGRACION_IDENTITY_MEMBERSHIP.md)**

### Comandos rápidos

```bash
npx prisma migrate deploy
node scripts/migrate_to_identity_membership.js   # si hay datos legacy
node scripts/debug_identity.js <telegramId>
npm test
npm run dev
```
