const { log } = require("./LoggerService");
const { getContext, run } = require("./requestContext");

module.exports = {
  logger: { log },
  getContext,
  run,
};
