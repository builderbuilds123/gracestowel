
import { defineLink } from "@medusajs/framework/utils"
import InventoryModule from "@medusajs/medusa/inventory"
import OrderModule from "@medusajs/medusa/order"

export default defineLink(
  {
    linkable: InventoryModule.linkable.reservationItem,
    field: "line_item_id"
  },
  OrderModule.linkable.orderLineItem
)
