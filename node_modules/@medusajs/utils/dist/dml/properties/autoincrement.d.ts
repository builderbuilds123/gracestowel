import { BaseProperty } from "./base";
import { PrimaryKeyModifier } from "./primary-key";
/**
 * The AutoIncrementProperty is used to define a serial
 * property
 */
export declare class AutoIncrementProperty extends BaseProperty<number> {
    protected dataType: {
        name: "serial";
        options: {
            searchable?: boolean;
            primaryKey?: boolean;
        };
    };
    /**
     * This method indicates that the property is the data model's primary key.
     *
     * @example
     * import { model } from "@medusajs/framework/utils"
     *
     * const Product = model.define("Product", {
     *   id: model.autoincrement().primaryKey(),
     *   // ...
     * })
     *
     * export default Product
     *
     * @customNamespace Property Configuration Methods
     */
    primaryKey(): PrimaryKeyModifier<number, AutoIncrementProperty>;
    /**
     * This method indicates that a serial property is searchable.
     *
     * @example
     * import { model } from "@medusajs/framework/utils"
     *
     * const MyCustom = model.define("my_custom", {
     *   name: model.autoincrement().searchable(),
     *   // ...
     * })
     *
     * export default MyCustom
     *
     * @customNamespace Property Configuration Methods
     */
    searchable(): this;
    constructor(options?: {
        primaryKey?: boolean;
    });
}
//# sourceMappingURL=autoincrement.d.ts.map