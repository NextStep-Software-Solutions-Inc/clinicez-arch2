"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  IconBell,
  IconCheck,
  IconAlertTriangle,
  IconInfoCircle,
  IconAlertCircle,
  IconArrowUpRight,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiClient } from "@/transport/apiClient";
import Link from "next/link";

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

function formatRelativeTime(dateStr: string): string {
  try {
    const diffSecs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diffSecs < 60) return "Just now";
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

export function NotificationPopover() {
  const [notifications, setNotifications] = useState<PortalNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get("/portal/notifications");
      if (res.data?.succeeded && res.data.data) {
        setNotifications(res.data.data.items || []);
        setUnreadCount(res.data.data.unreadCount ?? 0);
      }
    } catch {
      // Background poll failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (isMounted) {
        await fetchNotifications();
      }
    };
    void load();
    const interval = setInterval(() => {
      if (isMounted) void fetchNotifications();
    }, 30_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      await apiClient.post(`/portal/notifications/${id}/read`);
    } catch {
      fetchNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      await apiClient.post("/portal/notifications/read-all");
    } catch {
      fetchNotifications();
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "Critical":
        return <IconAlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />;
      case "Warning":
        return <IconAlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
      case "Info":
      default:
        return <IconInfoCircle className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg"
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <IconBell className="h-5 w-5 text-slate-700 dark:text-slate-200" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 sm:w-96 rounded-xl p-0 shadow-lg border border-slate-200 dark:border-slate-800"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 ? (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {unreadCount} new
              </Badge>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs text-primary h-7 px-2 hover:bg-primary/10"
            >
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <IconBell className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No notifications
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                You're all caught up with your workspace alerts.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 flex items-start gap-3 transition-colors ${
                  !item.isRead
                    ? "bg-slate-50/80 dark:bg-slate-900/50"
                    : "hover:bg-slate-50 dark:hover:bg-slate-900/30"
                }`}
              >
                {getSeverityIcon(item.severity)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs truncate ${
                        !item.isRead ? "font-semibold text-slate-900 dark:text-slate-100" : "font-normal text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {item.title}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                    {item.body}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-1">
                    {item.actionUrl ? (
                      <Link
                        href={item.actionUrl}
                        onClick={() => {
                          if (!item.isRead) handleMarkAsRead(item.id);
                          setOpen(false);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        <span>View</span>
                        <IconArrowUpRight className="h-3 w-3" />
                      </Link>
                    ) : <span />}

                    {!item.isRead ? (
                      <button
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                        className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        <IconCheck className="h-3 w-3" />
                        <span>Mark read</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
