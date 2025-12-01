import { HttpTypes } from "@medusajs/types";
import { Client } from "../client";
import { ClientHeaders } from "../types";
declare class Reservation {
    /**
     * @ignore
     */
    private client;
    /**
     * @ignore
     */
    constructor(client: Client);
    /**
     * This method retrieves a reservation by ID. It sends a request to the
     * [Get Reservation](https://docs.medusajs.com/api/admin#reservations_getreservationsid)
     * API route.
     *
     * @param id - The reservation's ID.
     * @param query - Configure the fields and relations to retrieve in the reservation.
     * @param headers - Headers to pass in the request.
     * @returns The reservation's details.
     *
     * @example
     * To retrieve a reservation by its ID:
     *
     * ```ts
     * sdk.admin.reservation.retrieve("res_123")
     * .then(({ reservation }) => {
     *   console.log(reservation)
     * })
     * ```
     *
     * To specify the fields and relations to retrieve:
     *
     * ```ts
     * sdk.admin.reservation.retrieve("res_123", {
     *   fields: "id,name"
     * })
     * .then(({ reservation }) => {
     *   console.log(reservation)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    retrieve(id: string, query?: HttpTypes.AdminReservationParams, headers?: ClientHeaders): Promise<HttpTypes.AdminReservationResponse>;
    /**
     * This method retrieves a list of reservations. It sends a request to the
     * [List Reservations](https://docs.medusajs.com/api/admin#reservations_getreservations)
     * API route.
     *
     * @param query - Filters and pagination configurations.
     * @param headers - Headers to pass in the request.
     * @returns The list of reservations.
     *
     * @example
     * To retrieve the list of reservations:
     *
     * ```ts
     * sdk.admin.reservation.list()
     * .then(({ reservations, count, limit, offset }) => {
     *   console.log(reservations)
     * })
     * ```
     *
     * To configure the pagination, pass the `limit` and `offset` query parameters.
     *
     * For example, to retrieve only 10 items and skip 10 items:
     *
     * ```ts
     * sdk.admin.reservation.list({
     *   limit: 10,
     *   offset: 10
     * })
     * .then(({ reservations, count, limit, offset }) => {
     *   console.log(reservations)
     * })
     * ```
     *
     * Using the `fields` query parameter, you can specify the fields and relations to retrieve
     * in each reservation:
     *
     * ```ts
     * sdk.admin.reservation.list({
     *   fields: "id,*inventory_item"
     * })
     * .then(({ reservations, count, limit, offset }) => {
     *   console.log(reservations)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    list(query?: HttpTypes.AdminGetReservationsParams, headers?: ClientHeaders): Promise<HttpTypes.AdminReservationListResponse>;
    /**
     * This method creates a reservation. It sends a request to the
     * [Create Reservation](https://docs.medusajs.com/api/admin#reservations_postreservations)
     * API route.
     *
     * @param body - The details of the reservation to create.
     * @param query - Configure the fields and relations to retrieve in the reservation.
     * @param headers - Headers to pass in the request.
     * @returns The reservation's details.
     *
     * @example
     * sdk.admin.reservation.create({
     *   inventory_item_id: "iitem_123",
     *   location_id: "sloc_123",
     *   quantity: 10,
     * })
     * .then(({ reservation }) => {
     *   console.log(reservation)
     * })
     */
    create(body: HttpTypes.AdminCreateReservation, query?: HttpTypes.AdminGetReservationsParams, headers?: ClientHeaders): Promise<HttpTypes.AdminReservationResponse>;
    /**
     * This method updates a reservation. It sends a request to the
     * [Update Reservation](https://docs.medusajs.com/api/admin#reservations_postreservationsid)
     * API route.
     *
     * @param id - The reservation's ID.
     * @param body - The details of the reservation to update.
     * @param query - Configure the fields and relations to retrieve in the reservation.
     * @param headers - Headers to pass in the request.
     * @returns The reservation's details.
     *
     * @example
     * sdk.admin.reservation.update("res_123", {
     *   quantity: 20,
     * })
     * .then(({ reservation }) => {
     *   console.log(reservation)
     * })
     */
    update(id: string, body: HttpTypes.AdminUpdateReservation, query?: HttpTypes.AdminGetReservationsParams, headers?: ClientHeaders): Promise<HttpTypes.AdminReservationResponse>;
    /**
     * This method deletes a reservation by ID. It sends a request to the
     * [Delete Reservation](https://docs.medusajs.com/api/admin#reservations_deletereservationsid)
     * API route.
     *
     * @param id - The reservation's ID.
     * @param headers - Headers to pass in the request.
     * @returns The deletion's details.
     *
     * @example
     * sdk.admin.reservation.delete("res_123")
     * .then(({ deleted }) => {
     *   console.log(deleted)
     * })
     */
    delete(id: string, headers?: ClientHeaders): Promise<HttpTypes.AdminReservationDeleteResponse>;
}
export default Reservation;
//# sourceMappingURL=reservation.d.ts.map