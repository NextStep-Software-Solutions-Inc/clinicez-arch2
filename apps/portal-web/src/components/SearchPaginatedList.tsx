"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Filter, ArrowUpDown } from "lucide-react";
import Each from "./utils/Each";
import SearchBar from "./SearchBar";

interface SearchPaginatedListProps<T> {
  data: T[];
  searchBy: (item: T, search: string) => boolean;
  render: (item: T, index: number) => React.ReactNode;
  itemsPerPage?: number;
}

export default function SearchPaginatedList<T extends { title?: string }>({
  data,
  searchBy,
  render,
  itemsPerPage = 6,
}: SearchPaginatedListProps<T>) {
  const searchParams = useSearchParams();
  const search = searchParams.get("search")?.toLowerCase().trim() ?? "";
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    const base = !search ? [...data] : data.filter((item) => searchBy(item, search));
    return base.sort((a, b) => {
      const titleA = (a.title || "").toLowerCase();
      const titleB = (b.title || "").toLowerCase();
      return sortAsc ? titleA.localeCompare(titleB) : titleB.localeCompare(titleA);
    });
  }, [search, data, searchBy, sortAsc]);

  const [visibleCount, setVisibleCount] = useState(itemsPerPage);
  const visibleData = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + itemsPerPage);
  };

  return (
    <>
      {/* Search and Filter Section */}
      <div className="flex-1 flex flex-col sm:flex-row gap-3 items-center">
        <div className="flex-1 w-full flex gap-3 items-center">
          <SearchBar placeholder="Search directory..." className="flex-1" />
          <Button
            variant="outline"
            size="default"
            onClick={() => setSortAsc((prev) => !prev)}
            className="flex items-center gap-2 bg-transparent whitespace-nowrap"
          >
            <ArrowUpDown className="h-4 w-4" />
            Sort ({sortAsc ? "A–Z" : "Z–A"})
          </Button>
        </div>
      </div>

      {/* Rendered List */}
      {visibleData.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="text-base font-semibold text-foreground">
            {search ? `No directory entries matching "${search}".` : "No public entries are currently listed in this directory."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Registered facilities and healthcare providers appear here automatically once provisioned on ClinicEZ.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Each
            of={visibleData}
            render={(item, i) => (
              <div key={i}>{render(item, i)}</div>
            )}
          />
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center pt-8">
          <Button variant="outline" size="lg" className="px-8 bg-transparent" onClick={handleLoadMore}>
            Load More
          </Button>
        </div>
      )}
    </>
  );
}
