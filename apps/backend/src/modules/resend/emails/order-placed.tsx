import * as React from "react"
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Row,
  Column,
} from "@react-email/components"

interface OrderItem {
  title: string
  variant_title?: string
  quantity: number
  unit_price: number
}

interface ShippingAddress {
  first_name?: string
  last_name?: string
  address_1?: string
  address_2?: string
  city?: string
  province?: string
  postal_code?: string
  country_code?: string
}

interface Order {
  id: string
  display_id?: string
  email?: string
  items?: OrderItem[]
  shipping_address?: ShippingAddress
  total?: number
  subtotal?: number
  shipping_total?: number
  tax_total?: number
  currency_code?: string
}

interface OrderPlacedEmailProps {
  order: Order
}

const formatPrice = (amount: number, currency: string = "usd") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

export const OrderPlacedEmailComponent = ({ order }: OrderPlacedEmailProps) => {
  const previewText = `Thank you for your order #${order.display_id || order.id}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Grace Stowel</Heading>
          <Text style={subheading}>Order Confirmation</Text>
          
          <Hr style={hr} />
          
          <Text style={paragraph}>
            Thank you for your order! We're preparing your premium towels with care.
          </Text>
          
          <Section style={orderInfo}>
            <Text style={orderNumber}>Order #{order.display_id || order.id}</Text>
            {order.email && <Text style={emailText}>Confirmation sent to: {order.email}</Text>}
          </Section>

          <Hr style={hr} />

          <Heading as="h2" style={sectionHeading}>Order Details</Heading>
          
          {order.items?.map((item, index) => (
            <Row key={index} style={itemRow}>
              <Column style={itemDetails}>
                <Text style={itemTitle}>{item.title}</Text>
                {item.variant_title && (
                  <Text style={itemVariant}>{item.variant_title}</Text>
                )}
                <Text style={itemQuantity}>Qty: {item.quantity}</Text>
              </Column>
              <Column style={itemPrice}>
                <Text style={priceText}>
                  {formatPrice(item.unit_price * item.quantity, order.currency_code)}
                </Text>
              </Column>
            </Row>
          ))}

          <Hr style={hr} />

          <Section style={totalsSection}>
            {order.subtotal !== undefined && (
              <Row style={totalRow}>
                <Column><Text style={totalLabel}>Subtotal</Text></Column>
                <Column style={totalValue}><Text style={priceText}>{formatPrice(order.subtotal, order.currency_code)}</Text></Column>
              </Row>
            )}
            {order.shipping_total !== undefined && (
              <Row style={totalRow}>
                <Column><Text style={totalLabel}>Shipping</Text></Column>
                <Column style={totalValue}><Text style={priceText}>{formatPrice(order.shipping_total, order.currency_code)}</Text></Column>
              </Row>
            )}
            {order.tax_total !== undefined && order.tax_total > 0 && (
              <Row style={totalRow}>
                <Column><Text style={totalLabel}>Tax</Text></Column>
                <Column style={totalValue}><Text style={priceText}>{formatPrice(order.tax_total, order.currency_code)}</Text></Column>
              </Row>
            )}
            {order.total !== undefined && (
              <Row style={totalRow}>
                <Column><Text style={grandTotalLabel}>Total</Text></Column>
                <Column style={totalValue}><Text style={grandTotalValue}>{formatPrice(order.total, order.currency_code)}</Text></Column>
              </Row>
            )}
          </Section>

          {order.shipping_address && (
            <>
              <Hr style={hr} />
              <Heading as="h2" style={sectionHeading}>Shipping Address</Heading>
              <Text style={addressText}>
                {order.shipping_address.first_name} {order.shipping_address.last_name}<br />
                {order.shipping_address.address_1}<br />
                {order.shipping_address.address_2 && <>{order.shipping_address.address_2}<br /></>}
                {order.shipping_address.city}, {order.shipping_address.province} {order.shipping_address.postal_code}<br />
                {order.shipping_address.country_code?.toUpperCase()}
              </Text>
            </>
          )}

          <Hr style={hr} />

          <Text style={footer}>
            Questions? Contact us at hello@gracestowel.com
          </Text>
          <Text style={footerSmall}>
            © {new Date().getFullYear()} Grace Stowel. All rights reserved.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main = { backgroundColor: "#f6f9fc", fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif' }
const container = { backgroundColor: "#ffffff", margin: "0 auto", padding: "40px 20px", maxWidth: "600px" }
const heading = { color: "#1a1a1a", fontSize: "28px", fontWeight: "600", textAlign: "center" as const, margin: "0 0 10px" }
const subheading = { color: "#666666", fontSize: "16px", textAlign: "center" as const, margin: "0 0 30px" }
const hr = { borderColor: "#e6e6e6", margin: "20px 0" }
const paragraph = { color: "#333333", fontSize: "16px", lineHeight: "24px" }
const orderInfo = { backgroundColor: "#f9f9f9", padding: "20px", borderRadius: "8px", margin: "20px 0" }
const orderNumber = { color: "#1a1a1a", fontSize: "18px", fontWeight: "600", margin: "0 0 5px" }
const emailText = { color: "#666666", fontSize: "14px", margin: "0" }
const sectionHeading = { color: "#1a1a1a", fontSize: "18px", fontWeight: "600", margin: "20px 0 15px" }
const itemRow = { marginBottom: "15px" }
const itemDetails = { verticalAlign: "top" as const }
const itemTitle = { color: "#1a1a1a", fontSize: "16px", fontWeight: "500", margin: "0 0 4px" }
const itemVariant = { color: "#666666", fontSize: "14px", margin: "0 0 4px" }
const itemQuantity = { color: "#666666", fontSize: "14px", margin: "0" }
const itemPrice = { textAlign: "right" as const, verticalAlign: "top" as const }
const priceText = { color: "#1a1a1a", fontSize: "16px", margin: "0" }
const totalsSection = { marginTop: "20px" }
const totalRow = { marginBottom: "8px" }
const totalLabel = { color: "#666666", fontSize: "14px", margin: "0" }
const totalValue = { textAlign: "right" as const }
const grandTotalLabel = { color: "#1a1a1a", fontSize: "16px", fontWeight: "600", margin: "0" }
const grandTotalValue = { color: "#1a1a1a", fontSize: "18px", fontWeight: "600", margin: "0" }
const addressText = { color: "#333333", fontSize: "14px", lineHeight: "22px" }
const footer = { color: "#666666", fontSize: "14px", textAlign: "center" as const, marginTop: "30px" }
const footerSmall = { color: "#999999", fontSize: "12px", textAlign: "center" as const, margin: "10px 0 0" }

export const orderPlacedEmail = (props: unknown) => {
  return <OrderPlacedEmailComponent {...(props as OrderPlacedEmailProps)} />
}

