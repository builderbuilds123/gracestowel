import * as React from "react"
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Row,
  Column,
} from "@react-email/components"
import { formatModificationWindow } from "../../../lib/payment-capture-queue"

interface OrderItem {
  title: string
  variant_title?: string
  color?: string
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
  modification_token?: string
}

/**
 * Format price for display.
 * Medusa V2 stores prices in MAJOR currency units (e.g., $34.00 not 3400 cents).
 * No division by 100 needed.
 */
const formatPrice = (amount: number | undefined, currency: string = "cad") => {
  if (amount === undefined || amount === null) return "-"
  // Medusa V2 stores prices in CENTS (e.g. 3500 cents = $35.00)
  // But usage in template might expect raw amount.
  // Debugging confirmed database stores 3500 for $35.00.
  // We divide by 100 to display properly.
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

export const OrderPlacedEmailComponent = ({ order, modification_token }: OrderPlacedEmailProps) => {
  const previewText = `Order Confirmed! #${order.display_id || order.id.slice(-8).toUpperCase()}`
  const orderNumber = order.display_id || order.id.slice(-8).toUpperCase()
  const currency = order.currency_code || "cad"
  
  // Build modify order URL only if token is present and STOREFRONT_URL is configured
  let modifyOrderUrl: string | null = null
  if (modification_token) {
    const storeUrl = process.env.STOREFRONT_URL
    if (storeUrl) {
      modifyOrderUrl = `${storeUrl}/order/edit/${order.id}?token=${modification_token}`
    }
  }

  const hasItems = order.items && order.items.length > 0

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={headerSection}>
            <Heading style={brandName}>Grace Stowel</Heading>
            <Text style={tagline}>Premium Towels, Crafted with Care</Text>
          </Section>
          
          {/* Success Banner */}
          <Section style={successBanner}>
            <Text style={successIcon}>✓</Text>
            <Text style={successTitle}>Order Confirmed!</Text>
            <Text style={orderNumberText}>Order #{orderNumber}</Text>
          </Section>
          
          <Hr style={hr} />
          
          {/* Thank You Message */}
          <Text style={paragraph}>
            Hi{order.shipping_address?.first_name ? ` ${order.shipping_address.first_name}` : ''},
          </Text>
          <Text style={paragraph}>
            Thank you for your order! We've received your purchase and are preparing it with care. 
            You'll receive a shipping confirmation email once your order is on its way.
          </Text>

          {/* Modify Order CTA (for guests with token) */}
          {modifyOrderUrl && (
            <Section style={modifyOrderSection}>
              <Text style={modifyOrderText}>
                Need to make changes? You have <strong>{formatModificationWindow()}</strong> to modify your order.
              </Text>
              <Link href={modifyOrderUrl} style={modifyOrderButton}>
                Modify Order →
              </Link>
            </Section>
          )}

          <Hr style={hr} />
          
          {/* Order Details */}
          <Heading as="h2" style={sectionHeading}>Order Summary</Heading>
          
          {hasItems ? (
            <Section style={itemsSection}>
              {order.items!.map((item, index) => (
                <Row key={index} style={itemRow}>
                  <Column style={itemDetailsColumn}>
                    <Text style={itemTitle}>{item.title}</Text>
                    {(item.variant_title || item.color) && (
                      <Text style={itemVariant}>
                        {[item.variant_title, item.color].filter(Boolean).join(" • ")}
                      </Text>
                    )}
                    <Text style={itemQuantity}>Qty: {item.quantity}</Text>
                  </Column>
                  <Column style={itemPriceColumn}>
                    <Text style={itemPriceText}>
                      {formatPrice(item.unit_price * item.quantity, currency)}
                    </Text>
                  </Column>
                </Row>
              ))}
            </Section>
          ) : (
            <Text style={paragraph}>Your order items will be listed in the shipping confirmation.</Text>
          )}

          <Hr style={dividerLight} />

          {/* Totals */}
          <Section style={totalsSection}>
            {order.subtotal !== undefined && (
              <Row style={totalRow}>
                <Column><Text style={totalLabel}>Subtotal</Text></Column>
                <Column style={totalValueColumn}>
                  <Text style={totalValue}>{formatPrice(order.subtotal, currency)}</Text>
                </Column>
              </Row>
            )}
            {order.shipping_total !== undefined && (
              <Row style={totalRow}>
                <Column><Text style={totalLabel}>Shipping</Text></Column>
                <Column style={totalValueColumn}>
                  <Text style={totalValue}>
                    {order.shipping_total === 0 ? "Free" : formatPrice(order.shipping_total, currency)}
                  </Text>
                </Column>
              </Row>
            )}
            {order.tax_total !== undefined && order.tax_total > 0 && (
              <Row style={totalRow}>
                <Column><Text style={totalLabel}>Tax</Text></Column>
                <Column style={totalValueColumn}>
                  <Text style={totalValue}>{formatPrice(order.tax_total, currency)}</Text>
                </Column>
              </Row>
            )}
            <Hr style={dividerLight} />
            {order.total !== undefined && (
              <Row style={grandTotalRow}>
                <Column><Text style={grandTotalLabel}>Total</Text></Column>
                <Column style={totalValueColumn}>
                  <Text style={grandTotalValue}>{formatPrice(order.total, currency)}</Text>
                </Column>
              </Row>
            )}
          </Section>

          <Hr style={hr} />

          {/* Shipping Address */}
          {order.shipping_address && (
            <Section>
              <Heading as="h2" style={sectionHeading}>Shipping To</Heading>
              <Section style={addressBox}>
                <Text style={addressName}>
                  {order.shipping_address.first_name} {order.shipping_address.last_name}
                </Text>
                <Text style={addressLine}>{order.shipping_address.address_1}</Text>
                {order.shipping_address.address_2 && (
                  <Text style={addressLine}>{order.shipping_address.address_2}</Text>
                )}
                <Text style={addressLine}>
                  {order.shipping_address.city}{order.shipping_address.province ? `, ${order.shipping_address.province}` : ''} {order.shipping_address.postal_code}
                </Text>
                <Text style={addressLine}>
                  {order.shipping_address.country_code?.toUpperCase()}
                </Text>
              </Section>
            </Section>
          )}

          {/* Confirmation Email Notice */}
          {order.email && (
            <Section style={confirmationNotice}>
              <Text style={confirmationText}>
                A copy of this confirmation has been sent to <strong>{order.email}</strong>
              </Text>
            </Section>
          )}

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footerSection}>
            {!modification_token && (
              <Text style={footerText}>
                Log in to your account to view your order history and manage your preferences.
              </Text>
            )}
            <Text style={footerText}>
              Questions about your order? Reply to this email or contact us at{' '}
              <Link href="mailto:hello@gracestowel.com" style={footerLink}>
                hello@gracestowel.com
              </Link>
            </Text>
            <Text style={footerSmall}>
              © {new Date().getFullYear()} Grace Stowel. All rights reserved.
            </Text>
            <Text style={footerSmall}>
              Toronto, Canada
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main: React.CSSProperties = {
  backgroundColor: "#f4f4f4",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "40px auto",
  padding: "0",
  maxWidth: "600px",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
}

const headerSection: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  padding: "32px 40px",
  borderRadius: "8px 8px 0 0",
  textAlign: "center" as const,
}

