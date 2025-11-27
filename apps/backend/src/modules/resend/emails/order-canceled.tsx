// @ts-nocheck - React types version mismatch with @react-email/components
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
  Button,
} from "@react-email/components"

interface OrderItem {
  title: string
  variant_title?: string
  quantity: number
  unit_price: number
}

interface Order {
  id: string
  display_id?: string
  email?: string
  items?: OrderItem[]
  total?: number
  currency_code?: string
  canceled_at?: string
}

interface OrderCanceledEmailProps {
  order: Order
  reason?: string
}

const formatPrice = (amount: number, currency: string = "usd") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

export const OrderCanceledEmailComponent = ({ order, reason }: OrderCanceledEmailProps) => {
  const previewText = `Your order #${order.display_id || order.id} has been canceled`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Grace Stowel</Heading>
          <Text style={subheading}>Order Canceled</Text>
          
          <Hr style={hr} />
          
          <Text style={paragraph}>
            We're sorry to see your order go. Your order has been successfully canceled.
          </Text>
          
          <Section style={orderInfo}>
            <Text style={orderNumber}>Order #{order.display_id || order.id}</Text>
            {order.email && <Text style={emailText}>Order email: {order.email}</Text>}
            {reason && <Text style={reasonText}>Reason: {reason}</Text>}
          </Section>

          {order.items && order.items.length > 0 && (
            <>
              <Hr style={hr} />
              <Heading as="h2" style={sectionHeading}>Canceled Items</Heading>
              {order.items.map((item, index) => (
                <Section key={index} style={itemRow}>
                  <Text style={itemTitle}>{item.title}</Text>
                  {item.variant_title && <Text style={itemVariant}>{item.variant_title}</Text>}
                  <Text style={itemQuantity}>Qty: {item.quantity}</Text>
                </Section>
              ))}
            </>
          )}

          {order.total !== undefined && (
            <>
              <Hr style={hr} />
              <Section style={refundSection}>
                <Text style={refundTitle}>Refund Amount</Text>
                <Text style={refundAmount}>{formatPrice(order.total, order.currency_code)}</Text>
                <Text style={refundNote}>
                  If you were charged, a refund will be processed within 5-10 business days.
                </Text>
              </Section>
            </>
          )}

          <Hr style={hr} />

          <Section style={ctaSection}>
            <Text style={paragraph}>
              Changed your mind? We'd love to have you back!
            </Text>
            <Button style={button} href="https://gracestowel.com/shop">
              Continue Shopping
            </Button>
          </Section>

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
const orderInfo = { backgroundColor: "#fff3f3", padding: "20px", borderRadius: "8px", margin: "20px 0", border: "1px solid #ffdddd" }
const orderNumber = { color: "#1a1a1a", fontSize: "18px", fontWeight: "600", margin: "0 0 5px" }
const emailText = { color: "#666666", fontSize: "14px", margin: "5px 0 0" }
const reasonText = { color: "#666666", fontSize: "14px", margin: "5px 0 0", fontStyle: "italic" as const }
const sectionHeading = { color: "#1a1a1a", fontSize: "18px", fontWeight: "600", margin: "20px 0 15px" }
const itemRow = { marginBottom: "15px" }
const itemTitle = { color: "#1a1a1a", fontSize: "16px", fontWeight: "500", margin: "0 0 4px" }
const itemVariant = { color: "#666666", fontSize: "14px", margin: "0 0 4px" }
const itemQuantity = { color: "#666666", fontSize: "14px", margin: "0" }
const refundSection = { backgroundColor: "#f9f9f9", padding: "20px", borderRadius: "8px", textAlign: "center" as const }
const refundTitle = { color: "#666666", fontSize: "14px", margin: "0 0 5px" }
const refundAmount = { color: "#1a1a1a", fontSize: "24px", fontWeight: "600", margin: "0 0 10px" }
const refundNote = { color: "#666666", fontSize: "12px", margin: "0" }
const ctaSection = { textAlign: "center" as const, margin: "20px 0" }
const button = { backgroundColor: "#1a1a1a", borderRadius: "6px", color: "#ffffff", fontSize: "16px", fontWeight: "600", textDecoration: "none", textAlign: "center" as const, display: "inline-block", padding: "12px 24px" }
const footer = { color: "#666666", fontSize: "14px", textAlign: "center" as const, marginTop: "30px" }
const footerSmall = { color: "#999999", fontSize: "12px", textAlign: "center" as const, margin: "10px 0 0" }

export const orderCanceledEmail = (props: unknown) => {
  return <OrderCanceledEmailComponent {...(props as OrderCanceledEmailProps)} />
}

