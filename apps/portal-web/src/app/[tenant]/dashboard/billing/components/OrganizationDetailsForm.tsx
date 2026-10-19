import React from "react"
import { Button } from "@/components/ui/button"
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
import { Building2 } from "lucide-react"
import { BillingInfo } from "@/services/billing.service"

interface OrganizationDetailsFormProps {
  billingInfo: BillingInfo | null
  formData: any
  setFormData: React.Dispatch<React.SetStateAction<any>>
  touchedFields: any
  setTouchedFields: React.Dispatch<React.SetStateAction<any>>
  errors: any
  isValid: boolean
  isUpdatingInfo: boolean
  onSubmit: (e: React.FormEvent) => void
}

export default function OrganizationDetailsForm({
  billingInfo,
  formData,
  setFormData,
  touchedFields,
  setTouchedFields,
  errors,
  isValid,
  isUpdatingInfo,
  onSubmit,
}: OrganizationDetailsFormProps) {
  return (
    <div className="grid md:grid-cols-3 gap-8">
      {/* Overview / Card details */}
      <div className="rounded-3xl border border-border bg-card p-8 shadow-sm h-fit space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight">Tenant Profile</h3>
            <p className="text-xs text-muted-foreground">Registration metadata stored on database</p>
          </div>
        </div>

        <div className="space-y-4 text-sm border-t pt-4">
          <div>
            <span className="block text-xs text-muted-foreground">Tenant Name</span>
            <span className="font-semibold">{billingInfo?.clinicName || "Tenant Provider"}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Trading Name</span>
            <span className="font-semibold">{billingInfo?.tradingName || "--"}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Entity Type</span>
            <span className="font-semibold capitalize">{(billingInfo?.businessType || "SOLE_PROPRIETOR").replace("_", " ")}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Billing Country</span>
            <span className="font-semibold">{billingInfo?.country || "--"}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Tax ID / TIN</span>
            <span className="font-semibold">{billingInfo?.taxId || "--"}</span>
          </div>
        </div>
      </div>

      {/* Editable Form Profile Details */}
      <div className="md:col-span-2 rounded-3xl border border-border bg-card p-8 shadow-sm">
        <h3 className="text-xl font-bold mb-1">Update Organization Details</h3>
        <p className="text-muted-foreground text-sm mb-6">Manage brand identifiers and legal addresses associated with your billing files.</p>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="orgTradingName" className="text-xs font-semibold text-foreground/80">Trading / Brand Name</Label>
              <Input
                id="orgTradingName"
                value={formData.tradingName}
                onChange={(e) => setFormData({ ...formData, tradingName: e.target.value })}
                placeholder="e.g. Clinic EZ Manila Branch"
                className="rounded-lg"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">If provided, this brand name will reflect on your invoices and receipts. Otherwise, the clinic name is used.</p>
            </div>
            
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="orgBusinessType" className="text-xs font-semibold text-foreground/80">Business Entity Type</Label>
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
              <Label htmlFor="orgTaxId" className="text-xs font-semibold text-foreground/80">
                Tax ID / TIN <span className="text-destructive">*</span>
              </Label>
              <Input
                id="orgTaxId"
                required
                value={formData.taxId}
                onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                onBlur={() => setTouchedFields((prev: any) => ({ ...prev, taxId: true }))}
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

            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="orgPhoneNumber" className="text-xs font-semibold text-foreground/80">
                Mobile Phone Number (E.164) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="orgPhoneNumber"
                type="tel"
                required
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                onBlur={() => setTouchedFields((prev: any) => ({ ...prev, phoneNumber: true }))}
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

            <div className="space-y-1.5 col-span-2 border-t pt-4 mt-2">
              <Label htmlFor="orgCountry" className="text-xs font-semibold text-foreground/80">
                Country <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.country}
                onValueChange={(val) => {
                  setFormData({ ...formData, country: val });
                  setTouchedFields((prev: any) => ({ ...prev, country: true }));
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
              <Label htmlFor="orgStreetLine1" className="text-xs font-semibold text-foreground/80">
                Street Address Line 1 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="orgStreetLine1"
                required
                value={formData.streetLine1}
                onChange={(e) => setFormData({ ...formData, streetLine1: e.target.value })}
                onBlur={() => setTouchedFields((prev: any) => ({ ...prev, streetLine1: true }))}
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
              <Label htmlFor="orgStreetLine2" className="text-xs font-semibold text-foreground/80">Street Address Line 2 (Optional)</Label>
              <Input
                id="orgStreetLine2"
                value={formData.streetLine2}
                onChange={(e) => setFormData({ ...formData, streetLine2: e.target.value })}
                placeholder="e.g. Village/Subdivision"
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="orgCity" className="text-xs font-semibold text-foreground/80">
                City / Municipality <span className="text-destructive">*</span>
              </Label>
              <Input
                id="orgCity"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                onBlur={() => setTouchedFields((prev: any) => ({ ...prev, city: true }))}
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

            <div className="space-y-1.5">
              <Label htmlFor="orgProvince" className="text-xs font-semibold text-foreground/80">
                Province / State <span className="text-destructive">*</span>
              </Label>
              <Input
                id="orgProvince"
                required
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                onBlur={() => setTouchedFields((prev: any) => ({ ...prev, province: true }))}
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

            <div className="space-y-1.5 col-span-2 md:col-span-1">
              <Label htmlFor="orgPostalCode" className="text-xs font-semibold text-foreground/80">
                Postal / Zip Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="orgPostalCode"
                required
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                onBlur={() => setTouchedFields((prev: any) => ({ ...prev, postalCode: true }))}
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

          <div className="flex justify-end pt-4 border-t">
            <Button
              type="submit"
              disabled={isUpdatingInfo || !isValid}
              className="rounded-full px-6 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdatingInfo ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
