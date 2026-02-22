const { prisma } = require("../../infrastructure/database/prismaClient");
const { isSuperadmin, requireAccountId } = require("../../shared/utils/scope");

function scope(usuarioToken) {
  if (isSuperadmin(usuarioToken)) return {};
  return { cuentaId: requireAccountId(usuarioToken) };
}

function findAllEventosPorton(usuarioToken, filtros = {}) {
  return prisma.eventoPorton.findMany({
    where: {
      ...scope(usuarioToken),
      ...(filtros.portonId ? { portonId: Number(filtros.portonId) } : {}),
      ...(filtros.grupoPortonesId ? { grupoPortonesId: Number(filtros.grupoPortonesId) } : {}),
      ...(filtros.canal ? { canal: String(filtros.canal) } : {}),
      ...(filtros.accion ? { accion: String(filtros.accion) } : {}),
    },
    include: {
      usuario: true,
      cuenta: true,
      porton: true,
      grupoPortones: true,
    },
    orderBy: { fechaHora: "desc" },
  });
}

function findEventoPortonById(id, usuarioToken) {
  return prisma.eventoPorton.findFirst({
    where: {
      id,
      ...scope(usuarioToken),
    },
    include: {
      usuario: true,
      cuenta: true,
      porton: true,
      grupoPortones: true,
    },
  });
}

function createEventoPorton(data) {
  return prisma.eventoPorton.create({ data });
}

function updateEventoPorton(id, data, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.eventoPorton.findFirst({
      where: { id, ...scope(usuarioToken) },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.eventoPorton.update({ where: { id }, data });
  });
}

function deleteEventoPorton(id, usuarioToken) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.eventoPorton.findFirst({
      where: { id, ...scope(usuarioToken) },
      select: { id: true },
    });
    if (!existente) return null;
    return tx.eventoPorton.delete({ where: { id } });
  });
}

module.exports = {
  findAllEventosPorton,
  findEventoPortonById,
  createEventoPorton,
  updateEventoPorton,
  deleteEventoPorton,
};
