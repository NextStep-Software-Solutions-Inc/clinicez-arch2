"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "../AdminLayoutClient";
import { adminService, AdminLeadDto } from "@/services/admin.service";
import { ADMIN_PERMISSIONS } from "@/constants/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  IconAddressBook, 
  IconSearch, 
  IconLoader, 
  IconCopy, 
  IconMail,
  IconAlertCircle, 
  IconCircleX 
} from "@tabler/icons-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminLeadsPage() {
  const { hasPermission } = useAdmin();
  const [leads, setLeads] = useState<AdminLeadDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadLeads = async () => {
    try {
      setLoading(true);
      const data = await adminService.getLeads();
      setLeads(data);
    } catch (err: any) {
      setError(err.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission(ADMIN_PERMISSIONS.VIEW_TENANTS)) {
      setError("Unauthorized access");
      setLoading(false);
      return;
    }
    loadLeads();
  }, [hasPermission]);

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success("Lead email copied to clipboard!");
  };

  // Filter leads
  const filteredLeads = leads.filter(l => 
    l.clinicName.toLowerCase().includes(search.toLowerCase()) ||
    l.ownerName.toLowerCase().includes(search.toLowerCase()) ||
    l.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading registration leads...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 text-destructive p-8 text-center max-w-xl mx-auto rounded-3xl">
        <IconCircleX className="h-12 w-12 mx-auto mb-4" />
        <CardTitle className="text-lg font-bold">Error Accessing Leads</CardTitle>
        <p className="text-sm mt-2 opacity-90 leading-relaxed">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Leads Conversion Monitor</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor clinics that completed onboarding but have not subscribed to a paid tier. Reach out to convert them.
        </p>
      </div>

      {/* Main Table */}
      <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30 dark:bg-slate-900">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search clinic name, email, owner..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
          <div className="text-xs text-muted-foreground font-semibold">
            Showing {filteredLeads.length} of {leads.length} leads
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="pl-6 py-4 font-bold text-xs uppercase tracking-wider">Clinic Name</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Tenant Link</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Facility Type</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Owner Contact</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Trial Status</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Registered On</TableHead>
                <TableHead className="pr-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length > 0 ? (
                filteredLeads.map((l) => (
                  <TableRow key={l.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="pl-6 py-4 font-bold text-sm text-slate-800 dark:text-slate-200">
                      {l.clinicName}
                    </td>
                    <td className="py-4 font-mono text-xs text-primary font-semibold">
                      /{l.tenantSlug}
                    </td>
                    <td className="py-4 text-xs font-semibold text-muted-foreground capitalize">
                      {l.facilityType.replace(/_/g, " ")}
                    </td>
                    <td className="py-4">
                      <div className="text-xs">
                        <p className="font-bold text-slate-700 dark:text-slate-300">{l.ownerName}</p>
                        <p className="text-muted-foreground font-mono">{l.email}</p>
                      </div>
                    </td>
                    <td className="py-4">
                      <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50/50 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
                        <IconAlertCircle className="h-3.5 w-3.5" />
                        Unsubscribed Trial ({l.subscriptionStatus})
                      </Badge>
                    </td>
                    <td className="py-4 text-xs text-muted-foreground font-semibold">
                      {new Date(l.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                      })}
                    </td>
                    <td className="pr-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyEmail(l.email)}
                          className="h-8 w-8 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        >
                          <IconCopy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          asChild
                          className="rounded-full text-[10px] font-bold px-3 py-1.5 h-8 border-slate-200 dark:border-slate-800 text-primary hover:bg-primary/5"
                        >
                          <a href={`mailto:${l.email}?subject=Boost%20Your%20Clinic%20Management%20with%20Clinic%20EZ!&body=Hi%20${l.ownerName},%0D%0A%0D%0AThank%20you%20for%20registering%20${l.clinicName}%20on%20Clinic%20EZ.%20We%20noticed%20you%20haven't%20subscribed%20to%20our%20plans%20yet...`}>
                            <IconMail className="h-3.5 w-3.5 mr-1" />
                            Email Lead
                          </a>
                        </Button>
                      </div>
                    </td>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-sm">
                    No unsubscribed leads found. Awesome!
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
