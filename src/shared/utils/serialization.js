function toJSONSafe(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, currentValue) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }
      return currentValue;
    })
  );
}

module.exports = {
  toJSONSafe,
};
