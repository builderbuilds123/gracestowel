"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMedusaMikroOrmEventSubscriber = createMedusaMikroOrmEventSubscriber;
/**
 * Build a new mikro orm event subscriber for the given models
 * @param models
 * @returns
 */
function createMedusaMikroOrmEventSubscriber(keys, service) {
    var _MikroOrmEventSubscriber_context, _MikroOrmEventSubscriber_service, _a;
    const klass = (_a = class MikroOrmEventSubscriber {
            constructor(context) {
                _MikroOrmEventSubscriber_context.set(this, void 0);
                _MikroOrmEventSubscriber_service.set(this, service);
                __classPrivateFieldSet(this, _MikroOrmEventSubscriber_context, context, "f");
            }
            async afterCreate(args) {
                __classPrivateFieldGet(this, _MikroOrmEventSubscriber_service, "f").interceptEntityMutationEvents("afterCreate", args, __classPrivateFieldGet(this, _MikroOrmEventSubscriber_context, "f"));
            }
            async afterUpdate(args) {
                __classPrivateFieldGet(this, _MikroOrmEventSubscriber_service, "f").interceptEntityMutationEvents("afterUpdate", args, __classPrivateFieldGet(this, _MikroOrmEventSubscriber_context, "f"));
            }
            async afterUpsert(args) {
                __classPrivateFieldGet(this, _MikroOrmEventSubscriber_service, "f").interceptEntityMutationEvents("afterUpsert", args, __classPrivateFieldGet(this, _MikroOrmEventSubscriber_context, "f"));
            }
            async afterDelete(args) {
                __classPrivateFieldGet(this, _MikroOrmEventSubscriber_service, "f").interceptEntityMutationEvents("afterDelete", args, __classPrivateFieldGet(this, _MikroOrmEventSubscriber_context, "f"));
            }
        },
        _MikroOrmEventSubscriber_context = new WeakMap(),
        _MikroOrmEventSubscriber_service = new WeakMap(),
        _a);
    Object.defineProperty(klass, "name", {
        value: keys.join(","),
        writable: false,
    });
    return klass;
}
//# sourceMappingURL=create-medusa-mikro-orm-event-subscriber.js.map