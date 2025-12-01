// src/lib/orders.ts
var getPaymentsFromOrder = (order) => {
  return order.payment_collections.map((collection) => collection.payments).flat(1).filter(Boolean);
};
function getReservationsLimitCount(order) {
  if (!order?.items?.length) {
    return 0;
  }
  return order.items.reduce(
    (acc, item) => acc + (item.variant?.inventory_items?.length || 1),
    0
  );
}

export {
  getPaymentsFromOrder,
  getReservationsLimitCount
};
