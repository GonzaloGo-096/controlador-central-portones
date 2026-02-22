const repository = require("./portonGroups.repository");

function getPortonGroups() {
  return repository.findAllPortonGroups();
}

function getPortonGroupById(id) {
  return repository.findPortonGroupById(id);
}

function createPortonGroup(payload) {
  return repository.createPortonGroup(payload);
}

function updatePortonGroup(id, payload) {
  return repository.updatePortonGroup(id, payload);
}

function removePortonGroup(id) {
  return repository.deletePortonGroup(id);
}

module.exports = {
  getPortonGroups,
  getPortonGroupById,
  createPortonGroup,
  updatePortonGroup,
  removePortonGroup,
};
