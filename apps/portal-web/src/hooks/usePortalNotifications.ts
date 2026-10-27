"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { apiClient } from "@/transport/apiClient";

export interface PortalNotificationItem {
  id: string;
  tenantId: string;
  userId?: string | null;
  title: string;
  body: string;
  category: string;
  severity: "Info" | "Warning" | "Critical";
  actionUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface PortalNotificationListPayload {
  items: PortalNotificationItem[];
  unreadCount: number;
}

export type NotificationFilterMode = "all" | "unread";

export const PORTAL_NOTIFICATIONS_SWR_KEY = "/portal/notifications";

function normalizeTenantSlug(tenant?: string | string[] | null): string {
  const raw = Array.isArray(tenant) ? tenant[0] : tenant;
  return typeof raw === "string" ? raw.trim() : "";
}

export function buildPortalNotificationsKey(
  tenant?: string | string[] | null,
): string {
  const slug = normalizeTenantSlug(tenant);
  if (!slug) {
    return PORTAL_NOTIFICATIONS_SWR_KEY;
  }
  return `${PORTAL_NOTIFICATIONS_SWR_KEY}?tenantSlug=${encodeURIComponent(slug)}`;
}

export function buildMarkAllNotificationsReadUrl(
  tenant?: string | string[] | null,
): string {
  const slug = normalizeTenantSlug(tenant);
  if (!slug) {
    return "/portal/notifications/read-all";
  }
  return `/portal/notifications/read-all?tenantSlug=${encodeURIComponent(slug)}`;
}

export function formatNotificationRelativeTime(
  dateStr: string,
  nowMs: number = Date.now(),
): string {
  if (!dateStr) return "";
  const parsedMs = new Date(dateStr).getTime();
  if (Number.isNaN(parsedMs)) return dateStr;

  const diffSecs = Math.floor((nowMs - parsedMs) / 1000);
  if (diffSecs < 60) return "Just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(parsedMs).toLocaleDateString();
}

/**
 * Permits only safe internal application paths (`/path`, excluding protocol-relative `//`)
 * or explicit `https://` / `http://` URLs. Rejects `javascript:`, `data:`, `vbscript:`, etc.
 */
export function sanitizeNotificationActionUrl(url?: string | null): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

export function applyMarkNotificationRead(
  current: PortalNotificationListPayload | undefined,
  id: string,
): PortalNotificationListPayload {
  if (!current) {
    return { items: [], unreadCount: 0 };
  }

  let wasUnread = false;
  const items = current.items.map((item) => {
    if (item.id !== id) return item;
    if (!item.isRead) {
      wasUnread = true;
    }
    return { ...item, isRead: true };
  });

  const unreadCount = wasUnread
    ? Math.max(0, current.unreadCount - 1)
    : current.unreadCount;

  return { items, unreadCount };
}

export function applyMarkAllNotificationsRead(
  current: PortalNotificationListPayload | undefined,
): PortalNotificationListPayload {
  if (!current) {
    return { items: [], unreadCount: 0 };
  }

  return {
    items: current.items.map((item) =>
      item.isRead ? item : { ...item, isRead: true },
    ),
    unreadCount: 0,
  };
}

export function filterNotifications(
  items: PortalNotificationItem[],
  filter: NotificationFilterMode,
): PortalNotificationItem[] {
  if (!Array.isArray(items)) return [];
  if (filter === "unread") {
    return items.filter((item) => !item.isRead);
  }
  return items;
}

export async function fetchPortalNotifications(
  url: string = PORTAL_NOTIFICATIONS_SWR_KEY,
): Promise<PortalNotificationListPayload> {
  const res = await apiClient.get(url);
  if (!res.data?.succeeded) {
    throw new Error(res.data?.message || "Unable to load notifications.");
  }
  const payload = res.data?.data;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const unreadCount =
    typeof payload?.unreadCount === "number"
      ? Math.max(0, payload.unreadCount)
      : items.filter((i: PortalNotificationItem) => !i.isRead).length;
  return { items, unreadCount };
}

export function usePortalNotifications() {
  const params = useParams<{ tenant?: string | string[] }>();
  const tenant = params?.tenant;
  const swrKey = buildPortalNotificationsKey(tenant);

  const { data, error, isLoading, mutate } = useSWR<PortalNotificationListPayload>(
    swrKey,
    fetchPortalNotifications,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 5_000,
    },
  );

  const notifications = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markAsRead = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        await mutate(
          async (current) => {
            const nextState = applyMarkNotificationRead(current, id);
            const res = await apiClient.post(
              `/portal/notifications/${encodeURIComponent(id)}/read`,
            );
            if (res.data && res.data.succeeded === false) {
              throw new Error(
                res.data.message || "Unable to mark notification as read.",
              );
            }
            return nextState;
          },
          {
            optimisticData: (current) => applyMarkNotificationRead(current, id),
            rollbackOnError: true,
            revalidate: false,
          },
        );
      } catch {
        toast.error("Unable to mark notification as read. Please try again.");
      }
    },
    [mutate],
  );

  const markAllAsRead = useCallback(async () => {
    const readAllUrl = buildMarkAllNotificationsReadUrl(tenant);
    try {
      await mutate(
        async (current) => {
          const nextState = applyMarkAllNotificationsRead(current);
          const res = await apiClient.post(readAllUrl);
          if (res.data && res.data.succeeded === false) {
            throw new Error(
              res.data.message || "Unable to mark notifications as read.",
            );
          }
          return nextState;
        },
        {
          optimisticData: (current) => applyMarkAllNotificationsRead(current),
          rollbackOnError: true,
          revalidate: false,
        },
      );
    } catch {
      toast.error("Unable to mark all notifications as read. Please try again.");
    }
  }, [mutate, tenant]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    refresh,
  };
}
