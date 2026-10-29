import React, { useEffect, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import { adminService, AdminSystemSettingDto } from '@/services/admin.service';
import { toast } from 'sonner';
import {
  IconRefresh,
  IconBuildingBank,
  IconReceiptTax,
  IconPlus,
  IconTrash,
  IconLoader,
  IconAlertCircle,
  IconFileCertificate,
  IconCloud,
  IconMail,
  IconPhone,
  IconTrashX,
} from '@tabler/icons-react';

export interface PlatformBankAccount {
  id: string;
  institution: string;
  accountName: string;
  accountNumber: string;
  copyValue?: string;
  branch?: string;
  type: 'bank' | 'ewallet';
  badge?: string;
  isActive: boolean;
}

export const CANONICAL_SETTINGS_CATEGORIES = [
  'Licensing',
  'Billing',
  'Storage',
  'Mailer',
  'Contact',
  'Lifecycle',
] as const;

const KNOWN_CATEGORY_KEYS: Record<string, string[]> = {
  Licensing: [
    'Licensing:TtlDays',
    'Licensing:GraceDays',
    'Licensing:RenewBeforeDays',
    'Workspace:MaxOwnedPerUser',
    'JoinClaim:TtlHours',
    'PatientApp:AppleAppStoreUrl',
    'PatientApp:GooglePlayStoreUrl',
  ],
  Billing: [
    'Billing:IsOnlinePaymentReady',
    'Billing:BirTaxExempt',
    'Billing:BirTaxPercentage',
    'Billing:CorporateName',
    'Billing:CorporateTin',
    'Billing:CorporateAddress',
    'Billing:SupportEmail',
    'Billing:TrialDays',
    'Billing:DefaultPlanSlug',
    'Billing:DefaultBillingCadence',
    'Billing:BankAccountsJson',
  ],
  Storage: [
    'Storage:LabUploadMaxFileBytes',
    'Storage:LabUploadRateLimitPermits',
    'Storage:LabUploadRateLimitWindowMinutes',
  ],
  Mailer: [
    'Mailer:SmtpHost',
    'Mailer:SmtpPort',
    'Mailer:SmtpSecurity',
    'Mailer:SmtpFromEmail',
    'Mailer:SmtpFromName',
    'Mailer:SmtpReplyTo',
    'Mailer:ContactInbox',
  ],
  Contact: [
    'Contact:HeadquartersAddress',
    'Contact:SupportEmail',
    'Contact:SalesEmail',
    'Contact:PhoneNumber',
    'Contact:OperatingHours',
  ],
  Lifecycle: [
    'Workspace:OrphanAutoPurgeEnabled',
    'Workspace:OrphanInactivityDaysThreshold',
    'Workspace:OrphanAutoPurgeGraceDays',
  ],
};

export function validateBankAccountsPayload(accounts: any[]): { valid: boolean; error?: string } {
  if (!Array.isArray(accounts)) {
    return { valid: false, error: 'Payload must be an array of bank accounts' };
  }
  for (const acc of accounts) {
    if (!acc.institution || !String(acc.institution).trim()) {
      return { valid: false, error: 'Bank account institution is required' };
    }
    if (!acc.accountName || !String(acc.accountName).trim()) {
      return { valid: false, error: 'Account holder name is required' };
    }
    if (!acc.accountNumber || !String(acc.accountNumber).trim()) {
      return { valid: false, error: 'Account number is required' };
    }
  }
  return { valid: true };
}

function SettingsPage() {
  const [settings, setSettings] = useState<AdminSystemSettingDto[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [bankAccounts, setBankAccounts] = useState<PlatformBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('Billing');

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getSettings();
      setSettings(data);

      const map: Record<string, string> = {};
      data.forEach((s) => {
        map[s.key] = s.value;
      });

      setFormData(map);

      if (map['Billing:BankAccountsJson']) {
        try {
          const parsed = JSON.parse(map['Billing:BankAccountsJson']);
          if (Array.isArray(parsed)) {
            setBankAccounts(parsed);
          } else {
            setBankAccounts([]);
          }
        } catch {
          setBankAccounts([]);
        }
      } else {
        setBankAccounts([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load platform settings configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddBankAccount = () => {
    const newAccount: PlatformBankAccount = {
      id: `bank-${Date.now()}`,
      institution: '',
      accountName: formData['Billing:CorporateName'] || '',
      accountNumber: '',
      branch: '',
      type: 'bank',
      badge: '',
      isActive: true,
    };
    setBankAccounts((prev) => [...prev, newAccount]);
  };

  const handleRemoveBankAccount = (index: number) => {
    setBankAccounts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateBankAccount = (index: number, field: keyof PlatformBankAccount, val: any) => {
    setBankAccounts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateBankAccountsPayload(bankAccounts);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setSaving(true);
    try {
      const updatedFormData: Record<string, string> = {
        ...formData,
        'Billing:BankAccountsJson': JSON.stringify(bankAccounts),
      };

      await adminService.updateSettings(updatedFormData);
      toast.success('Platform system configuration updated successfully.');
      await loadSettings();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const extraCategorySettings = settings.filter((s) => {
    const knownForCategory = KNOWN_CATEGORY_KEYS[activeCategory] || [];
    const allKnown = Object.values(KNOWN_CATEGORY_KEYS).flat();
    return s.category === activeCategory && !knownForCategory.includes(s.key) && !allKnown.includes(s.key);
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Platform System Settings</h1>
          <p className="text-xs text-text-muted mt-1">
            N-Bank accounts builder, BIR statutory VAT policies, payment gateway toggles, and workspace lifecycle purge rules.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadSettings}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadSettings}
            className="px-3 py-1 font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Settings Workspace Container */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        {/* Category Sidebar Navigation */}
        <div className="p-3 bg-surface border border-border rounded-2xl space-y-1">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Canonical Categories
          </div>
          {CANONICAL_SETTINGS_CATEGORIES.map((cat) => {
            const isSelected = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text'
                }`}
              >
                <span>{cat}</span>
              </button>
            );
          })}
        </div>

        {/* Category Settings Form */}
        {loading ? (
          <div className="md:col-span-3 p-6 rounded-2xl bg-surface border border-border space-y-4 animate-pulse">
            <div className="h-5 w-56 bg-surface-muted rounded-md" />
            <div className="h-16 w-full bg-surface-muted rounded-xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-12 bg-surface-muted rounded-xl" />
              <div className="h-12 bg-surface-muted rounded-xl" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="md:col-span-3 space-y-6">
            {/* BILLING CATEGORY */}
            {activeCategory === 'Billing' && (
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-6 text-xs">
                <div className="pb-3 border-b border-border">
                  <h2 className="text-base font-bold text-text flex items-center gap-2">
                    <IconReceiptTax className="h-5 w-5 text-primary" />
                    <span>Billing, BIR VAT & Commercial Payment Gateways</span>
                  </h2>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Configure statutory Philippine VAT compliance, corporate billing identity, and multi-bank manual payment accounts.
                  </p>
                </div>

                {/* Online Payment Switch */}
                <div className="p-4 rounded-xl bg-surface-muted border border-border flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-text text-sm">Online Payment Gateway Readiness</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      When active, clinics can settle subscriptions via automated online checkout. When disabled, offline manual bank settlement is enforced.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleFieldChange(
                        'Billing:IsOnlinePaymentReady',
                        formData['Billing:IsOnlinePaymentReady'] === 'true' ? 'false' : 'true'
                      )
                    }
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                      formData['Billing:IsOnlinePaymentReady'] === 'true'
                        ? 'bg-primary text-white'
                        : 'bg-surface border border-border text-text-muted hover:text-text'
                    }`}
                  >
                    {formData['Billing:IsOnlinePaymentReady'] === 'true' ? 'Gateway Active' : 'Gateway Offline'}
                  </button>
                </div>

                {/* BIR Tax Exempt Switch */}
                <div className="p-4 rounded-xl bg-surface-muted border border-border flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-text text-sm">BIR Tax Exemption Mode</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      Toggle whether issued invoices and receipts are exempt from Value Added Tax (`Billing:BirTaxExempt`).
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleFieldChange(
                        'Billing:BirTaxExempt',
                        formData['Billing:BirTaxExempt'] === 'true' ? 'false' : 'true'
                      )
                    }
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                      formData['Billing:BirTaxExempt'] === 'true'
                        ? 'bg-primary text-white'
                        : 'bg-surface border border-border text-text-muted hover:text-text'
                    }`}
                  >
                    {formData['Billing:BirTaxExempt'] === 'true' ? 'Tax Exempt' : 'VAT Taxable'}
                  </button>
                </div>

                {/* Corporate & Tax Settings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">BIR VAT Percentage (%)</label>
                    <input
                      type="number"
                      value={formData['Billing:BirTaxPercentage'] ?? ''}
                      onChange={(e) => handleFieldChange('Billing:BirTaxPercentage', e.target.value)}
                      min={0}
                      max={100}
                      step="0.01"
                      placeholder="Configured VAT rate"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Corporate TIN</label>
                    <input
                      type="text"
                      value={formData['Billing:CorporateTin'] ?? ''}
                      onChange={(e) => handleFieldChange('Billing:CorporateTin', e.target.value)}
                      placeholder="Registered BIR TIN"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Corporate Legal Name</label>
                    <input
                      type="text"
                      value={formData['Billing:CorporateName'] ?? ''}
                      onChange={(e) => handleFieldChange('Billing:CorporateName', e.target.value)}
                      placeholder="Registered corporate entity name"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Billing Support Email</label>
                    <input
                      type="email"
                      value={formData['Billing:SupportEmail'] ?? ''}
                      onChange={(e) => handleFieldChange('Billing:SupportEmail', e.target.value)}
                      placeholder="Billing inquiries email"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="font-semibold text-text">Corporate Registered Address</label>
                    <input
                      type="text"
                      value={formData['Billing:CorporateAddress'] ?? ''}
                      onChange={(e) => handleFieldChange('Billing:CorporateAddress', e.target.value)}
                      placeholder="Registered corporate business address"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Trial Duration (Days)</label>
                    <input
                      type="number"
                      value={formData['Billing:TrialDays'] ?? ''}
                      onChange={(e) => handleFieldChange('Billing:TrialDays', e.target.value)}
                      min={0}
                      max={365}
                      placeholder="Onboarding trial days"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Default Plan Slug</label>
                    <input
                      type="text"
                      value={formData['Billing:DefaultPlanSlug'] ?? ''}
                      onChange={(e) => handleFieldChange('Billing:DefaultPlanSlug', e.target.value)}
                      placeholder="Default onboarding plan slug"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Default Billing Cadence</label>
                    <select
                      value={formData['Billing:DefaultBillingCadence'] ?? ''}
                      onChange={(e) => handleFieldChange('Billing:DefaultBillingCadence', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text text-xs focus:outline-hidden"
                    >
                      <option value="">Select cadence...</option>
                      <option value="monthly">Monthly</option>
                      <option value="annually">Annually</option>
                    </select>
                  </div>
                </div>

                {/* N-Bank JSON CRUD Builder */}
                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-text flex items-center gap-2">
                        <IconBuildingBank className="h-4 w-4 text-primary" />
                        <span>N-Bank Corporate Accounts Builder ({bankAccounts.length})</span>
                      </h3>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Accounts presented to tenant clinics for offline bank transfer & QR settlements.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddBankAccount}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary-hover transition-colors cursor-pointer"
                    >
                      <IconPlus className="h-3.5 w-3.5" />
                      <span>Add Bank Account</span>
                    </button>
                  </div>

                  {bankAccounts.length === 0 ? (
                    <div className="p-6 rounded-xl bg-surface-muted border border-dashed border-border text-center space-y-2">
                      <div className="font-semibold text-text">No Settlement Bank Accounts Configured</div>
                      <p className="text-[11px] text-text-muted">
                        Add a corporate bank or e-wallet account in `Billing:BankAccountsJson` to enable manual payment instructions.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bankAccounts.map((acc, idx) => (
                        <div
                          key={acc.id || idx}
                          className="p-4 rounded-xl bg-surface-muted border border-border space-y-3"
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-border">
                            <span className="font-semibold text-text">
                              Account #{idx + 1}: {acc.institution || 'Untitled Institution'}
                            </span>
                            <div className="flex items-center gap-3">
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={acc.isActive !== false}
                                  onChange={(e) => handleUpdateBankAccount(idx, 'isActive', e.target.checked)}
                                  className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                                />
                                <span>Active</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => handleRemoveBankAccount(idx)}
                                className="text-red-600 hover:text-red-700 p-1 rounded cursor-pointer"
                                title="Remove Account"
                              >
                                <IconTrash className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-text-muted">Institution Name</label>
                              <input
                                type="text"
                                value={acc.institution}
                                onChange={(e) => handleUpdateBankAccount(idx, 'institution', e.target.value)}
                                placeholder="Bank or e-wallet institution"
                                className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-hidden"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-text-muted">Account Number</label>
                              <input
                                type="text"
                                value={acc.accountNumber}
                                onChange={(e) => handleUpdateBankAccount(idx, 'accountNumber', e.target.value)}
                                placeholder="Corporate account or merchant number"
                                className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-text-muted">Account Name</label>
                              <input
                                type="text"
                                value={acc.accountName}
                                onChange={(e) => handleUpdateBankAccount(idx, 'accountName', e.target.value)}
                                placeholder="Registered corporate account holder"
                                className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-hidden"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-text-muted">Branch / Channel</label>
                              <input
                                type="text"
                                value={acc.branch || ''}
                                onChange={(e) => handleUpdateBankAccount(idx, 'branch', e.target.value)}
                                placeholder="Branch name or transfer channel"
                                className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-hidden"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LIFECYCLE CATEGORY */}
            {activeCategory === 'Lifecycle' && (
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-6 text-xs">
                <div className="pb-3 border-b border-border">
                  <h2 className="text-base font-bold text-text flex items-center gap-2">
                    <IconTrashX className="h-5 w-5 text-primary" />
                    <span>Workspace Lifecycle & Orphan Purge Policies</span>
                  </h2>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Configure automatic pruning of orphaned clinics and offboarded database workspaces.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-surface-muted border border-border flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-text text-sm">Automated Orphan Purging</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      When enabled, workspaces with 0 patients and no activity past the threshold are auto-purged.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleFieldChange(
                        'Workspace:OrphanAutoPurgeEnabled',
                        formData['Workspace:OrphanAutoPurgeEnabled'] === 'true' ? 'false' : 'true'
                      )
                    }
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                      formData['Workspace:OrphanAutoPurgeEnabled'] === 'true'
                        ? 'bg-primary text-white'
                        : 'bg-surface border border-border text-text-muted hover:text-text'
                    }`}
                  >
                    {formData['Workspace:OrphanAutoPurgeEnabled'] === 'true' ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Inactivity Threshold (Days)</label>
                    <input
                      type="number"
                      value={formData['Workspace:OrphanInactivityDaysThreshold'] ?? ''}
                      onChange={(e) =>
                        handleFieldChange('Workspace:OrphanInactivityDaysThreshold', e.target.value)
                      }
                      min={1}
                      max={365}
                      placeholder="Days before orphan classification"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Grace Notification Period (Days)</label>
                    <input
                      type="number"
                      value={formData['Workspace:OrphanAutoPurgeGraceDays'] ?? ''}
                      onChange={(e) =>
                        handleFieldChange('Workspace:OrphanAutoPurgeGraceDays', e.target.value)
                      }
                      min={1}
                      max={90}
                      placeholder="Grace period days after archive"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* LICENSING CATEGORY */}
            {activeCategory === 'Licensing' && (
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 text-xs">
                <div className="pb-3 border-b border-border">
                  <h2 className="text-base font-bold text-text flex items-center gap-2">
                    <IconFileCertificate className="h-5 w-5 text-primary" />
                    <span>Platform Licensing & Entitlement Parameters</span>
                  </h2>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Signed entitlement token lifetimes, offline grace windows, workspace ownership limits, and mobile store links.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">License Token TTL (Days)</label>
                    <input
                      type="number"
                      value={formData['Licensing:TtlDays'] ?? ''}
                      onChange={(e) => handleFieldChange('Licensing:TtlDays', e.target.value)}
                      min={1}
                      max={365}
                      placeholder="Licensing:TtlDays"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Offline Grace Window (Days)</label>
                    <input
                      type="number"
                      value={formData['Licensing:GraceDays'] ?? ''}
                      onChange={(e) => handleFieldChange('Licensing:GraceDays', e.target.value)}
                      min={0}
                      max={90}
                      placeholder="Licensing:GraceDays"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Renew Before Expiry (Days)</label>
                    <input
                      type="number"
                      value={formData['Licensing:RenewBeforeDays'] ?? ''}
                      onChange={(e) => handleFieldChange('Licensing:RenewBeforeDays', e.target.value)}
                      min={1}
                      max={365}
                      placeholder="Licensing:RenewBeforeDays"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Max Workspaces Owned Per User</label>
                    <input
                      type="number"
                      value={formData['Workspace:MaxOwnedPerUser'] ?? ''}
                      onChange={(e) => handleFieldChange('Workspace:MaxOwnedPerUser', e.target.value)}
                      min={1}
                      max={100}
                      placeholder="Workspace:MaxOwnedPerUser"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Join Claim Token TTL (Hours)</label>
                    <input
                      type="number"
                      value={formData['JoinClaim:TtlHours'] ?? ''}
                      onChange={(e) => handleFieldChange('JoinClaim:TtlHours', e.target.value)}
                      min={1}
                      max={168}
                      placeholder="JoinClaim:TtlHours"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Apple App Store URL</label>
                    <input
                      type="url"
                      value={formData['PatientApp:AppleAppStoreUrl'] ?? ''}
                      onChange={(e) => handleFieldChange('PatientApp:AppleAppStoreUrl', e.target.value)}
                      placeholder="https://apps.apple.com/..."
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="font-semibold text-text">Google Play Store URL</label>
                    <input
                      type="url"
                      value={formData['PatientApp:GooglePlayStoreUrl'] ?? ''}
                      onChange={(e) => handleFieldChange('PatientApp:GooglePlayStoreUrl', e.target.value)}
                      placeholder="https://play.google.com/store/apps/..."
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STORAGE CATEGORY */}
            {activeCategory === 'Storage' && (
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 text-xs">
                <div className="pb-3 border-b border-border">
                  <h2 className="text-base font-bold text-text flex items-center gap-2">
                    <IconCloud className="h-5 w-5 text-primary" />
                    <span>Document & Lab Upload Quotas</span>
                  </h2>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Maximum upload payload size and rate-limit controls enforced by `portal-api`.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Max Upload File Size (Bytes)</label>
                    <input
                      type="number"
                      value={formData['Storage:LabUploadMaxFileBytes'] ?? ''}
                      onChange={(e) => handleFieldChange('Storage:LabUploadMaxFileBytes', e.target.value)}
                      min={1048576}
                      placeholder="Storage:LabUploadMaxFileBytes"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Rate Limit Permits</label>
                    <input
                      type="number"
                      value={formData['Storage:LabUploadRateLimitPermits'] ?? ''}
                      onChange={(e) => handleFieldChange('Storage:LabUploadRateLimitPermits', e.target.value)}
                      min={1}
                      placeholder="Storage:LabUploadRateLimitPermits"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Rate Limit Window (Minutes)</label>
                    <input
                      type="number"
                      value={formData['Storage:LabUploadRateLimitWindowMinutes'] ?? ''}
                      onChange={(e) => handleFieldChange('Storage:LabUploadRateLimitWindowMinutes', e.target.value)}
                      min={1}
                      placeholder="Storage:LabUploadRateLimitWindowMinutes"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* MAILER CATEGORY */}
            {activeCategory === 'Mailer' && (
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 text-xs">
                <div className="pb-3 border-b border-border">
                  <h2 className="text-base font-bold text-text flex items-center gap-2">
                    <IconMail className="h-5 w-5 text-primary" />
                    <span>Transactional Mailer & SMTP Dispatch</span>
                  </h2>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Outbound SMTP server, transport security, and sender identity headers.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">SMTP Host</label>
                    <input
                      type="text"
                      value={formData['Mailer:SmtpHost'] ?? ''}
                      onChange={(e) => handleFieldChange('Mailer:SmtpHost', e.target.value)}
                      placeholder="Mailer:SmtpHost"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">SMTP Port</label>
                    <input
                      type="number"
                      value={formData['Mailer:SmtpPort'] ?? ''}
                      onChange={(e) => handleFieldChange('Mailer:SmtpPort', e.target.value)}
                      min={1}
                      max={65535}
                      placeholder="Mailer:SmtpPort"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Transport Security</label>
                    <select
                      value={formData['Mailer:SmtpSecurity'] ?? ''}
                      onChange={(e) => handleFieldChange('Mailer:SmtpSecurity', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text text-xs focus:outline-hidden"
                    >
                      <option value="">Select security mode...</option>
                      <option value="None">None</option>
                      <option value="StartTls">StartTls</option>
                      <option value="Tls">Tls</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Sender Display Name</label>
                    <input
                      type="text"
                      value={formData['Mailer:SmtpFromName'] ?? ''}
                      onChange={(e) => handleFieldChange('Mailer:SmtpFromName', e.target.value)}
                      placeholder="Mailer:SmtpFromName"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Sender Email Address</label>
                    <input
                      type="email"
                      value={formData['Mailer:SmtpFromEmail'] ?? ''}
                      onChange={(e) => handleFieldChange('Mailer:SmtpFromEmail', e.target.value)}
                      placeholder="Mailer:SmtpFromEmail"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Reply-To Address</label>
                    <input
                      type="email"
                      value={formData['Mailer:SmtpReplyTo'] ?? ''}
                      onChange={(e) => handleFieldChange('Mailer:SmtpReplyTo', e.target.value)}
                      placeholder="Mailer:SmtpReplyTo"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="font-semibold text-text">Contact Inquiry Inbox</label>
                    <input
                      type="email"
                      value={formData['Mailer:ContactInbox'] ?? ''}
                      onChange={(e) => handleFieldChange('Mailer:ContactInbox', e.target.value)}
                      placeholder="Mailer:ContactInbox"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CONTACT CATEGORY */}
            {activeCategory === 'Contact' && (
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 text-xs">
                <div className="pb-3 border-b border-border">
                  <h2 className="text-base font-bold text-text flex items-center gap-2">
                    <IconPhone className="h-5 w-5 text-primary" />
                    <span>Public Enterprise Support & Contact Channels</span>
                  </h2>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Public contact directory surfaced across tenant and marketing pages.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Support Email</label>
                    <input
                      type="email"
                      value={formData['Contact:SupportEmail'] ?? ''}
                      onChange={(e) => handleFieldChange('Contact:SupportEmail', e.target.value)}
                      placeholder="Contact:SupportEmail"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Sales Email</label>
                    <input
                      type="email"
                      value={formData['Contact:SalesEmail'] ?? ''}
                      onChange={(e) => handleFieldChange('Contact:SalesEmail', e.target.value)}
                      placeholder="Contact:SalesEmail"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Phone Number</label>
                    <input
                      type="text"
                      value={formData['Contact:PhoneNumber'] ?? ''}
                      onChange={(e) => handleFieldChange('Contact:PhoneNumber', e.target.value)}
                      placeholder="Contact:PhoneNumber"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Operating Hours</label>
                    <input
                      type="text"
                      value={formData['Contact:OperatingHours'] ?? ''}
                      onChange={(e) => handleFieldChange('Contact:OperatingHours', e.target.value)}
                      placeholder="Contact:OperatingHours"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="font-semibold text-text">Headquarters Address</label>
                    <input
                      type="text"
                      value={formData['Contact:HeadquartersAddress'] ?? ''}
                      onChange={(e) => handleFieldChange('Contact:HeadquartersAddress', e.target.value)}
                      placeholder="Contact:HeadquartersAddress"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text text-xs focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Dynamic Fallback for Any Additional Backend Keys in Category */}
            {extraCategorySettings.length > 0 && (
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 text-xs">
                <div className="font-bold text-text">Additional {activeCategory} Keys</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {extraCategorySettings.map((item) => (
                    <div key={item.key} className="space-y-1.5">
                      <label className="font-semibold text-text font-mono">{item.key}</label>
                      {item.description && (
                        <div className="text-[11px] text-text-muted">{item.description}</div>
                      )}
                      <input
                        type="text"
                        value={formData[item.key] ?? ''}
                        onChange={(e) => handleFieldChange(item.key, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {saving && <IconLoader className="h-4 w-4 animate-spin" />}
                <span>Save System Settings</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: 'settings',
  component: SettingsPage,
});
