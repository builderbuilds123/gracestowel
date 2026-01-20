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

interface PasswordResetEmailProps {
  first_name: string
  reset_url: string
  expires_in?: string
}

export const PasswordResetEmailComponent = ({ 
  first_name, 
  reset_url,
  expires_in = "1 hour" 
}: PasswordResetEmailProps) => {
  const firstName = first_name || "Customer"
  const previewText = `Reset your Grace Stowel account password`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Grace Stowel</Heading>
          <Text style={subheading}>Password Reset Request</Text>
          
          <Hr style={hr} />
          
          <Text style={paragraph}>
            Hi {firstName},
          </Text>
          
          <Text style={paragraph}>
            We received a request to reset the password for your Grace Stowel account. If you didn't make this request, you can safely ignore this email.
          </Text>

          <Section style={ctaSection}>
            <Button style={button} href={reset_url}>
              Reset My Password
            </Button>
          </Section>

          <Text style={paragraph}>
            This link will expire in <span style={bold}>{expires_in}</span>.
          </Text>

          <Text style={securityNotice}>
            For your security, if you didn't request a password reset, please contact our support team immediately.
          </Text>

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
const bold = { fontWeight: "bold" }
const securityNotice = { color: "#666666", fontSize: "14px", fontStyle: "italic" as const, margin: "20px 0" }
const ctaSection = { textAlign: "center" as const, margin: "30px 0" }
const button = { backgroundColor: "#1a1a1a", borderRadius: "6px", color: "#ffffff", fontSize: "16px", fontWeight: "600", textDecoration: "none", textAlign: "center" as const, display: "inline-block", padding: "12px 24px" }
const footer = { color: "#666666", fontSize: "14px", textAlign: "center" as const, marginTop: "30px" }
const footerSmall = { color: "#999999", fontSize: "12px", textAlign: "center" as const, margin: "10px 0 0" }

export const passwordResetEmail = (props: unknown) => {
  return <PasswordResetEmailComponent {...(props as PasswordResetEmailProps)} />
}
