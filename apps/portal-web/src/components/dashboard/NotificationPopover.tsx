"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBell,
  IconCheck,
  IconAlertTriangle,
  IconInfoCircle,
  IconAlertCircle,
  IconArrowUpRight,
  IconRefresh,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  usePortalNotifications,
  formatNotificationRelativeTime,
  sanitizeNotificationActionUrl,
  type PortalNotificationItem,
} from "@/hooks/usePortalNotifications";

export type { PortalNotificationItem };

export function NotificationPopover() {
  const pathname = usePathname();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const open = openPathname !== null && openPathname === pathname;
  const setOpen = (nextOpen: boolean) => {
    setOpenPathname(nextOpen ? (pathname ?? "") : null);
  };
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    refresh,
  } = usePortalNotifications();

  const handleMarkAsRead = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    void markAsRead(id);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "Critical":
        return <IconAlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />;
      case "Warning":
        return <IconAlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />;
      case "Info":
      default:
        return <IconInfoCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg cursor-pointer"
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <IconBell className="h-5 w-5 text-foreground" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white shadow-xs">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label="Workspace notifications"
        className="w-80 sm:w-96 rounded-xl p-0 shadow-lg border border-border bg-popover text-popover-foreground"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
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
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void markAllAsRead()}
              className="text-xs text-primary h-7 px-2 hover:bg-primary/10 cursor-pointer"
            >
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {isLoading && notifications.length === 0 ? (
            <div className="p-3.5 space-y-3" aria-label="Loading notifications">
              {[0, 1].map((idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <Skeleton className="h-4 w-4 rounded-full shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-1/2 rounded" />
                    <Skeleton className="h-3 w-full rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : error && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 px-4 text-center gap-1.5">
              <IconAlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />
              <p className="text-xs font-medium text-foreground">
                Unable to load notifications
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
                className="mt-1 h-7 text-xs cursor-pointer"
              >
                <IconRefresh className="h-3 w-3 mr-1" aria-hidden="true" />
                Retry
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <IconBell className="h-8 w-8 text-muted-foreground/60 mb-2" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">
                No notifications
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You&apos;re all caught up with your workspace alerts.
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const safeUrl = sanitizeNotificationActionUrl(item.actionUrl);
              const handleViewClick = () => {
                if (!item.isRead) handleMarkAsRead(item.id);
                setOpen(false);
              };

              return (
                <div
                  key={item.id}
                  className={`p-3.5 flex items-start gap-3 transition-colors ${
                    !item.isRead
                      ? "bg-muted/50"
                      : "hover:bg-muted/30"
                  }`}
                >
                  {getSeverityIcon(item.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs truncate ${
                          !item.isRead
                            ? "font-semibold text-foreground"
                            : "font-normal text-foreground/85"
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatNotificationRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                      {item.body}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-1">
                      {safeUrl ? (
                        safeUrl.startsWith("/") ? (
                          <Link
                            href={safeUrl}
                            onClick={handleViewClick}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            <span>View</span>
                            <IconArrowUpRight className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        ) : (
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleViewClick}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            <span>View</span>
                            <IconArrowUpRight className="h-3 w-3" aria-hidden="true" />
                          </a>
                        )
                      ) : (
                        <span />
                      )}

                      {!item.isRead ? (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(item.id, e)}
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <IconCheck className="h-3 w-3" aria-hidden="true" />
                          <span>Mark read</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
