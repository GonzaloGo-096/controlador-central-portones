const { prisma } = require("../../infrastructure/database/prismaClient");

async function findAllEvents() {
  return prisma.gateEvent.findMany({
    include: { user: true, gate: true },
    orderBy: { id: "desc" },
  });
}

async function findEventById(id) {
  return prisma.gateEvent.findUnique({
    where: { id },
    include: { user: true, gate: true },
  });
}

async function createEvent(data) {
  return prisma.gateEvent.create({ data });
}

async function updateEvent(id, data) {
  return prisma.gateEvent.update({
    where: { id },
    data,
  });
}

async function deleteEvent(id) {
  return prisma.gateEvent.delete({
    where: { id },
  });
}

module.exports = {
  findAllEvents,
  findEventById,
  createEvent,
  updateEvent,
  deleteEvent,
};
