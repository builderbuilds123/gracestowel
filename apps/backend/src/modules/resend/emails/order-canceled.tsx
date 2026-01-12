// @ts-nocheck - React types version mismatch with @react-email/components
import * as React from "react"
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Row,
  Column,
} from "@react-email/components"

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
  total?: number
  subtotal?: number
  shipping_total?: number
  tax_total?: number
  currency_code?: string
  canceled_at?: string
  shipping_address?: ShippingAddress
}

interface OrderCanceledEmailProps {
  order: Order
  reason?: string
  refund_amount?: number
  refund_status?: "voided" | "refunded" | "pending"
}

/**
 * Format price for display.
 * Medusa V2 stores prices in cents (e.g., 3500 cents = $35.00).
 */
const formatPrice = (amount: number | undefined, currency: string = "cad") => {
  if (amount === undefined || amount === null) return "-"
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

export const OrderCanceledEmailComponent = ({ order, reason, refund_amount, refund_status }: OrderCanceledEmailProps) => {
  const orderNumber = order.display_id || order.id.slice(-8).toUpperCase()
  const previewText = `Order #${orderNumber} has been canceled`
  const currency = order.currency_code || "cad"
  const hasItems = order.items && order.items.length > 0

  // Determine refund message based on status
  const getRefundMessage = () => {
    if (refund_status === "voided") {
      return "Your payment authorization has been voided and no charge was made to your card."
    }
    if (refund_status === "refunded") {
      return "Your refund has been processed. Please allow 5-10 business days for the funds to appear in your account."
    }
    return "If you were charged, a refund will be processed within 5-10 business days."
  }

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

          {/* Cancellation Banner */}
          <Section style={cancelBanner}>
            <Text style={cancelIcon}>✕</Text>
            <Text style={cancelTitle}>Order Canceled</Text>
            <Text style={orderNumberText}>Order #{orderNumber}</Text>
          </Section>

          <Hr style={hr} />

          {/* Message */}
          <Text style={paragraph}>
            Hi{order.shipping_address?.first_name ? ` ${order.shipping_address.first_name}` : ''},
          </Text>
          <Text style={paragraph}>
            Your order has been successfully canceled. We're sorry to see it go,
            but we hope to serve you again soon.
          </Text>

          {reason && (
            <Section style={reasonBox}>
              <Text style={reasonLabel}>Cancellation Reason</Text>
              <Text style={reasonText}>{reason}</Text>
            </Section>
          )}

          <Hr style={hr} />

          {/* Canceled Items */}
          {hasItems && (
            <>
              <Heading as="h2" style={sectionHeading}>Canceled Items</Heading>
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
              <Hr style={dividerLight} />
            </>
          )}

          {/* Order Totals */}
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
          </Section>

          <Hr style={hr} />

          {/* Refund Section */}
          <Section style={refundSection}>
            <Text style={refundTitle}>Refund Amount</Text>
            <Text style={refundAmount}>
              {formatPrice(refund_amount !== undefined ? refund_amount : order.total, currency)}
            </Text>
            <Text style={refundNote}>{getRefundMessage()}</Text>
          </Section>

          <Hr style={hr} />

          {/* CTA Section */}
          <Section style={ctaSection}>
            <Text style={ctaText}>
              Changed your mind? We'd love to have you back!
            </Text>
            <Link href="https://gracestowel.com/towels" style={ctaButton}>
              Continue Shopping
            </Link>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footerSection}>
            <Text style={footerText}>
              Questions about your cancellation? Reply to this email or contact us at{' '}
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

// Styles - Matching order-placed.tsx for consistency
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

const cancelBanner: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  padding: "24px 40px",
  textAlign: "center" as const,
}

const cancelIcon: React.CSSProperties = {
  color: "#dc2626",
  fontSize: "32px",
  margin: "0 0 8px",
}

const cancelTitle: React.CSSProperties = {
  color: "#dc2626",
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

const reasonBox: React.CSSProperties = {
  backgroundColor: "#fafafa",
  borderRadius: "6px",
  padding: "16px 20px",
  margin: "0 40px 16px",
}

const reasonLabel: React.CSSProperties = {
  color: "#666666",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 4px",
}

const reasonText: React.CSSProperties = {
  color: "#333333",
  fontSize: "14px",
  fontStyle: "italic" as const,
  margin: "0",
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

const refundSection: React.CSSProperties = {
  backgroundColor: "#ecfdf5",
  padding: "24px 40px",
  textAlign: "center" as const,
  margin: "0",
}

const refundTitle: React.CSSProperties = {
  color: "#059669",
  fontSize: "14px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 8px",
}

const refundAmount: React.CSSProperties = {
  color: "#059669",
  fontSize: "28px",
  fontWeight: "600",
  margin: "0 0 12px",
}

const refundNote: React.CSSProperties = {
  color: "#047857",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0",
}

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  padding: "24px 40px",
}

const ctaText: React.CSSProperties = {
  color: "#666666",
  fontSize: "15px",
  margin: "0 0 16px",
}

const ctaButton: React.CSSProperties = {
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

export const orderCanceledEmail = (props: unknown) => {
  return <OrderCanceledEmailComponent {...(props as OrderCanceledEmailProps)} />
}

