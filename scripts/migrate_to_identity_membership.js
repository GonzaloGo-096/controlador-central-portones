/**
 * Migración de datos: User/UserCredential/UserPortonGroup/UserGate → Identity/Credential/AccountMembership/scopes
 *
 * Ejecutar DESPUÉS de: npx prisma migrate deploy (o migrate dev) con la migración identity_membership
 * Ejecutar ANTES de: la migración drop_legacy_user_tables
 *
 * Uso: node scripts/migrate_to_identity_membership.js [--force]
 * --force: re-ejecutar aunque ya existan datos en identities (peligroso, puede duplicar)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");

const ROLE_MAP = {
  superadministrador: "SUPERADMIN",
  administrador_cuenta: "ADMIN",
  operador: "OPERATOR",
};

async function main() {
  const force = process.argv.includes("--force");
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no definida");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // Idempotencia: si ya hay credentials, no re-ejecutar
    const existingCreds = await prisma.$queryRaw`SELECT 1 FROM credentials LIMIT 1`;
    if (existingCreds.length > 0 && !force) {
      console.log("MIGRATION_SKIP=already_run");
      console.log("Ya existen datos en credentials. Usá --force para re-ejecutar (puede duplicar).");
      return;
    }

    if (force && existingCreds.length > 0) {
      console.warn("--force: limpiando tablas nuevas antes de migrar...");
      await prisma.membershipGatePermission.deleteMany();
      await prisma.membershipPortonGroup.deleteMany();
      await prisma.credential.deleteMany();
      await prisma.accountMembership.deleteMany();
      await prisma.identity.deleteMany();
      await prisma.$executeRawUnsafe(
        "UPDATE gate_events SET identity_id = NULL WHERE identity_id IS NOT NULL"
      );
      await prisma.$executeRawUnsafe(
        "UPDATE eventos_porton SET identity_id = NULL WHERE identity_id IS NOT NULL"
      );
    }

    const users = await prisma.$queryRawUnsafe(`
      SELECT id, account_id, full_name, role
      FROM users
      WHERE deleted_at IS NULL AND is_active = true
      ORDER BY id
    `);

    if (!users || users.length === 0) {
      console.log("MIGRATION_USERS=0");
      console.log("No hay usuarios activos para migrar.");
      return;
    }

    const userIdToIdentityId = new Map();
    let identitiesCreated = 0;
    let credentialsCreated = 0;
    let membershipsCreated = 0;
    let portonGroupsCreated = 0;
    let gatePermsCreated = 0;
    const orphans = { usersWithoutCredential: [], portonGroupsOrphan: 0, gatesOrphan: 0 };

    for (const user of users) {
      const userId = user.id;
      const accountId = user.account_id;
      const fullName = user.full_name;
      const legacyRole = String(user.role || "").toLowerCase();
      const membershipRole = ROLE_MAP[legacyRole] || "OPERATOR";

      const creds = await prisma.$queryRawUnsafe(
        `SELECT type, identifier, secret_hash, is_active FROM user_credentials WHERE user_id = $1`,
        userId
      );

      if (!creds || creds.length === 0) {
        orphans.usersWithoutCredential.push({ userId, fullName });
        continue;
      }

      const identityId = `identity_${randomUUID().replace(/-/g, "")}`;
      await prisma.identity.create({
        data: {
          id: identityId,
          fullName: fullName || null,
        },
      });
      identitiesCreated++;
      userIdToIdentityId.set(userId, identityId);

      const membership = await prisma.accountMembership.create({
        data: {
          identityId,
          accountId,
          role: membershipRole,
          status: "ACTIVE",
        },
      });
      membershipsCreated++;

      for (const c of creds) {
        if (!c.is_active) continue;
        await prisma.credential.create({
          data: {
            identityId,
            type: c.type,
            identifier: String(c.identifier),
            secretHash: c.secret_hash,
            isActive: true,
          },
        });
        credentialsCreated++;
      }

      const upg = await prisma.$queryRawUnsafe(
        `SELECT porton_group_id, role FROM user_porton_groups WHERE user_id = $1 AND is_active = true AND deleted_at IS NULL`,
        userId
      );
      for (const row of upg || []) {
        await prisma.membershipPortonGroup.create({
          data: {
            membershipId: membership.id,
            portonGroupId: row.porton_group_id,
            roleInGroup: String(row.role || "operator").toLowerCase() === "admin" ? "admin" : "operator",
          },
        });
        portonGroupsCreated++;
      }

      const ug = await prisma.$queryRawUnsafe(
        `SELECT gate_id, permission FROM user_gates WHERE user_id = $1 AND is_active = true AND deleted_at IS NULL`,
        userId
      );
      for (const row of ug || []) {
        await prisma.membershipGatePermission.create({
          data: {
            membershipId: membership.id,
            gateId: row.gate_id,
            permission: (row.permission || "open").toLowerCase(),
          },
        });
        gatePermsCreated++;
      }
    }

    for (const [userId, identityId] of userIdToIdentityId) {
      await prisma.$executeRawUnsafe(
        `UPDATE gate_events SET identity_id = $1 WHERE user_id = $2`,
        identityId,
        userId
      );
      await prisma.$executeRawUnsafe(
        `UPDATE eventos_porton SET identity_id = $1 WHERE usuario_id = $2`,
        identityId,
        userId
      );
    }

    const portonGroupsNoAccount = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as c FROM porton_groups pg
      WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = pg.account_id AND a.deleted_at IS NULL)
    `);
    const gatesNoGroup = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as c FROM gates g
      WHERE NOT EXISTS (SELECT 1 FROM porton_groups pg WHERE pg.id = g.porton_group_id AND pg.deleted_at IS NULL)
    `);

    console.log("MIGRATION_OK=true");
    console.log(
      "MIGRATION_COUNTS=" +
        JSON.stringify({
          usersProcessed: users.length,
          identitiesCreated,
          credentialsCreated,
          membershipsCreated,
          membershipPortonGroupsCreated: portonGroupsCreated,
          membershipGatePermissionsCreated: gatePermsCreated,
        })
    );
    if (orphans.usersWithoutCredential.length > 0) {
      console.log("MIGRATION_ORPHANS=" + JSON.stringify(orphans));
    }
    if (portonGroupsNoAccount[0]?.c > 0 || gatesNoGroup[0]?.c > 0) {
      console.log(
        "MIGRATION_WARNINGS=" +
          JSON.stringify({
            portonGroupsWithoutValidAccount: Number(portonGroupsNoAccount[0]?.c || 0),
            gatesWithoutValidGroup: Number(gatesNoGroup[0]?.c || 0),
          })
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("MIGRATION_OK=false");
  console.error("MIGRATION_ERROR=" + (err?.message || String(err)));
  if (err?.stack) console.error(err.stack);
  process.exitCode = 1;
});
