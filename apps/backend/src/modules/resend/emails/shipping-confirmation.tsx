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
  Link,
} from "@react-email/components"

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

interface Fulfillment {
  id: string
  tracking_numbers?: string[]
  tracking_links?: { url: string }[]
}

interface Order {
  id: string
  display_id?: string
  email?: string
  shipping_address?: ShippingAddress
}

interface ShippingConfirmationEmailProps {
  order: Order
  fulfillment: Fulfillment
}

export const ShippingConfirmationEmailComponent = ({ order, fulfillment }: ShippingConfirmationEmailProps) => {
  const previewText = `Your order #${order.display_id || order.id} has shipped!`
  const trackingNumber = fulfillment.tracking_numbers?.[0]
  const trackingLink = fulfillment.tracking_links?.[0]?.url

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Grace Stowel</Heading>
          <Text style={subheading}>Your Order Has Shipped! 📦</Text>
          
          <Hr style={hr} />
          
          <Text style={paragraph}>
            Great news! Your order is on its way to you.
          </Text>
          
          <Section style={orderInfo}>
            <Text style={orderNumber}>Order #{order.display_id || order.id}</Text>
            {trackingNumber && (
              <Text style={trackingText}>Tracking Number: {trackingNumber}</Text>
            )}
          </Section>

          {trackingLink && (
            <Section style={ctaSection}>
              <Button style={button} href={trackingLink}>
                Track Your Package
              </Button>
            </Section>
          )}

          {order.shipping_address && (
            <>
              <Hr style={hr} />
              <Heading as="h2" style={sectionHeading}>Shipping To</Heading>
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

          <Text style={paragraph}>
            Your premium towels have been carefully packaged and are headed your way. 
            You should receive them within 3-7 business days.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            Questions about your delivery? Contact us at hello@gracestowel.com
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
const trackingText = { color: "#666666", fontSize: "14px", margin: "5px 0 0" }
const sectionHeading = { color: "#1a1a1a", fontSize: "18px", fontWeight: "600", margin: "20px 0 15px" }
const addressText = { color: "#333333", fontSize: "14px", lineHeight: "22px" }
const ctaSection = { textAlign: "center" as const, margin: "20px 0" }
const button = { backgroundColor: "#1a1a1a", borderRadius: "6px", color: "#ffffff", fontSize: "16px", fontWeight: "600", textDecoration: "none", textAlign: "center" as const, display: "inline-block", padding: "12px 24px" }
const footer = { color: "#666666", fontSize: "14px", textAlign: "center" as const, marginTop: "30px" }
const footerSmall = { color: "#999999", fontSize: "12px", textAlign: "center" as const, margin: "10px 0 0" }

export const shippingConfirmationEmail = (props: unknown) => {
  return <ShippingConfirmationEmailComponent {...(props as ShippingConfirmationEmailProps)} />
}

