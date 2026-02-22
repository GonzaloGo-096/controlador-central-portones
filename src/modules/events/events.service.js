const repository = require("./events.repository");

function getEvents() {
  return repository.findAllEvents();
}

function getEventById(id) {
  return repository.findEventById(id);
}

function createEvent(payload) {
  return repository.createEvent(payload);
}

function updateEvent(id, payload) {
  return repository.updateEvent(id, payload);
}

function removeEvent(id) {
  return repository.deleteEvent(id);
}

module.exports = {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  removeEvent,
};
