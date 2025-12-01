import { AdjustmentLineDTO, BigNumberInput } from "@medusajs/types";
export declare function calculateAdjustmentTotal({ item, adjustments, taxRate, }: {
    item?: {
        quantity: BigNumberInput;
    };
    adjustments: Pick<AdjustmentLineDTO, "amount" | "is_tax_inclusive">[];
    taxRate?: BigNumberInput;
}): {
    adjustmentsTotal: globalThis.BigNumber;
    adjustmentsSubtotal: globalThis.BigNumber;
    adjustmentsTaxTotal: globalThis.BigNumber;
    adjustmentPerItem: globalThis.BigNumber;
    adjustmentSubtotalPerItem: globalThis.BigNumber;
    adjustmentTaxTotalPerItem: globalThis.BigNumber;
};
//# sourceMappingURL=index.d.ts.map