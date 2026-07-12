import React from "react"

export default function BillingLoading() {
  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted rounded-2xl" />
          <div className="h-4 w-96 bg-muted/60 rounded-xl" />
        </div>
        <div className="h-10 w-40 bg-muted rounded-full" />
      </div>

      {/* Tabs navigation bar skeleton */}
      <div className="flex items-center gap-2 bg-muted/45 p-1.5 rounded-full border border-border/40 w-fit">
        <div className="h-8 w-24 bg-muted rounded-full" />
        <div className="h-8 w-28 bg-muted rounded-full" />
        <div className="h-8 w-36 bg-muted rounded-full" />
        <div className="h-8 w-28 bg-muted rounded-full" />
      </div>

      {/* Active Subscription Cards Skeleton Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 relative overflow-hidden rounded-3xl border border-primary/10 bg-card/40 p-8 space-y-6">
          <div className="h-5 w-40 bg-muted rounded-xl" />
          <div className="space-y-2">
            <div className="h-8 w-72 bg-muted rounded-2xl" />
            <div className="h-4 w-96 bg-muted/60 rounded-xl" />
          </div>
          <div className="h-10 w-48 bg-muted rounded-2xl" />
          <div className="pt-4 border-t border-border flex gap-4">
            <div className="h-5 w-36 bg-muted/60 rounded-lg" />
            <div className="h-5 w-44 bg-muted/60 rounded-lg" />
          </div>
        </div>
        
        <div className="rounded-3xl border border-border bg-card/40 p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="h-6 w-44 bg-muted rounded-xl" />
            <div className="space-y-1.5">
              <div className="h-4 w-full bg-muted/60 rounded-lg" />
              <div className="h-4 w-full bg-muted/60 rounded-lg" />
              <div className="h-4 w-2/3 bg-muted/60 rounded-lg" />
            </div>
          </div>
          <div className="h-10 w-full bg-muted rounded-full" />
        </div>
      </div>

      {/* Pricing Cards Section Skeleton */}
      <div className="space-y-6 border-t pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-6 w-56 bg-muted rounded-xl" />
            <div className="h-4 w-80 bg-muted/60 rounded-lg" />
          </div>
          <div className="h-10 w-36 bg-muted rounded-full" />
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="flex flex-col rounded-3xl border border-border bg-card/40 p-8 space-y-6">
              <div className="space-y-2">
                <div className="h-6 w-32 bg-muted rounded-xl" />
                <div className="h-4 w-48 bg-muted/60 rounded-lg" />
              </div>
              <div className="h-10 w-28 bg-muted rounded-xl" />
              <ul className="space-y-3 flex-grow">
                {[1, 2, 3, 4].map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <div className="h-5 w-5 bg-muted rounded-full shrink-0" />
                    <div className="h-4 w-full bg-muted/50 rounded-lg" />
                  </li>
                ))}
              </ul>
              <div className="h-10 w-full bg-muted rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
