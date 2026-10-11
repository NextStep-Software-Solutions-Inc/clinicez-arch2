"use client";

import React, { useEffect, useState } from "react";
import { adminService, AdminSystemSettingDto } from "@/services/admin.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconAdjustments, IconCheck, IconLoader2, IconMail, IconShieldCheck, IconUpload, IconBriefcase } from "@tabler/icons-react";

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<AdminSystemSettingDto[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"Licensing" | "Billing" | "Storage" | "Mailer">("Licensing");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await adminService.getSettings();
      setSettings(data);
      const formMap: Record<string, string> = {};
      data.forEach(s => {
        formMap[s.key] = s.value;
      });
      setFormData(formMap);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to load platform settings." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setFeedback(null);
      const updated = await adminService.updateSettings(formData);
      setSettings(updated);
      const formMap: Record<string, string> = {};
      updated.forEach(s => {
        formMap[s.key] = s.value;
      });
      setFormData(formMap);
      setFeedback({ type: "success", message: "Platform settings updated successfully. Changes take effect immediately." });
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to save platform settings." });
    } finally {
      setSaving(false);
    }
  };

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
            Manage global platform configuration defaults, licensing parameters, storage limits, and system mailer settings.
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
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-1 sm:space-x-4">
        {[
          { id: "Licensing", label: "Licensing & Limits", icon: IconShieldCheck },
          { id: "Billing", label: "Billing & Plans", icon: IconBriefcase },
          { id: "Storage", label: "Storage & Uploads", icon: IconUpload },
          { id: "Mailer", label: "Mailer & Notifications", icon: IconMail },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 px-3 sm:px-4 border-b-2 text-sm font-bold transition-colors ${
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
              <CardTitle className="text-base font-bold">Licensing & Facility Parameters</CardTitle>
              <CardDescription>
                Controls offline facility licensing TTL, grace periods, auto-renewal windows, and workspace limits.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderField("Licensing:TtlDays", "Default License TTL (Days)", "Validity duration in days for newly issued facility licenses.", "number")}
              {renderField("Licensing:GraceDays", "Offline Grace Period (Days)", "Grace period allowed for on-premise facilities operating without internet.", "number")}
              {renderField("Licensing:RenewBeforeDays", "Auto-Renewal Threshold (Days)", "Days remaining before license expiry to trigger background auto-renewal.", "number")}
              {renderField("Workspace:MaxOwnedPerUser", "Max Owned Workspaces Per User", "Maximum active owned workspaces allowed per registered user account.", "number")}
            </CardContent>
          </Card>
        )}

        {activeTab === "Billing" && (
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">Billing & Subscription Defaults</CardTitle>
              <CardDescription>
                Configures default trial lengths and initial subscription plan assignments for new workspaces.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderField("Billing:TrialDays", "Default Trial Duration (Days)", "Number of trial days granted to newly created workspace accounts.", "number")}
              {renderField("Billing:DefaultPlanSlug", "Default Subscription Plan Slug", "Initial plan tier assigned upon tenant registration (e.g. starter, professional).")}
            </CardContent>
          </Card>
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
      </form>
    </div>
  );
}
