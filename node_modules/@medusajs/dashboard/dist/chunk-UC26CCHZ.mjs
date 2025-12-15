// src/lib/shipping-options.ts
function isReturnOption(shippingOption) {
  return !!shippingOption.rules?.find(
    (r) => r.attribute === "is_return" && r.value === "true" && r.operator === "eq"
  );
}
function isOptionEnabledInStore(shippingOption) {
  return !!shippingOption.rules?.find(
    (r) => r.attribute === "enabled_in_store" && r.value === "true" && r.operator === "eq"
  );
}
function getFormattedShippingOptionLocationName(shippingOption) {
  const location = shippingOption.service_zone.fulfillment_set.location;
  if (!location) {
    return "N/A";
  }
  if (location.name) {
    return `${location.name}`;
  }
  let name = "";
  if (location.address) {
    if (location.address.address_1) {
      name += `${location.address.address_1}`;
    }
    if (location.address.address_2) {
      name += `${location.address.address_2}`;
    }
    if (location.address.city) {
      name += `${location.address.city}`;
    }
    if (location.address.postal_code) {
      name += `${location.address.postal_code}`;
    }
    if (location.address.country_code) {
      name += `, ${location.address.country_code}`;
    }
  }
  return name || "N/A";
}

export {
  isReturnOption,
  isOptionEnabledInStore,
  getFormattedShippingOptionLocationName
};
