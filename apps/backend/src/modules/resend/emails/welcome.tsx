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

interface Customer {
  id: string
  email: string
  first_name?: string
  last_name?: string
}

interface WelcomeEmailProps {
  customer: Customer
}

export const WelcomeEmailComponent = ({ customer }: WelcomeEmailProps) => {
  const firstName = customer.first_name || "there"
  const previewText = `Welcome to Grace Stowel, ${firstName}!`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Grace Stowel</Heading>
          <Text style={subheading}>Welcome to the Family</Text>
          
          <Hr style={hr} />
          
          <Text style={paragraph}>
            Hi {firstName},
          </Text>
          
          <Text style={paragraph}>
            Thank you for creating an account with Grace Stowel! We're thrilled to have you join our community of customers who appreciate premium quality towels.
          </Text>

          <Section style={benefitsSection}>
            <Text style={benefitsTitle}>As a member, you'll enjoy:</Text>
            <Text style={benefitItem}>✓ Faster checkout experience</Text>
            <Text style={benefitItem}>✓ Order history tracking</Text>
            <Text style={benefitItem}>✓ Exclusive member offers</Text>
            <Text style={benefitItem}>✓ Early access to new products</Text>
          </Section>

          <Section style={ctaSection}>
            <Button style={button} href="https://gracestowel.com/shop">
              Start Shopping
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
const benefitsSection = { backgroundColor: "#f9f9f9", padding: "20px", borderRadius: "8px", margin: "20px 0" }
const benefitsTitle = { color: "#1a1a1a", fontSize: "16px", fontWeight: "600", margin: "0 0 15px" }
const benefitItem = { color: "#333333", fontSize: "14px", margin: "0 0 8px", lineHeight: "20px" }
const ctaSection = { textAlign: "center" as const, margin: "30px 0" }
const button = { backgroundColor: "#1a1a1a", borderRadius: "6px", color: "#ffffff", fontSize: "16px", fontWeight: "600", textDecoration: "none", textAlign: "center" as const, display: "inline-block", padding: "12px 24px" }
const footer = { color: "#666666", fontSize: "14px", textAlign: "center" as const, marginTop: "30px" }
const footerSmall = { color: "#999999", fontSize: "12px", textAlign: "center" as const, margin: "10px 0 0" }

export const welcomeEmail = (props: unknown) => {
  return <WelcomeEmailComponent {...(props as WelcomeEmailProps)} />
}

