"use client"

import React, { useState, useEffect } from "react"
import { useBillingInfo } from "@/hooks/useBilling"
import { billingService } from "@/services/billing.service"
import { toast } from "sonner"
import { z } from "zod"
import OrganizationDetailsForm from "./OrganizationDetailsForm"

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

interface OrganizationDetailsContentProps {
  tenantId: string
}

export default function OrganizationDetailsContent({ tenantId }: OrganizationDetailsContentProps) {
  const { billingInfo, mutate } = useBillingInfo(tenantId)
  const [isUpdatingInfo, setIsUpdatingInfo] = useState(false)

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

  const handleUpdateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsUpdatingInfo(true)
      await billingService.updateBillingInfo({
        tenantId,
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
      toast.success("Organization profile updated successfully.")
      mutate()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update organization profile."
      toast.error(message)
    } finally {
      setIsUpdatingInfo(false)
    }
  }

  return (
    <OrganizationDetailsForm
      billingInfo={billingInfo || null}
      formData={formData}
      setFormData={setFormData}
      touchedFields={touchedFields}
      setTouchedFields={setTouchedFields}
      errors={errors}
      isValid={isValid}
      isUpdatingInfo={isUpdatingInfo}
      onSubmit={handleUpdateOrganization}
    />
  )
}
