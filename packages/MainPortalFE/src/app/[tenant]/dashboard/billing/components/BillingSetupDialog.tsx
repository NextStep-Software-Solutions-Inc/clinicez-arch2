"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { z } from "zod"
import { toast } from "sonner"
import { BillingInfo, billingService } from "@/services/billing.service"

const billingSchema = z.object({
  phoneNumber: z.string().min(11, "Phone number must be at least 11 digits"),
  country: z.string().min(2, "Country is required"),
  streetLine1: z.string().trim().min(1, "Street Address is required"),
  streetLine2: z.string().optional(),
  city: z.string().trim().min(1, "City is required"),
  province: z.string().trim().min(1, "Province is required"),
  postalCode: z.string().trim().min(1, "Postal code is required"),
  tradingName: z.string().optional(),
  businessType: z.string().optional(),
  taxId: z.string().trim().min(1, "TIN / Tax ID is required")
})

interface BillingSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  selectedPlanId: string | null
  isAnnual: boolean
  billingInfo: BillingInfo | null
}

export default function BillingSetupDialog({
  open,
  onOpenChange,
  tenantId,
  selectedPlanId,
  isAnnual,
  billingInfo,
}: BillingSetupDialogProps) {
  const [formData, setFormData] = useState({
    phoneNumber: billingInfo?.phoneNumber || "",
    country: billingInfo?.country || "PH",
    streetLine1: billingInfo?.streetLine1 || "",
    streetLine2: billingInfo?.streetLine2 || "",
    city: billingInfo?.city || "",
    province: billingInfo?.province || "",
    postalCode: billingInfo?.postalCode || "",
    tradingName: billingInfo?.tradingName || "",
    businessType: billingInfo?.businessType || "SOLE_PROPRIETOR",
    taxId: billingInfo?.taxId || ""
  })

  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({})
  const [isSubmitLoading, setIsSubmitLoading] = useState(false)

  // Sync initial billingInfo once loaded
  useEffect(() => {
    if (billingInfo) {
      setFormData({
        phoneNumber: billingInfo.phoneNumber || "",
        country: billingInfo.country || "PH",
        streetLine1: billingInfo.streetLine1 || "",
        streetLine2: billingInfo.streetLine2 || "",
        city: billingInfo.city || "",
        province: billingInfo.province || "",
        postalCode: billingInfo.postalCode || "",
        tradingName: billingInfo.tradingName || "",
        businessType: billingInfo.businessType || "SOLE_PROPRIETOR",
        taxId: billingInfo.taxId || ""
      })
      setTouchedFields({})
    }
  }, [billingInfo])

  const validation = billingSchema.safeParse(formData)
  const isValid = validation.success
  const errors = !validation.success ? validation.error.flatten().fieldErrors : {}

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPlanId) return
    const normalizedPlanId = selectedPlanId === "professional" ? "pro" : selectedPlanId

    try {
      setIsSubmitLoading(true)
      const { url } = await billingService.createCheckoutSession({
        tenantId,
        planId: normalizedPlanId,
        isAnnual: isAnnual,
        phoneNumber: formData.phoneNumber || undefined,
        country: formData.country || undefined,
        streetLine1: formData.streetLine1 || undefined,
        streetLine2: formData.streetLine2 || undefined,
        city: formData.city || undefined,
        province: formData.province || undefined,
        postalCode: formData.postalCode || undefined,
        tradingName: formData.tradingName || undefined,
        businessType: formData.businessType || undefined,
        taxId: formData.taxId || undefined,
      })
      onOpenChange(false)
      window.location.href = url
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start checkout process. Please check your configuration."
      toast.error(message)
    } finally {
      setIsSubmitLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl h-[85vh] max-h-175 flex flex-col rounded-3xl p-0 border border-primary/20 bg-background shadow-2xl overflow-hidden">
        <div className="p-6 pb-4 border-b shrink-0 relative bg-background pr-12">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tight">Billing & Organization Setup</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Please enter your business registration and billing contact details below. This registers your organization for auto-debit billing.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubscribe} className="flex-1 flex flex-col min-h-0">
          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40">
            {/* Business Profile Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b pb-1.5">Business Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="tradingName" className="text-xs font-semibold text-foreground/80">Trading / Brand Name</Label>
                  <Input
                    id="tradingName"
                    value={formData.tradingName}
                    onChange={(e) => setFormData({ ...formData, tradingName: e.target.value })}
                    placeholder="e.g. ClinicEZ Manila Branch"
                    className="rounded-lg"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">If provided, this brand name will reflect on your invoices and receipts. Otherwise, the clinic name is used.</p>
                </div>

                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="businessType" className="text-xs font-semibold text-foreground/80">Business Entity Type</Label>
                  <Select
                    value={formData.businessType}
                    onValueChange={(val) => setFormData({ ...formData, businessType: val })}
                  >
                    <SelectTrigger className="rounded-lg">
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SOLE_PROPRIETOR">Sole Proprietor</SelectItem>
                      <SelectItem value="PARTNERSHIP">Partnership</SelectItem>
                      <SelectItem value="CORPORATION">Corporation</SelectItem>
                      <SelectItem value="GOVT">Government / Public Entity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="taxId" className="text-xs font-semibold text-foreground/80">
                    Tax ID / TIN <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="taxId"
                    required
                    value={formData.taxId}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    onBlur={() => setTouchedFields(prev => ({ ...prev, taxId: true }))}
                    placeholder="e.g. 123-456-789-000"
                    className={cn(
                      "rounded-lg",
                      touchedFields.taxId && errors.taxId && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {touchedFields.taxId && errors.taxId && (
                    <p className="text-[10px] text-destructive">{errors.taxId[0]}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Contact Details Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b pb-1.5">Billing Contact</h3>
              <div className="space-y-1.5">
                <Label htmlFor="phoneNumber" className="text-xs font-semibold text-foreground/80">
                  Mobile Phone Number (E.164) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  onBlur={() => setTouchedFields(prev => ({ ...prev, phoneNumber: true }))}
                  placeholder="e.g. +639123456789"
                  className={cn(
                    "rounded-lg",
                    touchedFields.phoneNumber && errors.phoneNumber && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                {touchedFields.phoneNumber && errors.phoneNumber && (
                  <p className="text-[10px] text-destructive">{errors.phoneNumber[0]}</p>
                )}
              </div>
            </div>

            {/* Physical Address Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b pb-1.5">Billing Address</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="country" className="text-xs font-semibold text-foreground/80">
                    Country <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.country}
                    onValueChange={(val) => {
                      setFormData({ ...formData, country: val })
                      setTouchedFields(prev => ({ ...prev, country: true }))
                    }}
                  >
                    <SelectTrigger className={cn(
                      "rounded-lg",
                      touchedFields.country && errors.country && "border-destructive focus-visible:ring-destructive"
                    )}>
                      <SelectValue placeholder="Select Country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PH">Philippines (PHP)</SelectItem>
                      <SelectItem value="ID">Indonesia (IDR)</SelectItem>
                      <SelectItem value="SG">Singapore (SGD)</SelectItem>
                    </SelectContent>
                  </Select>
                  {touchedFields.country && errors.country && (
                    <p className="text-[10px] text-destructive">{errors.country[0]}</p>
                  )}
                </div>

                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="streetLine1" className="text-xs font-semibold text-foreground/80">
                    Street Address Line 1 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="streetLine1"
                    required
                    value={formData.streetLine1}
                    onChange={(e) => setFormData({ ...formData, streetLine1: e.target.value })}
                    onBlur={() => setTouchedFields(prev => ({ ...prev, streetLine1: true }))}
                    placeholder="e.g. 123 Health Ave, Suite 4B"
                    className={cn(
                      "rounded-lg",
                      touchedFields.streetLine1 && errors.streetLine1 && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {touchedFields.streetLine1 && errors.streetLine1 && (
                    <p className="text-[10px] text-destructive">{errors.streetLine1[0]}</p>
                  )}
                </div>

                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="streetLine2" className="text-xs font-semibold text-foreground/80">Street Address Line 2 (Optional)</Label>
                  <Input
                    id="streetLine2"
                    value={formData.streetLine2}
                    onChange={(e) => setFormData({ ...formData, streetLine2: e.target.value })}
                    placeholder="e.g. Village/Subdivision"
                    className="rounded-lg"
                  />
                </div>

                <div className="space-y-1.5 col-span-1">
                  <Label htmlFor="city" className="text-xs font-semibold text-foreground/80">
                    City / Municipality <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="city"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    onBlur={() => setTouchedFields(prev => ({ ...prev, city: true }))}
                    placeholder="e.g. Pasig"
                    className={cn(
                      "rounded-lg",
                      touchedFields.city && errors.city && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {touchedFields.city && errors.city && (
                    <p className="text-[10px] text-destructive">{errors.city[0]}</p>
                  )}
                </div>

                <div className="space-y-1.5 col-span-1">
                  <Label htmlFor="province" className="text-xs font-semibold text-foreground/80">
                    Province / State <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="province"
                    required
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    onBlur={() => setTouchedFields(prev => ({ ...prev, province: true }))}
                    placeholder="e.g. Metro Manila"
                    className={cn(
                      "rounded-lg",
                      touchedFields.province && errors.province && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {touchedFields.province && errors.province && (
                    <p className="text-[10px] text-destructive">{errors.province[0]}</p>
                  )}
                </div>

                <div className="space-y-1.5 col-span-1">
                  <Label htmlFor="postalCode" className="text-xs font-semibold text-foreground/80">
                    Postal / Zip Code <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="postalCode"
                    required
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    onBlur={() => setTouchedFields(prev => ({ ...prev, postalCode: true }))}
                    placeholder="e.g. 1600"
                    className={cn(
                      "rounded-lg",
                      touchedFields.postalCode && errors.postalCode && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {touchedFields.postalCode && errors.postalCode && (
                    <p className="text-[10px] text-destructive">{errors.postalCode[0]}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="p-6 pt-4 border-t bg-background shrink-0">
            <DialogFooter className="gap-2 md:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-full px-6 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || isSubmitLoading}
                className="rounded-full px-6 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitLoading ? "Redirecting..." : "Proceed to Payment"}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
