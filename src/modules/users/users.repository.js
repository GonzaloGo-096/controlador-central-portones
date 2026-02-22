const { prisma } = require("../../infrastructure/database/prismaClient");

async function findAllUsers() {
  return prisma.user.findMany({
    orderBy: { id: "asc" },
  });
}

async function findUserById(id) {
  return prisma.user.findUnique({
    where: { id },
  });
}

async function createUser(data) {
  return prisma.user.create({ data });
}

async function updateUser(id, data) {
  return prisma.user.update({
    where: { id },
    data,
  });
}

async function deleteUser(id) {
  return prisma.user.delete({
    where: { id },
  });
}

module.exports = {
  findAllUsers,
  findUserById,
  createUser,
  updateUser,
  deleteUser,
};
