// src/lib/common.ts
function pick(obj, keys) {
  const ret = {};
  keys.forEach((k) => {
    if (k in obj) {
      ret[k] = obj[k];
    }
  });
  return ret;
}
function toCamelCase(str) {
  return /^([a-zA-Z]+)(([A-Z]([a-z]+))+)$/.test(str) ? str : str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

export {
  pick,
  toCamelCase
};
