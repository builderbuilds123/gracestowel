type InputPrimitive = string | Symbol;
type InputObject = object & {
    __type?: string | Symbol;
    output?: any;
};
export declare function resolveValue(input: InputPrimitive | InputObject | unknown | undefined, transactionContext: any): Promise<any> | any;
export {};
//# sourceMappingURL=resolve-value.d.ts.map