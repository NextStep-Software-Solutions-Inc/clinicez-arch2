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
  clinicName: string;
  tenantSlug: string;
  facilityType: string;
  ownerName: string;
  email: string;
  createdAt: string;
  subscriptionStatus: string;
  subscriptionPlanId: string;
  isAnnual: boolean;
  clinicalBranchesCount: number;
  staffAccountsCount: number;
  activePatientRecordsCount: number;
  monthlyApiQuotaUsed: number;
  monthlyApiQuotaLimit: number;
}

export interface AdminLeadDto {
  id: string;
  clinicName: string;
  tenantSlug: string;
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
    return res.data;
  },

  getTenantById: async (id: string): Promise<AdminTenantDto | undefined> => {
    const res = await apiClient.get<AdminTenantDto[]>("/admin/tenants");
    return res.data.find(t => t.id === id);
  },

  getTenantBySlug: async (slug: string): Promise<AdminTenantDto | undefined> => {
    const res = await apiClient.get<AdminTenantDto[]>("/admin/tenants");
    return res.data.find(t => t.tenantSlug === slug);
  },

  getLeads: async (): Promise<AdminLeadDto[]> => {
    const res = await apiClient.get<AdminLeadDto[]>("/admin/leads");
    return res.data;
  },

  toggleSubscription: async (id: string): Promise<any> => {
    const res = await apiClient.post<any>(`/admin/tenants/${id}/toggle-subscription`);
    return res.data;
  },

  updateTenantUsage: async (id: string, usage: {
    clinicalBranchesCount: number;
    staffAccountsCount: number;
    activePatientRecordsCount: number;
    monthlyApiQuotaUsed: number;
    monthlyApiQuotaLimit: number;
  }): Promise<any> => {
    const res = await apiClient.post<any>(`/admin/tenants/${id}/usage`, usage);
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
  }
};
