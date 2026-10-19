"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "../AdminLayoutClient";
import { adminService, AdminNewsletterSubscriberDto } from "@/services/admin.service";
import { ADMIN_PERMISSIONS } from "@/constants/permissions";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  IconSearch, 
  IconLoader, 
  IconCopy, 
  IconMail,
  IconDownload,
  IconCircleX,
  IconUsers
} from "@tabler/icons-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminSubscribersPage() {
  const { hasPermission } = useAdmin();
  const [subscribers, setSubscribers] = useState<AdminNewsletterSubscriberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadSubscribers = async () => {
    try {
      setLoading(true);
      const data = await adminService.getNewsletterSubscribers();
      setSubscribers(data);
    } catch (err: any) {
      setError(err.message || "Failed to load newsletter subscribers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission(ADMIN_PERMISSIONS.MANAGE_BLOGS) && !hasPermission(ADMIN_PERMISSIONS.VIEW_TENANTS)) {
      setError("Unauthorized access");
      setLoading(false);
      return;
    }
    loadSubscribers();
  }, [hasPermission]);

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success("Subscriber email copied to clipboard!");
  };

  const handleExportCSV = () => {
    if (subscribers.length === 0) {
      toast.error("No subscriber data to export.");
      return;
    }

    const headers = ["Email", "Source", "Status", "Subscribed At"];
    const rows = filteredSubscribers.map((s) => [
      `"${s.email}"`,
      `"${s.source}"`,
      `"${s.status}"`,
      `"${new Date(s.subscribedAt).toISOString()}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `clinicez_newsletter_subscribers_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Subscriber list exported to CSV!");
  };

  // Filter subscribers
  const filteredSubscribers = subscribers.filter(
    (s) =>
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.source.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading newsletter subscribers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 text-destructive p-8 text-center max-w-xl mx-auto rounded-3xl">
        <IconCircleX className="h-12 w-12 mx-auto mb-4" />
        <CardTitle className="text-lg font-bold">Error Accessing Subscribers</CardTitle>
        <p className="text-sm mt-2 opacity-90 leading-relaxed">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Newsletter &amp; Updates Subscribers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage public audience subscriptions collected from the Clinic EZ website footer, blog, and careers portal.
          </p>
        </div>
        <Button
          onClick={handleExportCSV}
          variant="outline"
          className="rounded-xl flex items-center gap-2 border-slate-200 dark:border-slate-800"
        >
          <IconDownload className="h-4 w-4" />
          Export to CSV
        </Button>
      </div>

      {/* Main Table */}
      <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30 dark:bg-slate-900">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search subscriber email or source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
          <div className="text-xs text-muted-foreground font-semibold flex items-center gap-2">
            <IconUsers className="h-4 w-4 text-primary" />
            <span>Showing {filteredSubscribers.length} of {subscribers.length} subscribers</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="pl-6 py-4 font-bold text-xs uppercase tracking-wider">Email Address</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Subscription Source</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Subscribed Date</TableHead>
                <TableHead className="pr-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubscribers.length > 0 ? (
                filteredSubscribers.map((s) => (
                  <TableRow key={s.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="pl-6 py-4">
                      <span className="font-mono text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {s.email}
                      </span>
                    </td>
                    <td className="py-4">
                      <Badge variant="outline" className="capitalize text-xs font-semibold px-2.5 py-0.5 rounded-full">
                        {s.source}
                      </Badge>
                    </td>
                    <td className="py-4">
                      <Badge
                        variant="outline"
                        className={
                          s.status === "Active"
                            ? "text-emerald-600 border-emerald-200 bg-emerald-50/50 rounded-full font-bold text-[10px]"
                            : "text-slate-500 border-slate-200 bg-slate-50 rounded-full font-bold text-[10px]"
                        }
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td className="py-4 text-xs text-muted-foreground font-semibold">
                      {new Date(s.subscribedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="pr-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyEmail(s.email)}
                          title="Copy email to clipboard"
                          className="h-8 w-8 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        >
                          <IconCopy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          asChild
                          className="rounded-full text-[10px] font-bold px-3 py-1.5 h-8 border-slate-200 dark:border-slate-800 text-primary hover:bg-primary/5"
                        >
                          <a href={`mailto:${s.email}?subject=Clinic%20EZ%20Updates`}>
                            <IconMail className="h-3.5 w-3.5 mr-1" />
                            Email
                          </a>
                        </Button>
                      </div>
                    </td>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-sm">
                    No subscribers found matching your criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
