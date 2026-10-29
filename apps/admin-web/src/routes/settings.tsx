import React, { useEffect, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import { adminService, AdminSystemSettingDto } from '@/services/admin.service';
import { toast } from 'sonner';
import {
  IconSettings,
  IconRefresh,
  IconBuildingBank,
  IconReceiptTax,
  IconShieldCheck,
  IconPlus,
  IconTrash,
  IconLoader,
  IconCheck,
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

export const DEFAULT_BANK_ACCOUNTS: PlatformBankAccount[] = [
  {
    id: 'bdo',
    institution: 'BDO Unibank',
    accountName: 'Nextstep Software Corporation',
    accountNumber: '0012-3456-7890',
    copyValue: '0012-3456-7890',
    branch: 'BGC Corporate Center',
    type: 'bank',
    badge: 'Commercial Bank',
    isActive: true,
  },
  {
    id: 'bpi',
    institution: 'Bank of the Philippine Islands (BPI)',
    accountName: 'Nextstep Software Corporation',
    accountNumber: '4321-8765-09',
    copyValue: '4321-8765-09',
    branch: 'Ayala Triangle',
    type: 'bank',
    badge: 'Commercial Bank',
    isActive: true,
  },
  {
    id: 'gcash-maya',
    institution: 'GCash / Maya',
    accountName: 'Nextstep Software Corporation',
    accountNumber: '0917-123-EZPH (0917-123-3974)',
    copyValue: '0917-123-3974',
    branch: 'Merchant QR / Mobile Wallet',
    type: 'ewallet',
    badge: 'Instant E-Wallet',
    isActive: true,
  },
];

export function validateBankAccountsPayload(accounts: any[]): { valid: boolean; error?: string } {
  if (!Array.isArray(accounts)) {
    return { valid: false, error: 'Payload must be an array of bank accounts' };
  }
  for (const acc of accounts) {
    if (!acc.institution || !String(acc.institution).trim()) {
      return { valid: false, error: 'Bank account institution is required' };
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
  const [bankAccounts, setBankAccounts] = useState<PlatformBankAccount[]>(DEFAULT_BANK_ACCOUNTS);
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

      // Default values if unset
      if (!map['Billing:VatRatePercent']) map['Billing:VatRatePercent'] = '12';
      if (!map['Billing:BirVatRegistrationNumber']) map['Billing:BirVatRegistrationNumber'] = '000-123-456-000';
      if (!map['Billing:IsOnlinePaymentReady']) map['Billing:IsOnlinePaymentReady'] = 'true';
      if (!map['Workspace:OrphanInactivityDaysThreshold']) map['Workspace:OrphanInactivityDaysThreshold'] = '90';
      if (!map['Workspace:OrphanAutoPurgeEnabled']) map['Workspace:OrphanAutoPurgeEnabled'] = 'false';
      if (!map['Workspace:OrphanAutoPurgeGraceDays']) map['Workspace:OrphanAutoPurgeGraceDays'] = '14';

      setFormData(map);

      if (map['Billing:BankAccountsJson']) {
        try {
          const parsed = JSON.parse(map['Billing:BankAccountsJson']);
          if (Array.isArray(parsed)) {
            setBankAccounts(parsed);
          }
        } catch {
          // keep defaults
        }
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
      accountName: 'Nextstep Software Corporation',
      accountNumber: '',
      branch: 'Main Branch',
      type: 'bank',
      badge: 'Commercial Bank',
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

    // Validate bank accounts
    const validation = validateBankAccountsPayload(bankAccounts);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setSaving(true);
    try {
      const updatedFormData = {
        ...formData,
        'Billing:BankAccountsJson': JSON.stringify(bankAccounts),
      };

      const settingsArray: AdminSystemSettingDto[] = Object.entries(updatedFormData).map(
        ([key, value]) => {
          let cat = 'Billing';
          if (key.startsWith('Licensing:')) cat = 'Licensing';
          else if (key.startsWith('Storage:')) cat = 'Storage';
          else if (key.startsWith('Mailer:')) cat = 'Mailer';
          else if (key.startsWith('Contact:')) cat = 'Contact';
          else if (key.startsWith('Workspace:') || key.startsWith('Lifecycle:')) cat = 'Lifecycle';

          return {
            key,
            value: String(value),
            category: cat,
            description: key,
          };
        }
      );

      await adminService.updateSettings(settingsArray);
      toast.success('Platform system configuration updated successfully.');
      await loadSettings();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

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
                  Configure statutory Philippine VAT compliance, checkout gateway readiness, and multi-bank manual payment accounts.
                </p>
              </div>

              {/* Online Payment Switch */}
              <div className="p-4 rounded-xl bg-surface-muted border border-border flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-text text-sm">Online Payment Gateway Readiness</div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    When active, clinics can settle subscriptions via Maya/PayMongo/Stripe. When disabled, offline manual N-Bank routing is enforced.
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
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    formData['Billing:IsOnlinePaymentReady'] === 'true'
                      ? 'bg-primary text-white'
                      : 'bg-surface border border-border text-text-muted hover:text-text'
                  }`}
                >
                  {formData['Billing:IsOnlinePaymentReady'] === 'true' ? 'Gateway Active' : 'Gateway Offline'}
                </button>
              </div>

              {/* VAT Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-text">BIR VAT Statutory Rate (%)</label>
                  <input
                    type="number"
                    value={formData['Billing:VatRatePercent'] || '12'}
                    onChange={(e) => handleFieldChange('Billing:VatRatePercent', e.target.value)}
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">BIR VAT Registration Number (TIN)</label>
                  <input
                    type="text"
                    value={formData['Billing:BirVatRegistrationNumber'] || ''}
                    onChange={(e) => handleFieldChange('Billing:BirVatRegistrationNumber', e.target.value)}
                    placeholder="000-123-456-000"
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                  />
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

                <div className="space-y-3">
                  {bankAccounts.map((acc, idx) => (
                    <div
                      key={acc.id || idx}
                      className="p-4 rounded-xl bg-surface-muted border border-border space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-border">
                        <span className="font-semibold text-text">
                          Account #{idx + 1}: {acc.institution || 'Untitled Bank'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveBankAccount(idx)}
                          className="text-red-600 hover:text-red-700 p-1 rounded cursor-pointer"
                          title="Remove Account"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-text-muted">Institution Name</label>
                          <input
                            type="text"
                            value={acc.institution}
                            onChange={(e) => handleUpdateBankAccount(idx, 'institution', e.target.value)}
                            placeholder="e.g. BDO Unibank"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-hidden"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-text-muted">Account Number</label>
                          <input
                            type="text"
                            value={acc.accountNumber}
                            onChange={(e) => handleUpdateBankAccount(idx, 'accountNumber', e.target.value)}
                            placeholder="0012-3456-7890"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-text-muted">Account Name</label>
                          <input
                            type="text"
                            value={acc.accountName}
                            onChange={(e) => handleUpdateBankAccount(idx, 'accountName', e.target.value)}
                            placeholder="Nextstep Software Corporation"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-hidden"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-text-muted">Branch / Channel</label>
                          <input
                            type="text"
                            value={acc.branch || ''}
                            onChange={(e) => handleUpdateBankAccount(idx, 'branch', e.target.value)}
                            placeholder="BGC Corporate Center"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-hidden"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
                  Configure automatic pruning of orphaned test clinics and offboarded database workspaces.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-muted border border-border flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-text text-sm">Automated Orphan Purging</div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    When enabled, workspaces with 0 patients and no login past the threshold are auto-purged.
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
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
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
                    value={formData['Workspace:OrphanInactivityDaysThreshold'] || '90'}
                    onChange={(e) =>
                      handleFieldChange('Workspace:OrphanInactivityDaysThreshold', e.target.value)
                    }
                    min={7}
                    max={365}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Grace Notification Period (Days)</label>
                  <input
                    type="number"
                    value={formData['Workspace:OrphanAutoPurgeGraceDays'] || '14'}
                    onChange={(e) =>
                      handleFieldChange('Workspace:OrphanAutoPurgeGraceDays', e.target.value)
                    }
                    min={1}
                    max={60}
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
                  <span>Platform Licensing & Cryptographic Entitlements</span>
                </h2>
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-text">Platform License Authority Key</label>
                <input
                  type="text"
                  value={formData['Licensing:AuthorityKey'] || 'CLINICEZ-ENTITLEMENTS-AUTH-KEY-P256'}
                  onChange={(e) => handleFieldChange('Licensing:AuthorityKey', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {/* STORAGE CATEGORY */}
          {activeCategory === 'Storage' && (
            <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 text-xs">
              <div className="pb-3 border-b border-border">
                <h2 className="text-base font-bold text-text flex items-center gap-2">
                  <IconCloud className="h-5 w-5 text-primary" />
                  <span>Cloud Document Storage & Encryption</span>
                </h2>
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-text">GCS / S3 Storage Bucket</label>
                <input
                  type="text"
                  value={formData['Storage:DefaultBucket'] || 'clinicez-vault-prod'}
                  onChange={(e) => handleFieldChange('Storage:DefaultBucket', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {/* MAILER CATEGORY */}
          {activeCategory === 'Mailer' && (
            <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 text-xs">
              <div className="pb-3 border-b border-border">
                <h2 className="text-base font-bold text-text flex items-center gap-2">
                  <IconMail className="h-5 w-5 text-primary" />
                  <span>Transactional Mailer & Dispatch</span>
                </h2>
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-text">Outbound Sender Identity</label>
                <input
                  type="text"
                  value={formData['Mailer:SenderEmail'] || 'governance@clinicez.com'}
                  onChange={(e) => handleFieldChange('Mailer:SenderEmail', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                />
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
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-text">Customer Care Hotline</label>
                <input
                  type="text"
                  value={formData['Contact:Hotline'] || '+63 (02) 8123-4567'}
                  onChange={(e) => handleFieldChange('Contact:Hotline', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                />
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
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: 'settings',
  component: SettingsPage,
});
