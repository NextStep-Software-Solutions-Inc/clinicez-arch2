"use client";

import React, { useEffect, useState } from "react";
import { adminService, AdminSystemSettingDto } from "@/services/admin.service";
import { PlatformBankAccount } from "@/services/billing.service";
import { ADMIN_PERMISSIONS } from "@/constants/permissions";
import { useAdmin } from "../AdminLayoutClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  IconAdjustments,
  IconCheck,
  IconLoader2,
  IconMail,
  IconShieldCheck,
  IconUpload,
  IconBriefcase,
  IconBuildingBank,
  IconPlus,
  IconTrash,
  IconReceiptTax,
  IconLock,
  IconPhone,
} from "@tabler/icons-react";

const DEFAULT_BANK_ACCOUNTS: PlatformBankAccount[] = [
  {
    id: "bdo",
    institution: "BDO Unibank",
    accountName: "ClinicEZ Digital Health Inc.",
    accountNumber: "0012-3456-7890",
    copyValue: "0012-3456-7890",
    branch: "BGC Corporate Center",
    type: "bank",
    badge: "Commercial Bank",
    isActive: true,
  },
  {
    id: "bpi",
    institution: "Bank of the Philippine Islands (BPI)",
    accountName: "ClinicEZ Digital Health Inc.",
    accountNumber: "4321-8765-09",
    copyValue: "4321-8765-09",
    branch: "Ayala Triangle",
    type: "bank",
    badge: "Commercial Bank",
    isActive: true,
  },
  {
    id: "gcash-maya",
    institution: "GCash / Maya",
    accountName: "ClinicEZ Digital Health",
    accountNumber: "0917-123-EZPH (0917-123-3974)",
    copyValue: "0917-123-3974",
    branch: "Merchant QR / Mobile Wallet",
    type: "ewallet",
    badge: "Instant E-Wallet",
    isActive: true,
  },
];

function parseBankAccountsJson(raw?: string): PlatformBankAccount[] {
  if (!raw) return DEFAULT_BANK_ACCOUNTS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => ({
        id: String(item.id || `bank-${idx + 1}`),
        institution: String(item.institution || ""),
        accountName: String(item.accountName || ""),
        accountNumber: String(item.accountNumber || ""),
        copyValue: String(item.copyValue || item.accountNumber || ""),
        branch: item.branch ? String(item.branch) : "",
        type: item.type === "ewallet" ? "ewallet" : "bank",
        badge: String(item.badge || (item.type === "ewallet" ? "Instant E-Wallet" : "Commercial Bank")),
        isActive: item.isActive !== false,
      }));
    }
  } catch {
    // Fallback on malformed JSON
  }
  return DEFAULT_BANK_ACCOUNTS;
}

