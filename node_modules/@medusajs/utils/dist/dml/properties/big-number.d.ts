import { BigNumber } from "../../totals/big-number";
import { BaseProperty } from "./base";
/**
 * The NumberProperty is used to define a numeric/integer
 * property
 */
export declare class BigNumberProperty extends BaseProperty<number> {
    protected dataType: {
        readonly name: "bigNumber";
    };
    static isBigNumberProperty(obj: any): obj is BigNumberProperty;
    default(value: number | string | BigNumber): this;
}
//# sourceMappingURL=big-number.d.ts.map