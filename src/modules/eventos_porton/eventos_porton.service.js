const repository = require("./eventos_porton.repository");

function getEventosPorton(usuarioToken, filtros) {
  return repository.findAllEventosPorton(usuarioToken, filtros);
}

function getEventoPortonById(id, usuarioToken) {
  return repository.findEventoPortonById(id, usuarioToken);
}

function createEventoPorton(payload) {
  return repository.createEventoPorton(payload);
}

function updateEventoPorton(id, payload, usuarioToken) {
  return repository.updateEventoPorton(id, payload, usuarioToken);
}

function removeEventoPorton(id, usuarioToken) {
  return repository.deleteEventoPorton(id, usuarioToken);
}

module.exports = {
  getEventosPorton,
  getEventoPortonById,
  createEventoPorton,
  updateEventoPorton,
  removeEventoPorton,
};
