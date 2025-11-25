"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAdjustmentTotal = calculateAdjustmentTotal;
const common_1 = require("../../common");
const big_number_1 = require("../big-number");
const math_1 = require("../math");
function calculateAdjustmentTotal({ item, adjustments, taxRate, }) {
    // the sum of all adjustment amounts excluding tax
    let adjustmentsSubtotal = math_1.MathBN.convert(0);
    // the sum of all adjustment amounts including tax
    let adjustmentsTotal = math_1.MathBN.convert(0);
    // the sum of all taxes on subtotals
    let adjustmentsTaxTotal = math_1.MathBN.convert(0);
    for (const adj of adjustments) {
        if (!(0, common_1.isDefined)(adj.amount)) {
            continue;
        }
        const adjustmentSubtotal = (0, common_1.isDefined)(taxRate) && adj.is_tax_inclusive
            ? math_1.MathBN.div(adj.amount, math_1.MathBN.add(1, taxRate))
            : adj.amount;
        const adjustmentTaxTotal = (0, common_1.isDefined)(taxRate)
            ? math_1.MathBN.mult(adjustmentSubtotal, taxRate)
            : 0;
        const adjustmentTotal = math_1.MathBN.add(adjustmentSubtotal, adjustmentTaxTotal);
        adjustmentsSubtotal = math_1.MathBN.add(adjustmentsSubtotal, adjustmentSubtotal);
        adjustmentsTaxTotal = math_1.MathBN.add(adjustmentsTaxTotal, adjustmentTaxTotal);
        adjustmentsTotal = math_1.MathBN.add(adjustmentsTotal, adjustmentTotal);
        adj["subtotal"] = new big_number_1.BigNumber(adjustmentsSubtotal);
        adj["total"] = new big_number_1.BigNumber(adjustmentsTotal);
    }
    const quantity = item?.quantity || math_1.MathBN.convert(1);
    let adjustmentPerItem = math_1.MathBN.convert(0);
    let adjustmentSubtotalPerItem = math_1.MathBN.convert(0);
    let adjustmentTaxTotalPerItem = math_1.MathBN.convert(0);
    if (!math_1.MathBN.eq(quantity, 0)) {
        adjustmentPerItem = math_1.MathBN.div(adjustmentsTotal, quantity);
        adjustmentSubtotalPerItem = math_1.MathBN.div(adjustmentsSubtotal, quantity);
        adjustmentTaxTotalPerItem = math_1.MathBN.div(adjustmentsTaxTotal, quantity);
    }
    return {
        adjustmentsTotal,
        adjustmentsSubtotal,
        adjustmentsTaxTotal,
        adjustmentPerItem,
        adjustmentSubtotalPerItem,
        adjustmentTaxTotalPerItem,
    };
}
//# sourceMappingURL=index.js.map