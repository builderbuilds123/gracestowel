"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _MessageAggregator_messagesHash, _MessageAggregator_messages;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageAggregator = void 0;
const build_event_messages_1 = require("./build-event-messages");
class MessageAggregator {
    constructor() {
        _MessageAggregator_messagesHash.set(this, new Set());
        _MessageAggregator_messages.set(this, []);
    }
    count() {
        return __classPrivateFieldGet(this, _MessageAggregator_messages, "f").length;
    }
    save(msg) {
        const messages = Array.isArray(msg) ? msg : [msg];
        if (messages.length === 0) {
            return;
        }
        for (const message of messages) {
            try {
                const hash = JSON.stringify(message);
                if (!__classPrivateFieldGet(this, _MessageAggregator_messagesHash, "f").has(hash)) {
                    __classPrivateFieldGet(this, _MessageAggregator_messagesHash, "f").add(hash);
                    __classPrivateFieldGet(this, _MessageAggregator_messages, "f").push(message);
                }
            }
            catch (e) {
                // noop: if the message is not serializable, we don't want to deduplicate it
                // It should not happen, but we don't want to fail the whole process
                __classPrivateFieldGet(this, _MessageAggregator_messages, "f").push(message);
            }
        }
    }
    saveRawMessageData(messageData, { options, sharedContext, } = {}) {
        const messages = Array.isArray(messageData) ? messageData : [messageData];
        const composedMessages = messages.map((message) => {
            return (0, build_event_messages_1.composeMessage)(message.eventName, {
                data: message.data,
                source: message.source,
                object: message.object,
                action: message.action,
                options,
                context: message.context ?? sharedContext,
            });
        });
        this.save(composedMessages);
    }
    getMessages(format = {}) {
        const { groupBy, sortBy } = format ?? {};
        if (sortBy) {
            __classPrivateFieldGet(this, _MessageAggregator_messages, "f").sort((a, b) => this.compareMessages(a, b, sortBy));
        }
        let messages = {
            default: [...__classPrivateFieldGet(this, _MessageAggregator_messages, "f")],
        };
        if (groupBy) {
            messages = __classPrivateFieldGet(this, _MessageAggregator_messages, "f").reduce((acc, msg) => {
                const key = groupBy
                    .map((field) => this.getValueFromPath(msg, field))
                    .join("-");
                if (!acc[key]) {
                    acc[key] = [];
                }
                acc[key].push(msg);
                return acc;
            }, {});
        }
        if (format.internal) {
            Object.values(messages).forEach((group) => {
                group.forEach((msg) => {
                    msg.options = msg.options ?? {};
                    msg.options.internal = format.internal;
                });
            });
        }
        return messages;
    }
    clearMessages() {
        // Ensure no references are left over in case something rely on messages
        __classPrivateFieldGet(this, _MessageAggregator_messages, "f").length = 0;
        __classPrivateFieldGet(this, _MessageAggregator_messagesHash, "f").clear();
    }
    getValueFromPath(obj, path) {
        const keys = path.split(".");
        return keys.reduce((acc, key) => {
            if (acc === undefined)
                return undefined;
            return acc[key];
        }, obj);
    }
    compareMessages(a, b, sortBy) {
        for (const key of Object.keys(sortBy)) {
            const orderCriteria = sortBy[key];
            const valueA = this.getValueFromPath(a, key);
            const valueB = this.getValueFromPath(b, key);
            // User defined order
            if (Array.isArray(orderCriteria)) {
                const indexA = orderCriteria.indexOf(valueA);
                const indexB = orderCriteria.indexOf(valueB);
                if (indexA === indexB) {
                    continue;
                }
                else if (indexA === -1) {
                    return 1;
                }
                else if (indexB === -1) {
                    return -1;
                }
                else {
                    return indexA - indexB;
                }
            }
            else {
                // Ascending or descending order
                let orderMultiplier = 1;
                if (orderCriteria === "desc" || orderCriteria === -1) {
                    orderMultiplier = -1;
                }
                if (valueA === valueB) {
                    continue;
                }
                else if (valueA < valueB) {
                    return -1 * orderMultiplier;
                }
                else {
                    return 1 * orderMultiplier;
                }
            }
        }
        return 0;
    }
}
exports.MessageAggregator = MessageAggregator;
_MessageAggregator_messagesHash = new WeakMap(), _MessageAggregator_messages = new WeakMap();
//# sourceMappingURL=message-aggregator.js.map