// src/lib/format-currency.ts
var formatCurrency = (amount, currency) => {
  return new Intl.NumberFormat(void 0, {
    style: "currency",
    currency,
    signDisplay: "auto"
  }).format(amount);
};

export {
  formatCurrency
};
