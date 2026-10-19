import React from "react"

export function PlansTabSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 rounded-3xl border border-border bg-card/50 p-8 space-y-6">
          <div className="h-5 bg-muted rounded-lg w-1/4" />
          <div className="h-8 bg-muted rounded-2xl w-1/2" />
          <div className="h-4 bg-muted rounded-xl w-3/4" />
          <div className="h-10 bg-muted rounded-xl w-1/3" />
        </div>
        <div className="rounded-3xl border border-border bg-card/50 p-8 space-y-4">
          <div className="h-5 bg-muted rounded-lg w-1/2" />
          <div className="h-4 bg-muted rounded-xl w-full" />
          <div className="h-4 bg-muted rounded-xl w-2/3" />
        </div>
      </div>
      <div className="space-y-4 border-t pt-6">
        <div className="h-6 bg-muted rounded-lg w-1/3" />
        <div className="h-4 bg-muted rounded-xl w-1/4" />
        <div className="grid md:grid-cols-3 gap-8 mt-6">
          <div className="h-64 bg-muted/40 rounded-3xl" />
          <div className="h-64 bg-muted/40 rounded-3xl" />
          <div className="h-64 bg-muted/40 rounded-3xl" />
        </div>
      </div>
    </div>
  )
}

export function BillingHistorySkeleton() {
  return (
    <div className="rounded-3xl border border-border bg-card/50 shadow-sm overflow-hidden animate-pulse">
      <div className="p-8 border-b border-border/60 bg-muted/20 space-y-2">
        <div className="h-6 bg-muted rounded-lg w-1/4" />
        <div className="h-4 bg-muted rounded-xl w-1/2" />
      </div>
      <div className="p-6 space-y-4">
        <div className="h-10 bg-muted/65 rounded-xl w-full" />
        <div className="h-10 bg-muted/40 rounded-xl w-full" />
        <div className="h-10 bg-muted/65 rounded-xl w-full" />
        <div className="h-10 bg-muted/40 rounded-xl w-full" />
      </div>
    </div>
  )
}

export function OrganizationDetailsSkeleton() {
  return (
    <div className="grid md:grid-cols-3 gap-8 animate-pulse">
      <div className="rounded-3xl border border-border bg-card/50 p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-muted" />
          <div className="space-y-2 flex-grow">
            <div className="h-5 bg-muted rounded-lg w-3/4" />
            <div className="h-3.5 bg-muted rounded-lg w-1/2" />
          </div>
        </div>
        <div className="space-y-4 border-t pt-4">
          <div className="h-4 bg-muted rounded-lg w-3/4" />
          <div className="h-4 bg-muted rounded-lg w-1/2" />
        </div>
      </div>
      <div className="md:col-span-2 rounded-3xl border border-border bg-card/50 p-8 space-y-6">
        <div className="h-6 bg-muted rounded-lg w-1/3" />
        <div className="h-4 bg-muted rounded-xl w-1/2" />
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 bg-muted rounded-lg col-span-2" />
            <div className="h-10 bg-muted rounded-lg" />
            <div className="h-10 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function PaymentMethodSkeleton() {
  return (
    <div className="grid md:grid-cols-3 gap-6 animate-pulse">
      <div className="md:col-span-2 rounded-3xl border border-border bg-card/50 p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-muted" />
          <div className="space-y-2 flex-grow">
            <div className="h-5 bg-muted rounded-lg w-1/3" />
            <div className="h-3.5 bg-muted rounded-lg w-1/4" />
          </div>
        </div>
        <div className="h-24 bg-muted/30 rounded-2xl border" />
      </div>
      <div className="rounded-3xl border border-border bg-card/50 p-8 space-y-6">
        <div className="h-5 bg-muted rounded-lg w-1/2" />
        <div className="h-16 bg-muted/40 rounded-xl" />
        <div className="h-16 bg-muted/40 rounded-xl" />
      </div>
    </div>
  )
}
