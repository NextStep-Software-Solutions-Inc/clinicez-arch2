import { apiClient } from "@/transport/apiClient";

export interface AdminMeDto {
  isAdmin: boolean;
  fullName: string;
  email: string;
  roleName: string;
  permissions: string[];
}

export interface AdminAnalyticsDto {
  totalTenants: number;
  activeSubscribers: number;
  leadsCount: number;
  conversionRate: number;
  totalMRR: number;
  registrationTrends: { date: string; count: number }[];
}

export interface AdminTenantDto {
  id: string;
  name: string;
  clinicName: string;
  tenantSlug: string;
  tenantType: string;
  facilityType: string;
  ownerName: string;
  email: string;
  createdAt: string;
  archivedAt?: string | null;
  subscriptionStatus: string;
  subscriptionPlanId: string;
  isAnnual: boolean;
  facilitiesCount: number;
  clinicalBranchesCount: number;
  staffAccountsCount: number;
  activePatientRecordsCount: number;
  monthlyApiQuotaUsed: number;
  monthlyApiQuotaLimit: number;
  isOrphaned?: boolean;
  orphanReason?: string | null;
  canPurge?: boolean;
}

export interface TenantCleanupPreviewDto {
  tenantId: string;
  tenantSlug: string;
  clinicName: string;
  ownerName: string;
  email: string;
  createdAt: string;
  archivedAt?: string | null;
  subscriptionStatus: string;
  subscriptionPlanId: string;
  facilitiesCount: number;
  staffAccountsCount: number;
  activePatientRecordsCount: number;
  invoicesCount: number;
  receiptsCount: number;
  isEligibleForPurge: boolean;
  ineligibilityReasons: string[];
  isOrphaned: boolean;
  orphanReason?: string | null;
}

export interface AdminLeadDto {
  id: string;
  name: string;
  clinicName: string;
  tenantSlug: string;
  tenantType: string;
  facilityType: string;
  ownerName: string;
  email: string;
  createdAt: string;
  subscriptionStatus: string;
  subscriptionPlanId: string;
}

export interface AdminBlogDto {
  id: string;
  title: string;
  slug: string;
  content: string;
  summary: string;
  author: string;
  category: string;
  status: "Draft" | "Published";
  publishedAt?: string;
  createdAt: string;
  bannerUrl?: string;
  views?: number;
}

export interface PermissionDefinitionDto {
  token: string;
  label: string;
  description: string;
  category?: string;
}

export interface AdminRoleDto {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  createdAt: string;
}

export interface AdminUserDto {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string;
  roleId: string;
  role?: AdminRoleDto;
  isActive: boolean;
  createdAt: string;
}