const brandName: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: "600",
  letterSpacing: "2px",
  margin: "0 0 8px",
  textTransform: "uppercase" as const,
}

const tagline: React.CSSProperties = {
  color: "#a0a0a0",
  fontSize: "13px",
  letterSpacing: "1px",
  margin: "0",
}

const successBanner: React.CSSProperties = {
  backgroundColor: "#e8f5e9",
  padding: "24px 40px",
  textAlign: "center" as const,
}

const successIcon: React.CSSProperties = {
  color: "#2e7d32",
  fontSize: "32px",
  margin: "0 0 8px",
}

const successTitle: React.CSSProperties = {
  color: "#2e7d32",
  fontSize: "24px",
  fontWeight: "600",
  margin: "0 0 4px",
}

const orderNumberText: React.CSSProperties = {
  color: "#4a4a4a",
  fontSize: "14px",
  margin: "0",
}

const hr: React.CSSProperties = {
  borderColor: "#e0e0e0",
  margin: "0",
}

const dividerLight: React.CSSProperties = {
  borderColor: "#f0f0f0",
  margin: "16px 0",
}

const paragraph: React.CSSProperties = {
  color: "#333333",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
  padding: "0 40px",
}

const sectionHeading: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "16px",
  fontWeight: "600",
  margin: "24px 0 16px",
  padding: "0 40px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
}

