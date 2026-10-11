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
  subscriptionStatus: string;
  subscriptionPlanId: string;
  isAnnual: boolean;
  facilitiesCount: number;
  clinicalBranchesCount: number;
  staffAccountsCount: number;
  activePatientRecordsCount: number;
  monthlyApiQuotaUsed: number;
  monthlyApiQuotaLimit: number;
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

  getRoles: async (): Promise<AdminRoleDto[]> => {
    const res = await apiClient.get<AdminRoleDto[]>("/admin/roles");
    return res.data;
  },

  createRole: async (role: Omit<AdminRoleDto, "id" | "createdAt">): Promise<AdminRoleDto> => {
    const res = await apiClient.post<AdminRoleDto>("/admin/roles", role);
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
  }
};
