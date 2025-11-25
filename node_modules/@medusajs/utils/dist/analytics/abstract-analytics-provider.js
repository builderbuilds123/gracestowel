"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractAnalyticsProviderService = void 0;
/**
 * ### constructor
 *
 * The constructor allows you to access resources from the module's container using the first parameter,
 * and the module's options using the second parameter.
 *
 * If you're creating a client or establishing a connection with a third-party service, do it in the constructor.
 *
 * #### Example
 *
 * ```ts
 * import { Logger } from "@medusajs/framework/types"
 * import { AbstractAnalyticsProviderService } from "@medusajs/framework/utils"
 *
 * type InjectedDependencies = {
 *   logger: Logger
 * }
 *
 * type Options = {
 *   apiKey: string
 * }
 *
 * class MyAnalyticsProviderService extends AbstractAnalyticsProviderService {
 *   protected logger_: Logger
 *   protected options_: Options
 *   static identifier = "my-analytics"
 *   // assuming you're initializing a client
 *   protected client
 *
 *   constructor (
 *     { logger }: InjectedDependencies,
 *     options: Options
 *   ) {
 *     super()
 *
 *     this.logger_ = logger
 *     this.options_ = options
 *
 *     // assuming you're initializing a client
 *     this.client = new Client(options)
 *   }
 * }
 *
 * export default MyAnalyticsProviderService
 * ```
 */
class AbstractAnalyticsProviderService {
    /**
     * @ignore
     */
    getIdentifier() {
        return this.constructor.identifier;
    }
    /**
     * This method tracks an event with the third-party analytics provider. The Analytics Module
     * will use this method in its `track` method if your provider is configured in `medusa-config.ts`.
     *
     * You can send the event to the third-party provider based on its semantics.
     *
     * @param {ProviderTrackAnalyticsEventDTO} data - The event's details.
     * @returns {Promise<void>} Resolves when the event is tracked successfully.
     *
     * @example
     * class MyAnalyticsProviderService extends AbstractAnalyticsProviderService {
     *   // ...
     *   async track(
     *     data: ProviderTrackAnalyticsEventDTO
     *   ): Promise<void> {
     *     // track event to third-party provider
     *     // or using custom logic
     *     // for example:
     *     this.client.track(data)
     *   }
     * }
     */
    async track(data) {
        throw Error("track must be overridden by the child class");
    }
    /**
     * This method identifies an actor or group in the third-party analytics provider. The Analytics Module
     * will use this method in its `identify` method if your provider is configured in `medusa-config.ts`.
     *
     * @param {ProviderIdentifyAnalyticsEventDTO} data - The details of the actor or group.
     * @returns {Promise<void>} Resolves when the actor or group is identified successfully.
     *
     * @example
     * class MyAnalyticsProviderService extends AbstractAnalyticsProviderService {
     *   // ...
     *   async identify(
     *     data: ProviderIdentifyAnalyticsEventDTO
     *   ): Promise<void> {
     *     // identify actor or group in the analytics provider
     *     // or using custom logic
     *     // for example:
     *     this.client.identify(data)
     *   }
     * }
     */
    async identify(data) {
        throw Error("identify must be overridden by the child class");
    }
}
exports.AbstractAnalyticsProviderService = AbstractAnalyticsProviderService;
//# sourceMappingURL=abstract-analytics-provider.js.map