/**
 * Tests para identity.telegram.service
 * Ejecutar: node --test src/modules/identity/__tests__/identity.telegram.service.test.js
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");

const MEMBERSHIP_ROLES = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
};

describe("buildPortonGroupScopeForMembership", () => {
  const { buildPortonGroupScopeForMembership } = require("../identity.telegram.service");

  it("returns { id: -1 } for null membership", () => {
    const scope = buildPortonGroupScopeForMembership(null);
    assert.deepStrictEqual(scope, { id: -1 });
  });

  it("returns isActive/deletedAt for superadmin (sin accountId)", () => {
    const scope = buildPortonGroupScopeForMembership({ role: MEMBERSHIP_ROLES.SUPERADMIN });
    assert.deepStrictEqual(scope, { isActive: true, deletedAt: null });
  });

  it("returns accountId scope for admin", () => {
    const scope = buildPortonGroupScopeForMembership({
      role: MEMBERSHIP_ROLES.ADMIN,
      accountId: 5,
    });
    assert.deepStrictEqual(scope, {
      accountId: 5,
      isActive: true,
      deletedAt: null,
    });
  });

  it("returns group ids for operator with portonGroups only", () => {
    const scope = buildPortonGroupScopeForMembership({
      role: MEMBERSHIP_ROLES.OPERATOR,
      accountId: 5,
      portonGroups: [{ portonGroupId: 1 }, { portonGroupId: 2 }],
      gatePermissions: [],
    });
    assert.ok(scope.id);
    assert.deepStrictEqual(scope.id.in, [1, 2]);
    assert.strictEqual(scope.accountId, 5);
    assert.strictEqual(scope.isActive, true);
    assert.strictEqual(scope.deletedAt, null);
  });

  it("returns group ids for operator with gatePermissions only (gate.portonGroupId)", () => {
    const scope = buildPortonGroupScopeForMembership({
      role: MEMBERSHIP_ROLES.OPERATOR,
      accountId: 5,
      portonGroups: [],
      gatePermissions: [{ gate: { portonGroupId: 3 } }],
    });
    assert.deepStrictEqual(scope.id.in, [3]);
    assert.strictEqual(scope.accountId, 5);
  });

  it("returns union of group ids for operator with both", () => {
    const scope = buildPortonGroupScopeForMembership({
      role: MEMBERSHIP_ROLES.OPERATOR,
      accountId: 5,
      portonGroups: [{ portonGroupId: 1 }],
      gatePermissions: [{ gate: { portonGroupId: 2 } }],
    });
    assert.deepStrictEqual(scope.id.in.sort(), [1, 2]);
  });

  it("returns id:-1 for operator with no assignments", () => {
    const scope = buildPortonGroupScopeForMembership({
      role: MEMBERSHIP_ROLES.OPERATOR,
      accountId: 5,
      portonGroups: [],
      gatePermissions: [],
    });
    assert.strictEqual(scope.id, -1);
  });
});

describe("buildGateScopeForMembership", () => {
  const { buildGateScopeForMembership } = require("../identity.telegram.service");

  it("returns { id: -1 } for null membership", () => {
    const scope = buildGateScopeForMembership(null);
    assert.deepStrictEqual(scope, { id: -1 });
  });

  it("returns {} for superadmin", () => {
    const scope = buildGateScopeForMembership({ role: MEMBERSHIP_ROLES.SUPERADMIN });
    assert.deepStrictEqual(scope, {});
  });

  it("returns {} for admin", () => {
    const scope = buildGateScopeForMembership({
      role: MEMBERSHIP_ROLES.ADMIN,
      accountId: 5,
    });
    assert.deepStrictEqual(scope, {});
  });

  it("returns OR with gate ids for operator with gatePermissions only", () => {
    const scope = buildGateScopeForMembership({
      role: MEMBERSHIP_ROLES.OPERATOR,
      gatePermissions: [{ gateId: 10 }, { gateId: 20 }],
      portonGroups: [],
    });
    assert.ok(Array.isArray(scope.OR));
    assert.strictEqual(scope.OR.length, 1);
    assert.deepStrictEqual(scope.OR[0], { id: { in: [10, 20] } });
    assert.strictEqual(scope.isActive, true);
    assert.strictEqual(scope.deletedAt, null);
  });

  it("returns OR with group ids for operator with portonGroups only", () => {
    const scope = buildGateScopeForMembership({
      role: MEMBERSHIP_ROLES.OPERATOR,
      gatePermissions: [],
      portonGroups: [{ portonGroupId: 1 }, { portonGroupId: 2 }],
    });
    assert.ok(Array.isArray(scope.OR));
    assert.strictEqual(scope.OR.length, 1);
    assert.deepStrictEqual(scope.OR[0], { portonGroupId: { in: [1, 2] } });
  });

  it("returns OR with both gate and group for operator with both", () => {
    const scope = buildGateScopeForMembership({
      role: MEMBERSHIP_ROLES.OPERATOR,
      gatePermissions: [{ gateId: 10 }],
      portonGroups: [{ portonGroupId: 1 }],
    });
    assert.strictEqual(scope.OR.length, 2);
    const hasGate = scope.OR.some((o) => o.id && o.id.in && o.id.in.includes(10));
    const hasGroup = scope.OR.some((o) => o.portonGroupId && o.portonGroupId.in && o.portonGroupId.in.includes(1));
    assert.ok(hasGate && hasGroup);
  });

  it("returns id:-1 for operator with no assignments", () => {
    const scope = buildGateScopeForMembership({
      role: MEMBERSHIP_ROLES.OPERATOR,
      gatePermissions: [],
      portonGroups: [],
    });
    assert.strictEqual(scope.id, -1);
  });
});

describe("resolveIdentityFromTelegramId", { concurrency: 1 }, () => {
  const identityRepository = require("../identity.repository");

  it("returns null when credential not found (404-like)", async () => {
    identityRepository.findCredentialByTypeAndIdentifier = async () => null;
    const { resolveIdentityFromTelegramId } = require("../identity.telegram.service");
    const result = await resolveIdentityFromTelegramId("999999");
    assert.strictEqual(result, null);
  });

  it("returns null when credential is inactive", async () => {
    identityRepository.findCredentialByTypeAndIdentifier = async () => ({
      id: 1,
      identity: { id: "id1" },
      isActive: false,
    });
    const { resolveIdentityFromTelegramId } = require("../identity.telegram.service");
    const result = await resolveIdentityFromTelegramId("123");
    assert.strictEqual(result, null);
  });

  it("returns identity + memberships when credential found (ok)", async () => {
    const mockIdentity = { id: "id1", fullName: "Test User" };
    identityRepository.findCredentialByTypeAndIdentifier = async () => ({
      id: 1,
      identity: { ...mockIdentity, accountMemberships: [{ id: 1, status: "ACTIVE", accountId: 1 }] },
      isActive: true,
    });
    const { resolveIdentityFromTelegramId } = require("../identity.telegram.service");
    const result = await resolveIdentityFromTelegramId("123");
    assert.ok(result);
    assert.strictEqual(result.identity.id, "id1");
    assert.strictEqual(result.memberships.length, 1);
    assert.strictEqual(result.memberships[0].status, "ACTIVE");
  });
});

describe("isPortonesEnabledForMembership", () => {
  const { isPortonesEnabledForMembership } = require("../identity.telegram.service");

  it("returns false for null membership", async () => {
    const r = await isPortonesEnabledForMembership(null);
    assert.strictEqual(r, false);
  });

  it("operator with only portonGroups => true", async () => {
    const membership = {
      role: MEMBERSHIP_ROLES.OPERATOR,
      portonGroups: [{ portonGroupId: 1 }],
      gatePermissions: [],
    };
    const r = await isPortonesEnabledForMembership(membership);
    assert.strictEqual(r, true);
  });

  it("operator with only gatePermissions => true", async () => {
    const membership = {
      role: MEMBERSHIP_ROLES.OPERATOR,
      portonGroups: [],
      gatePermissions: [{ gateId: 1 }],
    };
    const r = await isPortonesEnabledForMembership(membership);
    assert.strictEqual(r, true);
  });

  it("operator with no assignments => false", async () => {
    const membership = {
      role: MEMBERSHIP_ROLES.OPERATOR,
      portonGroups: [],
      gatePermissions: [],
    };
    const r = await isPortonesEnabledForMembership(membership);
    assert.strictEqual(r, false);
  });
});
