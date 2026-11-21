"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { forceReleaseBodyScrollLock } from "@/components/dashboard/WorkspaceSearchDialog";
import {
  usePortalNotifications,
  formatNotificationRelativeTime,
  sanitizeNotificationActionUrl,
  filterNotifications,
  type NotificationFilterMode,
  type PortalNotificationItem,
} from "@/hooks/usePortalNotifications";

export interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface NotificationsDialogBodyProps {
  notifications: PortalNotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  error: unknown;
  filter: NotificationFilterMode;
  onFilterChange: (nextFilter: NotificationFilterMode) => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

export function getNotificationSeverityMeta(severity: string): {
  label: string;
  badgeClass: string;
} {
  switch (severity) {
    case "Critical":
      return {
        label: "Critical",
        badgeClass: "bg-destructive/10 text-destructive border-destructive/25",
      };
    case "Warning":
      return {
        label: "Warning",
        badgeClass: "bg-warning/15 text-warning border-warning/30",
      };
    case "Info":
    default:
      return {
        label: "Notice",
        badgeClass: "bg-primary/10 text-primary border-primary/20",
      };
  }
}

function renderSeverityIcon(severity: string) {
  switch (severity) {
    case "Critical":
      return <IconAlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />;
    case "Warning":
      return <IconAlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />;
    case "Info":
    default:
      return <IconInfoCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />;
  }
}

export function NotificationsDialogBody({
  notifications,
  unreadCount,
  isLoading,
  error,
  filter,
  onFilterChange,
  onMarkAsRead,
  onMarkAllAsRead,
  onRefresh,
  onClose,
}: NotificationsDialogBodyProps) {
  const visibleItems: PortalNotificationItem[] = filterNotifications(notifications, filter);

  return (
    <>
      <DialogHeader className="px-5 pt-5 pb-4 border-b border-border space-y-1 text-left">
        <div className="flex items-center justify-between gap-2 pr-8">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base font-bold tracking-tight">
              Notifications
            </DialogTitle>
            {unreadCount > 0 ? (
              <Badge variant="secondary" className="text-xs px-2 py-0 font-semibold">
                {unreadCount} unread
              </Badge>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMarkAllAsRead}
              className="text-xs text-primary h-7 px-2.5 hover:bg-primary/10 cursor-pointer"
            >
              <IconCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <DialogDescription className="text-xs text-muted-foreground">
          Workspace notices, team updates, and operational alerts for your account.
        </DialogDescription>

        <div
          role="group"
          aria-label="Filter notifications"
          className="flex items-center gap-1 pt-2"
        >
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => onFilterChange("all")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            aria-pressed={filter === "unread"}
            onClick={() => onFilterChange("unread")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filter === "unread"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>
      </DialogHeader>

      <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
        {isLoading && notifications.length === 0 ? (
          <div className="p-4 space-y-3" aria-label="Loading notifications">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="flex items-start gap-3 p-2">
                <Skeleton className="h-4 w-4 rounded-full shrink-0 mt-1" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <Skeleton className="h-3.5 w-2/5 rounded" />
                    <Skeleton className="h-3 w-12 rounded" />
                  </div>
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : error && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-2">
            <IconAlertTriangle className="h-8 w-8 text-warning" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">
              Unable to load notifications
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              We could not reach the workspace notification service. Please check your connection and try again.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="mt-2 h-8 text-xs cursor-pointer"
            >
              <IconRefresh className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Try again
            </Button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
            <div className="h-11 w-11 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <IconBell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {filter === "unread" ? "No unread notifications" : "No notifications"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {filter === "unread"
                ? "All workspace alerts have been reviewed."
                : "You're all caught up with your workspace alerts."}
            </p>
            {filter === "unread" && notifications.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onFilterChange("all")}
                className="mt-2 h-7 text-xs text-primary cursor-pointer"
              >
                Show all notifications
              </Button>
            ) : null}
          </div>
        ) : (
          visibleItems.map((item) => {
            const safeUrl = sanitizeNotificationActionUrl(item.actionUrl);
            const severityMeta = getNotificationSeverityMeta(item.severity);
            const handleViewDetailsClick = () => {
              if (!item.isRead) onMarkAsRead(item.id);
              onClose();
            };

            return (
              <div
                key={item.id}
                className={`px-5 py-3.5 flex items-start gap-3 transition-colors ${
                  !item.isRead ? "bg-muted/50" : "hover:bg-muted/30"
                }`}
              >
                {renderSeverityIcon(item.severity)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-xs truncate ${
                          !item.isRead
                            ? "font-semibold text-foreground"
                            : "font-normal text-foreground/85"
                        }`}
                      >
                        {item.title}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] font-semibold shrink-0 ${severityMeta.badgeClass}`}
                      >
                        {severityMeta.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {formatNotificationRelativeTime(item.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">
                    {item.body}
                  </p>

                  {safeUrl || !item.isRead ? (
                    <div className="flex items-center justify-between mt-2 pt-0.5">
                      {safeUrl ? (
                        safeUrl.startsWith("/") ? (
                          <Link
                            href={safeUrl}
                            onClick={handleViewDetailsClick}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <span>View details</span>
                            <IconArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        ) : (
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleViewDetailsClick}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <span>View details</span>
                            <IconArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        )
                      ) : (
                        <span />
                      )}

                      {!item.isRead ? (
                        <button
                          type="button"
                          onClick={() => onMarkAsRead(item.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Mark read</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-5 py-3 border-t border-border bg-muted/30 text-[11px] text-muted-foreground leading-relaxed">
        Workspace and team alerts are delivered here automatically. Facility-specific clinical alert rules are configured inside each facility&apos;s settings.
      </div>
    </>
  );
}

export function NotificationsDialog({ open, onOpenChange }: NotificationsDialogProps) {
  const pathname = usePathname();
  const [filter, setFilter] = useState<NotificationFilterMode>("all");
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    refresh,
  } = usePortalNotifications();

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        forceReleaseBodyScrollLock();
      }
    },
    [onOpenChange],
  );

  // Close dialog and release any Radix scroll/pointer lock on route change
  useEffect(() => {
    if (open) {
      handleOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close dialog cleanly on browser Back/Forward navigation and unmount
  useEffect(() => {
    const handlePopState = () => {
      handleOpenChange(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      forceReleaseBodyScrollLock();
    };
  }, [handleOpenChange]);

  // Refresh notifications whenever the dialog opens
  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden rounded-2xl border-border bg-background text-foreground">
        <NotificationsDialogBody
          notifications={notifications}
          unreadCount={unreadCount}
          isLoading={isLoading}
          error={error}
          filter={filter}
          onFilterChange={setFilter}
          onMarkAsRead={(id) => void markAsRead(id)}
          onMarkAllAsRead={() => void markAllAsRead()}
          onRefresh={() => void refresh()}
          onClose={() => handleOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default NotificationsDialog;