export default function PlatformSettingsPage() {
  const { hasPermission } = useAdmin();
  const canManageSettings =
    hasPermission(ADMIN_PERMISSIONS.MANAGE_SETTINGS) ||
    hasPermission(ADMIN_PERMISSIONS.MANAGE_TENANTS);

  const [settings, setSettings] = useState<AdminSystemSettingDto[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [bankAccounts, setBankAccounts] = useState<PlatformBankAccount[]>(DEFAULT_BANK_ACCOUNTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"Licensing" | "Billing" | "Storage" | "Mailer" | "Contact" | "Lifecycle">("Licensing");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await adminService.getSettings();
      setSettings(data);
      const formMap: Record<string, string> = {
        "Contact:HeadquartersAddress": "San Juan 2, Sto Nino\nLapasan, Cagayan de Oro City\nMisamis Oriental\nPhilippines 9000",
        "Contact:SupportEmail": "support@clinicez.com",
        "Contact:SalesEmail": "sales@clinicez.com",
        "Contact:PhoneNumber": "+63 (965) 429-7640",
        "Contact:OperatingHours": "Mon - Fri, 8am - 5pm (PHT)",
        "Mailer:ContactInbox": "contact@clinicez.com",
        "Workspace:OrphanInactivityDaysThreshold": "14",
        "Workspace:OrphanAutoPurgeEnabled": "false",
        "Workspace:OrphanAutoPurgeGraceDays": "30",
      };
      data.forEach(s => {
        formMap[s.key] = s.value;
      });
      setFormData(formMap);
      setBankAccounts(parseBankAccountsJson(formMap["Billing:BankAccountsJson"]));
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to load platform settings." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManageSettings) {
      fetchSettings();
    } else {
      setLoading(false);
    }
  }, [canManageSettings]);

  const handleChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const syncBankAccounts = (nextAccounts: PlatformBankAccount[]) => {
    setBankAccounts(nextAccounts);
    setFormData(prev => ({
      ...prev,
      "Billing:BankAccountsJson": JSON.stringify(nextAccounts),
    }));
  };

  const handleAddBankAccount = () => {
    const newId = `acct-${Date.now()}`;
    const nextAccounts: PlatformBankAccount[] = [
      ...bankAccounts,
      {
        id: newId,
        institution: "",
        accountName: formData["Billing:CorporateName"] || "ClinicEZ Digital Health Inc.",
        accountNumber: "",
        copyValue: "",
        branch: "",
        type: "bank",
        badge: "Commercial Bank",
        isActive: true,
      },
    ];
    syncBankAccounts(nextAccounts);
  };

  const handleUpdateBankAccount = (index: number, patch: Partial<PlatformBankAccount>) => {
    const nextAccounts = bankAccounts.map((acct, i) => {
      if (i !== index) return acct;
      const updated = { ...acct, ...patch };
      if (patch.accountNumber !== undefined && (!acct.copyValue || acct.copyValue === acct.accountNumber)) {
        updated.copyValue = patch.accountNumber;
      }
      if (patch.type !== undefined && (acct.badge === "Commercial Bank" || acct.badge === "Instant E-Wallet")) {
        updated.badge = patch.type === "ewallet" ? "Instant E-Wallet" : "Commercial Bank";
      }
      return updated;
    });
    syncBankAccounts(nextAccounts);
  };

  const handleRemoveBankAccount = (index: number) => {
    const nextAccounts = bankAccounts.filter((_, i) => i !== index);
    syncBankAccounts(nextAccounts);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setFeedback(null);

      for (const acct of bankAccounts) {
        if (!acct.institution.trim() || !acct.accountName.trim() || !acct.accountNumber.trim()) {
          setFeedback({
            type: "error",
            message: "Every configured bank or e-wallet account must have an Institution Name, Account Name, and Account Number.",
          });
          setSaving(false);
          return;
        }
      }

      const payload: Record<string, string> = {
        ...formData,
        "Billing:BankAccountsJson": JSON.stringify(bankAccounts),
      };

      const updated = await adminService.updateSettings(payload);
      setSettings(updated);
      const formMap: Record<string, string> = {};
      updated.forEach(s => {
        formMap[s.key] = s.value;
      });
      setFormData(formMap);
      setBankAccounts(parseBankAccountsJson(formMap["Billing:BankAccountsJson"]));
      setFeedback({ type: "success", message: "Platform settings updated successfully. Changes take effect immediately." });
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to save platform settings." });
    } finally {
      setSaving(false);
    }
  };

  if (!canManageSettings) {
    return (
      <Card className="border-slate-200 dark:border-slate-800 max-w-xl">
        <CardContent className="p-8 text-center space-y-3">
          <IconLock className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">
            You need the <code>{ADMIN_PERMISSIONS.MANAGE_SETTINGS}</code> permission to view or modify global platform settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderField = (key: string, label: string, description: string, type: string = "text") => {
    const val = formData[key] ?? "";
    const settingObj = settings.find(s => s.key === key);

    return (
      <div className="space-y-2 pb-4 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0">
        <div className="flex items-center justify-between">
          <Label htmlFor={key} className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {label}
          </Label>
          {settingObj?.updatedBy && (
            <span className="text-[11px] text-muted-foreground font-medium">
              Updated by {settingObj.updatedBy} ({new Date(settingObj.updatedAt).toLocaleDateString()})
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <Input
          id={key}
          type={type}
          value={val}
          onChange={e => handleChange(key, e.target.value)}
          className="max-w-xl font-mono text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
        />
      </div>
    );
  };

  const isBirTaxExempt = (formData["Billing:BirTaxExempt"] || "false").toLowerCase() === "true";
  const birTaxPercentage = formData["Billing:BirTaxPercentage"] ?? "12";

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <IconAdjustments className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Platform Settings
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage global platform configuration defaults, offline settlement bank accounts, BIR tax rules, licensing parameters, and mailer settings.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md self-start sm:self-auto"
        >
          {saving ? (
            <>
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <IconCheck className="mr-2 h-4 w-4" /> Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Alert Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-center gap-3 ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
          }`}
        >
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-1 sm:space-x-4 overflow-x-auto">
        {[
          { id: "Licensing", label: "Licensing & Limits", icon: IconShieldCheck },
          { id: "Lifecycle", label: "Workspace Lifecycle & Cleanup", icon: IconTrash },
          { id: "Billing", label: "Billing, Banks & BIR Tax", icon: IconBriefcase },
          { id: "Storage", label: "Storage & Uploads", icon: IconUpload },
          { id: "Mailer", label: "Mailer & Notifications", icon: IconMail },
          { id: "Contact", label: "Contact & Support", icon: IconPhone },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 px-3 sm:px-4 border-b-2 text-sm font-bold transition-colors whitespace-nowrap ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <form onSubmit={handleSave} className="space-y-6">
        {activeTab === "Licensing" && (
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">Licensing, Patient Claim & Facility Parameters</CardTitle>
              <CardDescription>
                Controls offline facility licensing TTL, grace periods, auto-renewal windows, workspace limits, and progressive patient claim links.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderField("Licensing:TtlDays", "Default License TTL (Days)", "Validity duration in days for newly issued facility licenses.", "number")}
              {renderField("Licensing:GraceDays", "Offline Grace Period (Days)", "Grace period allowed for on-premise facilities operating without internet.", "number")}
              {renderField("Licensing:RenewBeforeDays", "Auto-Renewal Threshold (Days)", "Days remaining before license expiry to trigger background auto-renewal.", "number")}
              {renderField("Workspace:MaxOwnedPerUser", "Max Owned Workspaces Per User", "Maximum active owned workspaces allowed per registered user account.", "number")}
              {renderField("JoinClaim:TtlHours", "Progressive Patient Claim Token TTL (Hours)", "Validity window in hours for progressive patient intake claim tokens.", "number")}
              {renderField("PatientApp:AppleAppStoreUrl", "Apple App Store Download URL", "Official iOS download URL included in patient claim emails.")}
              {renderField("PatientApp:GooglePlayStoreUrl", "Google Play Store Download URL", "Official Android download URL included in patient claim emails.")}
            </CardContent>
          </Card>
        )}

        {activeTab === "Lifecycle" && (
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">Workspace Lifecycle & Tenancy Cleanup</CardTitle>
              <CardDescription>
                Configure inactivity thresholds for identifying orphaned trial workspaces and rules for scheduled background garbage collection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderField(
                "Workspace:OrphanInactivityDaysThreshold",
                "Orphan Inactivity Threshold (Days)",
                "Number of days of inactivity (with 0 facilities and 0 patient records) before a workspace is flagged as Orphaned in the Admin Console (Default: 14).",
                "number"
              )}
              {renderField(
                "Workspace:OrphanAutoPurgeGraceDays",
                "Auto-Purge Minimum Age Grace Period (Days)",
                "Minimum age in days an orphaned ghost workspace must reach before being eligible for automated background purging (Default: 30).",
                "number"
              )}
              <div className="space-y-2 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <Label htmlFor="orphanAutoPurge" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Enable Automated Background Purge (Nightly Hangfire Job)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  When enabled, the nightly background cleanup job automatically purges ghost workspaces meeting the Zero-Data Invariant (0 patients, 0 invoices) older than the grace period. Recommended for Staging/Dev environments.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <select
                    id="orphanAutoPurge"
                    value={formData["Workspace:OrphanAutoPurgeEnabled"] ?? "false"}
                    onChange={(e) => handleChange("Workspace:OrphanAutoPurgeEnabled", e.target.value)}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold max-w-xs"
                  >
                    <option value="false">Disabled (Flag & Log Only - Production Safe)</option>
                    <option value="true">Enabled (Auto-Purge Qualifying Ghosts)</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "Billing" && (
          <div className="space-y-6">
            {/* Section 1: N-Bank Account Management */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <IconBuildingBank className="h-5 w-5 text-primary" />
                    Offline Settlement Bank & E-Wallet Accounts ({bankAccounts.length})
                  </CardTitle>
                  <CardDescription>
                    Add, edit, activate, or remove any number of Philippine bank or e-wallet accounts displayed to tenants for offline subscription settlement.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddBankAccount}
                  className="shrink-0 font-semibold border-primary/30 text-primary hover:bg-primary/10"
                >
                  <IconPlus className="mr-1.5 h-4 w-4" />
                  Add Bank / E-Wallet Account
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {bankAccounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      No settlement bank accounts configured
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Click &ldquo;Add Bank / E-Wallet Account&rdquo; above to add BDO, BPI, Metrobank, UnionBank, GCash, Maya, or any corporate settlement account.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bankAccounts.map((acct, index) => (
                      <div
                        key={acct.id || index}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {index + 1}
                            </span>
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              {acct.institution || "New Settlement Account"}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                              {acct.type === "ewallet" ? "E-Wallet" : "Bank"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={acct.isActive !== false}
                                onChange={e => handleUpdateBankAccount(index, { isActive: e.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                              />
                              Active for Tenants
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveBankAccount(index)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 h-8 px-2.5"
                            >
                              <IconTrash className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Bank / Institution Name *</Label>
                            <Input
                              value={acct.institution}
                              onChange={e => handleUpdateBankAccount(index, { institution: e.target.value })}
                              placeholder="e.g. BDO Unibank, BPI, GCash / Maya"
                              className="bg-white dark:bg-slate-900 text-sm"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Account Holder Name *</Label>
                            <Input
                              value={acct.accountName}
                              onChange={e => handleUpdateBankAccount(index, { accountName: e.target.value })}
                              placeholder="e.g. ClinicEZ Digital Health Inc."
                              className="bg-white dark:bg-slate-900 text-sm"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Account / Mobile Number (Display) *</Label>
                            <Input
                              value={acct.accountNumber}
                              onChange={e => handleUpdateBankAccount(index, { accountNumber: e.target.value })}
                              placeholder="e.g. 0012-3456-7890"
                              className="bg-white dark:bg-slate-900 font-mono text-sm"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Clipboard Copy Value</Label>
                            <Input
                              value={acct.copyValue}
                              onChange={e => handleUpdateBankAccount(index, { copyValue: e.target.value })}
                              placeholder="Exact digits copied when tenant clicks Copy"
                              className="bg-white dark:bg-slate-900 font-mono text-sm"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Branch / Channel Subtitle</Label>
                            <Input
                              value={acct.branch || ""}
                              onChange={e => handleUpdateBankAccount(index, { branch: e.target.value })}
                              placeholder="e.g. BGC Corporate Center"
                              className="bg-white dark:bg-slate-900 text-sm"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Channel Type</Label>
                              <select
                                value={acct.type}
                                onChange={e =>
                                  handleUpdateBankAccount(index, {
                                    type: e.target.value === "ewallet" ? "ewallet" : "bank",
                                  })
                                }
                                className="flex h-9 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-sm"
                              >
                                <option value="bank">Bank</option>
                                <option value="ewallet">E-Wallet</option>
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Badge Label</Label>
                              <Input
                                value={acct.badge}
                                onChange={e => handleUpdateBankAccount(index, { badge: e.target.value })}
                                placeholder="Commercial Bank"
                                className="bg-white dark:bg-slate-900 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Section 2: BIR Tax Exemption & Percentage Configuration */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <IconReceiptTax className="h-5 w-5 text-primary" />
                  BIR Tax Exemption, VAT Percentage & Corporate Invoicing Identity
                </CardTitle>
                <CardDescription>
                  Configures Philippine Bureau of Internal Revenue (BIR) tax treatment, VAT rate percentage, and corporate entity details printed on all invoices and Official Receipts (OR).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="space-y-2">
                    <Label htmlFor="Billing:BirTaxExempt" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      BIR Tax Exemption Mode
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      When enabled, all platform invoices and official receipts are issued as BIR VAT-Exempt (0% VAT).
                    </p>
                    <select
                      id="Billing:BirTaxExempt"
                      value={isBirTaxExempt ? "true" : "false"}
                      onChange={e => handleChange("Billing:BirTaxExempt", e.target.value)}
                      className="flex h-10 w-full max-w-md rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                    >
                      <option value="false">VATable — Apply Configured BIR Tax Percentage ({birTaxPercentage}%)</option>
                      <option value="true">VAT-Exempt — 0% Tax (BIR Tax Exempt)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="Billing:BirTaxPercentage" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      BIR Tax / VAT Percentage (%)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Tax rate percentage applied when BIR Tax Exemption is off (standard Philippine VAT is 12%).
                    </p>
                    <div className="flex items-center gap-2 max-w-xs">
                      <Input
                        id="Billing:BirTaxPercentage"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        disabled={isBirTaxExempt}
                        value={birTaxPercentage}
                        onChange={e => handleChange("Billing:BirTaxPercentage", e.target.value)}
                        className="font-mono text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                      />
                      <span className="text-sm font-bold text-muted-foreground">%</span>
                    </div>
                    {isBirTaxExempt && (
                      <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        Currently overridden to 0% because BIR Tax Exemption Mode is active.
                      </p>
                    )}
                  </div>
                </div>

                {renderField("Billing:CorporateName", "Registered Corporate Name", "Legal entity name displayed on bank transfer instructions, billing statements, and BIR Official Receipts.")}
                {renderField("Billing:CorporateTin", "BIR Registered TIN", "Corporate Tax Identification Number printed on invoices and Official Receipts (e.g. 009-876-543-000).")}
                {renderField("Billing:CorporateAddress", "Registered Corporate Address", "Official business address printed on BIR billing statements and Official Receipts.")}
                {renderField("Billing:SupportEmail", "Billing & Remittance Support Email", "Email address where tenants send offline payment proof and billing inquiries.")}
              </CardContent>
            </Card>

            {/* Section 3: Subscription Trial & Plan Defaults */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-base font-bold">Subscription Trial & Plan Defaults</CardTitle>
                <CardDescription>
                  Configures default trial lengths, initial subscription plan assignments, and default pricing display terms.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {renderField("Billing:TrialDays", "Default Trial Duration (Days)", "Number of trial days granted to newly created workspace accounts.", "number")}
                {renderField("Billing:DefaultPlanSlug", "Default Subscription Plan Slug", "Initial plan tier assigned upon tenant registration (e.g. starter, professional).")}

                {/* Default Billing Cadence Selector */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Default Billing Cadence (Pricing & Subscriptions)
                    </Label>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Public /pricing & In-app Billing
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Determines the default payment term displayed to prospective clinics on the public pricing page and in-app workspace subscription plans. Visitors and administrators can still toggle terms freely at any time.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    {/* Monthly Option */}
                    <button
                      type="button"
                      onClick={() => handleChange("Billing:DefaultBillingCadence", "monthly")}
                      className={cn(
                        "relative flex flex-col text-left p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        (formData["Billing:DefaultBillingCadence"] || "monthly").toLowerCase() !== "annually"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                              (formData["Billing:DefaultBillingCadence"] || "monthly").toLowerCase() !== "annually"
                                ? "border-primary bg-primary text-white"
                                : "border-slate-300 dark:border-slate-700 bg-transparent"
                            )}
                          >
                            {(formData["Billing:DefaultBillingCadence"] || "monthly").toLowerCase() !== "annually" && (
                              <IconCheck className="h-2.5 w-2.5 stroke-[3]" />
                            )}
                          </div>
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Monthly Cadence
                          </span>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-normal pl-6">
                        Presents accessible monthly rates upfront (e.g. ₱2,940/mo). Minimizes initial cost friction to maximize clinic registration and free trial starts.
                      </p>
                    </button>

                    {/* Annual Option */}
                    <button
                      type="button"
                      onClick={() => handleChange("Billing:DefaultBillingCadence", "annually")}
                      className={cn(
                        "relative flex flex-col text-left p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        (formData["Billing:DefaultBillingCadence"] || "monthly").toLowerCase() === "annually"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                              (formData["Billing:DefaultBillingCadence"] || "monthly").toLowerCase() === "annually"
                                ? "border-primary bg-primary text-white"
                                : "border-slate-300 dark:border-slate-700 bg-transparent"
                            )}
                          >
                            {(formData["Billing:DefaultBillingCadence"] || "monthly").toLowerCase() === "annually" && (
                              <IconCheck className="h-2.5 w-2.5 stroke-[3]" />
                            )}
                          </div>
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Annual Cadence
                          </span>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                          Upfront Commitment
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-normal pl-6">
                        Presents discounted annual rates upfront with maximum savings badges (e.g. Save 20%). Optimizes for upfront cash flow and long-term commitments.
                      </p>
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "Storage" && (
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">Storage & Public Patient Upload Limits</CardTitle>
              <CardDescription>
                Sets file size limits and rate limiting parameters for public patient lab report upload slips.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderField("Storage:LabUploadMaxFileBytes", "Public Upload Max Bytes", "Maximum file size in bytes for patient lab upload slips (default 10485760 = 10MB).", "number")}
              {renderField("Storage:LabUploadRateLimitPermits", "Rate Limit Max Permits", "Maximum public upload attempts allowed per window per IP.", "number")}
              {renderField("Storage:LabUploadRateLimitWindowMinutes", "Rate Limit Window (Minutes)", "Time window duration in minutes for public lab upload rate limiting.", "number")}
            </CardContent>
          </Card>
        )}

        {activeTab === "Mailer" && (
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">System Mailer & Notification Defaults</CardTitle>
              <CardDescription>
                Configures unified system mailer SMTP server parameters and default sender identities.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderField("Mailer:SmtpHost", "SMTP Host", "Hostname of the outgoing SMTP mail server.")}
              {renderField("Mailer:SmtpPort", "SMTP Port", "Port number of the SMTP server (e.g. 587, 465, 1025).", "number")}
              {renderField("Mailer:SmtpSecurity", "SMTP Security Mode", "Encryption protocol (None, StartTls, Tls).")}
              {renderField("Mailer:SmtpFromEmail", "Default Sender Email", "Sender email address on system emails (e.g. no-reply@clinicez.com).")}
              {renderField("Mailer:SmtpFromName", "Default Sender Name", "Display name shown in recipients' inboxes.")}
              {renderField("Mailer:SmtpReplyTo", "Default Reply-To Email", "Reply-To address for outgoing automated emails.")}
              {renderField("Mailer:ContactInbox", "Support Contact Inbox", "Destination inbox email address for customer inquiry submissions.")}
            </CardContent>
          </Card>
        )}

        {activeTab === "Contact" && (
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">Public Contact & Support Information</CardTitle>
              <CardDescription>
                Configures public headquarters address, support/sales email addresses, customer phone lines, and operating hours displayed on the Contact Us page and public portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderField(
                "Contact:HeadquartersAddress",
                "Headquarters Address",
                "Official registered business address displayed on public contact pages and communications."
              )}
              {renderField(
                "Contact:SupportEmail",
                "Public Support Email",
                "Main customer support email displayed to visitors (e.g. support@clinicez.com)."
              )}
              {renderField(
                "Contact:SalesEmail",
                "Public Sales Email",
                "Direct sales inquiry email address displayed to visitors (e.g. sales@clinicez.com)."
              )}
              {renderField(
                "Contact:PhoneNumber",
                "Support Phone Number",
                "Primary phone or mobile helpline displayed to visitors (e.g. +63 (965) 429-7640)."
              )}
              {renderField(
                "Contact:OperatingHours",
                "Support Operating Hours",
                "Business and hotline hours displayed on the contact page (e.g. Mon - Fri, 8am - 5pm (PHT))."
              )}
              {renderField(
                "Mailer:ContactInbox",
                "Inquiry Destination Mailbox",
                "Destination inbox where web form submissions from the Contact Us page are routed."
              )}
            </CardContent>
          </Card>
        )}
      </form>
    </div>
  );
}