export interface AdminSystemSettingDto {
  key: string;
  value: string;
  category: string;
  description: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface BillingPlan {
  id: string;
  planId?: string;
  name: string;
  slug: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  priceMonthly?: string | number;
  priceAnnually?: string | number;
  rank: number;
  version: number;
  isArchived?: boolean;
  highlighted?: boolean;
  requiresCheckout?: boolean;
  features: string[];
  limits: Record<string, number>;
  enabledFeatures: string[];
  activeSubscribersCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateBillingPlanPayload {
  name: string;
  slug: string;
  description: string;
  monthlyPrice?: number;
  priceMonthly?: number;
  annualPrice?: number;
  priceAnnually?: number;
  rank: number;
  features?: string[];
  isHighlighted?: boolean;
  requiresCheckout?: boolean;
  limits: Record<string, number>;
  enabledFeatures: string[];
}

export interface UpdateBillingPlanPayload {
  name: string;
  slug: string;
  description: string;
  monthlyPrice?: number;
  priceMonthly?: number;
  annualPrice?: number;
  priceAnnually?: number;
  rank: number;
  features?: string[];
  isHighlighted?: boolean;
  requiresCheckout?: boolean;
  limits: Record<string, number>;
  enabledFeatures: string[];
}

export interface TenantOverridesDto {
  tenantId: string;
  tenantSlug?: string;
  planSlug?: string;
  planName?: string;
  subscriptionStatus?: string;
  entitlementVersion?: number;
  overrides?: Record<string, number | null | boolean>;
  baselineLimits?: Record<string, number>;
  baselineFeatures?: string[];
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
  effectiveLimits: Record<string, number>;
  effectiveFeatures: string[];
  reason?: string | null;
  updatedAt?: string | null;
}

export interface UpdateTenantOverridesPayload {
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
  reason?: string | null;
}

export interface RecordManualPaymentPayload {
  planSlug: string;
  isAnnual: boolean;
  paymentMethod: string;
  transactionReference?: string;
  amount: number;
  notes?: string;
  paymentDate?: string;
}

export interface RecordManualPaymentResult {
  success: boolean;
  invoiceNumber: string;
  receiptNumber: string;
  status: string;
  subscriptionExpiresAt: string;
  entitlementVersion: number;
  facilitiesLicensed: number;
}

export const adminService = {
  getMe: async (): Promise<AdminMeDto> => {
    const res = await apiClient.get<AdminMeDto>("/admin/me");
    return res.data;
  },

  getAnalytics: async (): Promise<AdminAnalyticsDto> => {
    const res = await apiClient.get<AdminAnalyticsDto>("/admin/analytics");
    return res.data;
  },

  getTenants: async (): Promise<AdminTenantDto[]> => {
    const res = await apiClient.get<AdminTenantDto[]>("/admin/tenants");
    return res.data.map(t => ({
      ...t,
      name: t.name || (t as any).clinicName || "",
      clinicName: t.name || (t as any).clinicName || "",
      tenantType: t.tenantType || (t as any).facilityType || "Workplace",
      facilityType: t.tenantType || (t as any).facilityType || "Workplace",
      facilitiesCount: t.facilitiesCount ?? (t as any).clinicalBranchesCount ?? 0,
      clinicalBranchesCount: t.facilitiesCount ?? (t as any).clinicalBranchesCount ?? 0,
      archivedAt: t.archivedAt ?? null,
      isOrphaned: Boolean(t.isOrphaned),
      orphanReason: t.orphanReason ?? null,
      canPurge: Boolean(t.canPurge),
    }));
  },

  getTenantById: async (id: string): Promise<AdminTenantDto | undefined> => {
    const tenants = await adminService.getTenants();
    return tenants.find(t => t.id === id);
  },

  getTenantBySlug: async (slug: string): Promise<AdminTenantDto | undefined> => {
    const tenants = await adminService.getTenants();
    return tenants.find(t => t.tenantSlug === slug);
  },

  getTenantCleanupPreview: async (id: string): Promise<TenantCleanupPreviewDto> => {
    const res = await apiClient.get<TenantCleanupPreviewDto>(`/admin/tenants/${id}/cleanup-preview`);
    return res.data;
  },

  archiveTenant: async (id: string, reason?: string): Promise<{ tenantId: string; tenantSlug: string; archivedAt: string; facilitiesSuspended: number }> => {
    const res = await apiClient.post<{ tenantId: string; tenantSlug: string; archivedAt: string; facilitiesSuspended: number }>(`/admin/tenants/${id}/archive`, { reason });
    return res.data;
  },

  purgeTenant: async (id: string, confirmSlug: string): Promise<{ tenantId: string; freedSlug: string; purgedAt: string }> => {
    const res = await apiClient.delete<{ tenantId: string; freedSlug: string; purgedAt: string }>(`/admin/tenants/${id}/purge?confirmSlug=${encodeURIComponent(confirmSlug)}`);
    return res.data;
  },

  getLeads: async (): Promise<AdminLeadDto[]> => {
    const res = await apiClient.get<AdminLeadDto[]>("/admin/leads");
    return res.data.map(l => ({
      ...l,
      name: l.name || (l as any).clinicName || "",
      clinicName: l.name || (l as any).clinicName || "",
      tenantType: l.tenantType || (l as any).facilityType || "Workplace",
      facilityType: l.tenantType || (l as any).facilityType || "Workplace",
    }));
  },

  toggleSubscription: async (id: string): Promise<any> => {
    const res = await apiClient.post<any>(`/admin/tenants/${id}/toggle-subscription`);
    return res.data;
  },

  updateTenantUsage: async (id: string, usage: {
    facilitiesCount?: number;
    clinicalBranchesCount?: number;
    staffAccountsCount: number;
    activePatientRecordsCount: number;
    monthlyApiQuotaUsed: number;
    monthlyApiQuotaLimit: number;
  }): Promise<any> => {
    const payload = {
      ...usage,
      facilitiesCount: usage.facilitiesCount ?? usage.clinicalBranchesCount ?? 0,
    };
    const res = await apiClient.post<any>(`/admin/tenants/${id}/usage`, payload);
    return res.data;
  },

  getBlogs: async (): Promise<AdminBlogDto[]> => {
    const res = await apiClient.get<AdminBlogDto[]>("/admin/blogs");
    return res.data;
  },

  getBlogById: async (id: string): Promise<AdminBlogDto> => {
    const res = await apiClient.get<AdminBlogDto>(`/admin/blogs/${id}`);
    return res.data;
  },

  createBlog: async (blog: Omit<AdminBlogDto, "id" | "createdAt">): Promise<AdminBlogDto> => {
    const res = await apiClient.post<AdminBlogDto>("/admin/blogs", blog);
    return res.data;
  },

  updateBlog: async (id: string, blog: Partial<AdminBlogDto>): Promise<AdminBlogDto> => {
    const res = await apiClient.put<AdminBlogDto>(`/admin/blogs/${id}`, blog);
    return res.data;
  },

  deleteBlog: async (id: string): Promise<boolean> => {
    const res = await apiClient.delete<boolean>(`/admin/blogs/${id}`);
    return res.data;
  },

  getPermissions: async (): Promise<PermissionDefinitionDto[]> => {
    const res = await apiClient.get<PermissionDefinitionDto[]>("/admin/permissions");
    return res.data;
  },

  getRoles: async (): Promise<AdminRoleDto[]> => {
    const res = await apiClient.get<AdminRoleDto[]>("/admin/roles");
    return res.data;
  },

  createRole: async (role: Omit<AdminRoleDto, "id" | "createdAt">): Promise<AdminRoleDto> => {
    const res = await apiClient.post<AdminRoleDto>("/admin/roles", role);
    return res.data;
  },

  updateRole: async (id: string, role: Partial<AdminRoleDto>): Promise<AdminRoleDto> => {
    const res = await apiClient.put<AdminRoleDto>(`/admin/roles/${id}`, role);
    return res.data;
  },

  deleteRole: async (id: string): Promise<boolean> => {
    const res = await apiClient.delete<boolean>(`/admin/roles/${id}`);
    return res.data;
  },

  getUsers: async (): Promise<AdminUserDto[]> => {
    const res = await apiClient.get<AdminUserDto[]>("/admin/users");
    return res.data;
  },

  createUser: async (user: Omit<AdminUserDto, "id" | "createdAt" | "clerkUserId" | "isActive">): Promise<AdminUserDto> => {
    const res = await apiClient.post<AdminUserDto>("/admin/users", user);
    return res.data;
  },

  updateUser: async (id: string, user: Partial<AdminUserDto>): Promise<AdminUserDto> => {
    const res = await apiClient.put<AdminUserDto>(`/admin/users/${id}`, user);
    return res.data;
  },

  deleteUser: async (id: string): Promise<boolean> => {
    const res = await apiClient.delete<boolean>(`/admin/users/${id}`);
    return res.data;
  },

  getSettings: async (): Promise<AdminSystemSettingDto[]> => {
    const res = await apiClient.get<AdminSystemSettingDto[]>("/admin/settings");
    return res.data;
  },

  updateSettings: async (settings: Record<string, string>): Promise<AdminSystemSettingDto[]> => {
    const res = await apiClient.put<AdminSystemSettingDto[]>("/admin/settings", settings);
    return res.data;
  },

  getPlans: async (): Promise<BillingPlan[]> => {
    const res = await apiClient.get<any[]>("/admin/plans");
    return res.data.map((p) => {
      const monthly = typeof p.priceMonthly === "number" ? p.priceMonthly : (p.priceMonthly === "Custom" ? 0 : parseFloat(p.priceMonthly) || 0);
      const annual = typeof p.priceAnnually === "number" ? p.priceAnnually : (p.priceAnnually === "Custom" ? 0 : parseFloat(p.priceAnnually) || 0);
      return {
        id: p.planId || p.id,
        planId: p.planId || (p.id?.length === 36 ? p.id : undefined),
        slug: p.slug || p.id,
        name: p.name,
        description: p.description,
        monthlyPrice: p.monthlyPrice ?? monthly,
        annualPrice: p.annualPrice ?? annual,
        priceMonthly: p.priceMonthly,
        priceAnnually: p.priceAnnually,
        rank: p.rank ?? 0,
        version: p.version ?? 1,
        isArchived: false,
        highlighted: p.highlighted ?? p.isHighlighted ?? false,
        requiresCheckout: p.requiresCheckout ?? false,
        features: p.features || [],
        limits: p.limits || {},
        enabledFeatures: p.enabledFeatures || [],
        activeSubscribersCount: p.activeSubscribersCount ?? 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });
  },

  createPlan: async (payload: CreateBillingPlanPayload): Promise<{ id: string } | BillingPlan> => {
    const body = {
      name: payload.name,
      slug: payload.slug,
      description: payload.description,
      rank: payload.rank,
      priceMonthly: payload.priceMonthly ?? payload.monthlyPrice ?? 0,
      priceAnnually: payload.priceAnnually ?? payload.annualPrice ?? 0,
      isHighlighted: payload.isHighlighted ?? false,
      requiresCheckout: payload.requiresCheckout ?? false,
      features: payload.features ?? [],
      limits: payload.limits ?? {},
      enabledFeatures: payload.enabledFeatures ?? [],
    };
    const res = await apiClient.post<{ id: string }>("/admin/plans", body);
    return res.data;
  },

  updatePlan: async (id: string, payload: UpdateBillingPlanPayload): Promise<boolean> => {
    const body = {
      id,
      name: payload.name,
      slug: payload.slug,
      description: payload.description,
      rank: payload.rank,
      priceMonthly: payload.priceMonthly ?? payload.monthlyPrice ?? 0,
      priceAnnually: payload.priceAnnually ?? payload.annualPrice ?? 0,
      isHighlighted: payload.isHighlighted ?? false,
      requiresCheckout: payload.requiresCheckout ?? false,
      features: payload.features ?? [],
      limits: payload.limits ?? {},
      enabledFeatures: payload.enabledFeatures ?? [],
    };
    const res = await apiClient.put<any>(`/admin/plans/${id}`, body);
    return res.data?.success ?? true;
  },

  deletePlan: async (id: string): Promise<boolean> => {
    const res = await apiClient.delete<any>(`/admin/plans/${id}`);
    return res.data?.success ?? true;
  },

  checkPlanSlug: async (slug: string, excludePlanId?: string): Promise<{ available: boolean; slug: string; message: string }> => {
    const params = new URLSearchParams({ slug });
    if (excludePlanId) params.append("excludePlanId", excludePlanId);
    const res = await apiClient.get<{ available: boolean; slug: string; message: string }>(`/admin/plans/check-slug?${params.toString()}`);
    return res.data;
  },

  getTenantOverrides: async (tenantId: string): Promise<TenantOverridesDto> => {
    const res = await apiClient.get<TenantOverridesDto>(`/admin/tenants/${tenantId}/overrides`);
    const data = res.data;
    return {
      ...data,
      overrides: {
        ...(data.limits || {}),
        ...(data.features || {}),
      },
      baselineLimits: data.baselineLimits ?? {},
      baselineFeatures: data.baselineFeatures ?? [],
      effectiveLimits: data.effectiveLimits ?? {},
      effectiveFeatures: data.effectiveFeatures ?? [],
    };
  },

  updateTenantOverrides: async (tenantId: string, payload: UpdateTenantOverridesPayload): Promise<TenantOverridesDto> => {
    const res = await apiClient.put<TenantOverridesDto>(`/admin/tenants/${tenantId}/overrides`, payload);
    const data = res.data;
    return {
      ...data,
      overrides: {
        ...(data.limits || {}),
        ...(data.features || {}),
      },
      baselineLimits: data.baselineLimits ?? {},
      baselineFeatures: data.baselineFeatures ?? [],
      effectiveLimits: data.effectiveLimits ?? {},
      effectiveFeatures: data.effectiveFeatures ?? [],
    };
  },

  recordManualPayment: async (tenantId: string, payload: RecordManualPaymentPayload): Promise<RecordManualPaymentResult> => {
    const res = await apiClient.post<RecordManualPaymentResult>(`/admin/tenants/${tenantId}/record-payment`, payload);
    return res.data;
  }
};