const itemsSection: React.CSSProperties = {
  padding: "0 40px",
}

const itemRow: React.CSSProperties = {
  marginBottom: "16px",
}

const itemDetailsColumn: React.CSSProperties = {
  verticalAlign: "top" as const,
}

const itemTitle: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "15px",
  fontWeight: "500",
  margin: "0 0 2px",
}

const itemVariant: React.CSSProperties = {
  color: "#666666",
  fontSize: "13px",
  margin: "0 0 2px",
}

const itemQuantity: React.CSSProperties = {
  color: "#888888",
  fontSize: "13px",
  margin: "0",
}

const itemPriceColumn: React.CSSProperties = {
  textAlign: "right" as const,
  verticalAlign: "top" as const,
  width: "100px",
}

const itemPriceText: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "15px",
  fontWeight: "500",
  margin: "0",
}

const totalsSection: React.CSSProperties = {
  padding: "0 40px",
}

const totalRow: React.CSSProperties = {
  marginBottom: "8px",
}

const totalLabel: React.CSSProperties = {
  color: "#666666",
  fontSize: "14px",
  margin: "0",
}

const totalValueColumn: React.CSSProperties = {
  textAlign: "right" as const,
}

const totalValue: React.CSSProperties = {
  color: "#333333",
  fontSize: "14px",
  margin: "0",
}

const grandTotalRow: React.CSSProperties = {
  marginTop: "8px",
}

const grandTotalLabel: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0",
}

const grandTotalValue: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "18px",
  fontWeight: "600",
  margin: "0",
}

const addressBox: React.CSSProperties = {
  backgroundColor: "#fafafa",
  borderRadius: "6px",
  padding: "16px 20px",
  margin: "0 40px",
}

const addressName: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "15px",
  fontWeight: "500",
  margin: "0 0 4px",
}

const addressLine: React.CSSProperties = {
  color: "#666666",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0",
}

const confirmationNotice: React.CSSProperties = {
  backgroundColor: "#f8f9fa",
  padding: "16px 40px",
  margin: "24px 0 0",
}

const confirmationText: React.CSSProperties = {
  color: "#666666",
  fontSize: "13px",
  textAlign: "center" as const,
  margin: "0",
}

const modifyOrderSection: React.CSSProperties = {
  backgroundColor: "#fff8e1",
  border: "1px solid #ffe082",
  borderRadius: "6px",
  padding: "16px 24px",
  margin: "24px 40px",
  textAlign: "center" as const,
}

const modifyOrderText: React.CSSProperties = {
  color: "#5d4037",
  fontSize: "14px",
  margin: "0 0 12px",
}

const modifyOrderButton: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  color: "#ffffff",
  padding: "12px 28px",
  borderRadius: "4px",
  fontSize: "14px",
  fontWeight: "500",
  textDecoration: "none",
  display: "inline-block",
}

const footerSection: React.CSSProperties = {
  padding: "32px 40px",
  textAlign: "center" as const,
}

const footerText: React.CSSProperties = {
  color: "#666666",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 16px",
}

const footerLink: React.CSSProperties = {
  color: "#1a1a1a",
  textDecoration: "underline",
}

const footerSmall: React.CSSProperties = {
  color: "#999999",
  fontSize: "12px",
  margin: "4px 0 0",
}

export const orderPlacedEmail = (props: OrderPlacedEmailProps) => {
  return <OrderPlacedEmailComponent {...props} />
}
