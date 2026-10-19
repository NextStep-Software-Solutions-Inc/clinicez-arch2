import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import * as path from "path"

describe("Payment Gateway Ready Toggle & Proactive Offline Fallback", () => {
  const plansTabContentPath = path.resolve(__dirname, "../src/app/[tenant]/dashboard/billing/components/PlansTabContent.tsx")
  const billingSetupDialogPath = path.resolve(__dirname, "../src/app/[tenant]/dashboard/billing/components/BillingSetupDialog.tsx")
  const adminSettingsPagePath = path.resolve(__dirname, "../src/app/admin/settings/page.tsx")
  const billingServicePath = path.resolve(__dirname, "../src/services/billing.service.ts")

  test("PGR.1: BillingPaymentConfig interface declares isOnlinePaymentReady boolean property", () => {
    const file = fs.readFileSync(billingServicePath, "utf-8")
    expect(file).toContain("isOnlinePaymentReady?: boolean")
  })

  test("PGR.2: Super Admin Platform Settings includes Payment Gateway Ready switch toggle", () => {
    const file = fs.readFileSync(adminSettingsPagePath, "utf-8")
    expect(file).toContain("Payment Gateway Ready (Live Online Checkout)")
    expect(file).toContain(
      "Toggle whether tenants can checkout via Xendit credit card / e-wallet. When disabled, tenants are guided to manual bank transfers and GCash offline payment."
    )
    expect(file).toContain('handleChange("Billing:IsOnlinePaymentReady"')
    expect(file).toContain('role="switch"')
    expect(file).toContain('"Billing:IsOnlinePaymentReady": "false"')
  })

  test("PGR.3: PlansTabContent renders proactive alert banner when isOnlinePaymentReady is false", () => {
    const file = fs.readFileSync(plansTabContentPath, "utf-8")
    expect(file).toContain("!isOnlinePaymentReady")
    expect(file).toContain("Online Card &amp; E-Wallet Payments Coming Soon")
    expect(file).toContain(
      "Instant checkout is currently undergoing partner onboarding. You can activate your plan immediately via Bank Transfer or GCash in the Offline Payment tab."
    )
    expect(file).toContain("Offline Payment Instructions")
  })

  test("PGR.4: PlansTabContent intercepts plan selection clicks with friendly toast and offline tab redirection", () => {
    const file = fs.readFileSync(plansTabContentPath, "utf-8")
    expect(file).toContain(
      'toast.info("Online checkout is currently in review. Directing you to Bank Transfer & GCash instructions.")'
    )
    expect(file).toContain('onSwitchTab("offline")')
    expect(file).toContain('router.push(`${pathname}?tab=offline`)')
  })

  test("PGR.5: BillingSetupDialog prevents createCheckoutSession call when isOnlinePaymentReady is false", () => {
    const file = fs.readFileSync(billingSetupDialogPath, "utf-8")
    expect(file).toContain("isOnlinePaymentReady === false")
    expect(file).toContain(
      'toast.info("Online checkout is currently in review. Directing you to Bank Transfer & GCash instructions.")'
    )
    expect(file).toContain("onOpenChange(false)")
  })

  test("PGR.6: Strict design token compliance - zero raw hex colors in modified files", () => {
    const hexColorRegex = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g
    const filesToAudit = [
      plansTabContentPath,
      billingSetupDialogPath,
      billingServicePath,
    ]

    for (const filePath of filesToAudit) {
      const content = fs.readFileSync(filePath, "utf-8")
      const matches = content.match(hexColorRegex) || []
      expect(matches).toEqual([])
    }
  })
})
