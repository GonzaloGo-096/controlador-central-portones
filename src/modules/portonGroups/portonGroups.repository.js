const { prisma } = require("../../infrastructure/database/prismaClient");

async function findAllPortonGroups() {
  return prisma.portonGroup.findMany({
    include: { account: true },
    orderBy: { id: "asc" },
  });
}

async function findPortonGroupById(id) {
  return prisma.portonGroup.findUnique({
    where: { id },
    include: { account: true },
  });
}

async function createPortonGroup(data) {
  return prisma.portonGroup.create({ data });
}

async function updatePortonGroup(id, data) {
  return prisma.portonGroup.update({
    where: { id },
    data,
  });
}

async function deletePortonGroup(id) {
  return prisma.portonGroup.delete({
    where: { id },
  });
}

module.exports = {
  findAllPortonGroups,
  findPortonGroupById,
  createPortonGroup,
  updatePortonGroup,
  deletePortonGroup,
};
