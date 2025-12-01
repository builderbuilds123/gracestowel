// src/lib/plugins.ts
var LOYALTY_PLUGIN_NAME = "@medusajs/loyalty-plugin";
var getLoyaltyPlugin = (plugins) => {
  return plugins?.find((plugin) => plugin.name === LOYALTY_PLUGIN_NAME);
};

export {
  getLoyaltyPlugin
};
