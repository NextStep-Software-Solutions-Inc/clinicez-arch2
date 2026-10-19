/**
 * Universal Pluggable Search Provider Framework - Search Registry
 *
 * Client-side registry enabling modular, zero-touch registration of search
 * contributors across all ClinicEZ workstations and apps.
 */

import type { SearchBadgeVariant, SearchResultItemDto } from './dto';

/**
 * Client-side search item. Extends SearchResultItemDto with optional action handlers.
 */
export interface SearchItem extends SearchResultItemDto {
  /** Optional direct execution callback when item is selected (e.g. Quick Actions) */
  onSelect?: () => void;
}

/**
 * Contract for frontend search contributors.
 * Modules register contributors dynamically without touching central search components.
 */
export interface SearchContributor {
  /** Unique identifier for the contributor (e.g. "clinic-patients", "portal-facilities") */
  id: string;
  /** Machine category key matching backend provider category (e.g. "Patients") */
  category: string;
  /** Human-readable category label displayed on filter tab pills (e.g. "Patients") */
  categoryLabel: string;
  /** Display priority in the palette (lower numbers render first, default: 50) */
  priority?: number;
  /** Required staff RBAC permission to query/view this category (e.g. "Clinic.BillingRead") */
  requiredPermission?: string;
  /** Search execution handler returning items synchronously or asynchronously */
  search: (query: string, signal?: AbortSignal) => Promise<SearchItem[]> | SearchItem[];
}

/**
 * Options for executing search across registered contributors.
 */
export interface SearchExecutionOptions {
  /** Filter execution to a single category (case-insensitive, "all" runs all) */
  category?: string;
  /** AbortSignal for canceling in-flight search requests */
  signal?: AbortSignal;
  /** Allowed permissions for the current user. Contributors requiring unheld permissions are skipped */
  userPermissions?: string[] | Set<string> | readonly string[];
  /** Maximum number of total items to return across all contributors */
  limit?: number;
  /** Per-contributor execution timeout in milliseconds (default: 5000ms) */
  timeoutMs?: number;
}

/**
 * Category descriptor for UI filter tabs.
 */
export interface CategoryOption {
  key: string;
  label: string;
}

/**
 * Universal Search Registry managing client-side search contributors.
 */
export class UniversalSearchRegistry {
  private contributors: Map<string, SearchContributor> = new Map();

  /**
   * Registers a search contributor.
   * If a contributor with the same ID already exists, it is replaced.
   * @returns Unregister callback function for easy cleanup (e.g. in React useEffect)
   */
  register(contributor: SearchContributor): () => void {
    if (!contributor || !contributor.id || !contributor.id.trim()) {
      throw new Error('Contributor must have a valid non-empty id');
    }
    if (!contributor.category || !contributor.category.trim()) {
      throw new Error(`Contributor '${contributor.id}' must have a valid non-empty category`);
    }
    if (!contributor.search || typeof contributor.search !== 'function') {
      throw new Error(`Contributor '${contributor.id}' must have a search function`);
    }

    this.contributors.set(contributor.id, contributor);

    // Collision-safe cleanup callback: only deletes if the registered instance is still active
    return () => {
      if (this.contributors.get(contributor.id) === contributor) {
        this.contributors.delete(contributor.id);
      }
    };
  }

  /**
   * Unregisters a search contributor by ID.
   * @returns true if contributor was removed, false if not found
   */
  unregister(id: string): boolean {
    return this.contributors.delete(id);
  }

  /**
   * Checks if a contributor is currently registered.
   */
  has(id: string): boolean {
    return this.contributors.has(id);
  }

  /**
   * Retrieves a contributor by ID.
   */
  getContributor(id: string): SearchContributor | undefined {
    return this.contributors.get(id);
  }

  /**
   * Returns all registered contributors, sorted by priority ascending (lower = earlier).
   */
  getContributors(): SearchContributor[] {
    return Array.from(this.contributors.values()).sort((a, b) => {
      const priorityDiff = (a.priority ?? 50) - (b.priority ?? 50);
      if (priorityDiff !== 0) return priorityDiff;
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Returns unique category tabs derived from registered contributors,
   * sorted by the highest priority contributor in each category.
   */
  getCategories(): CategoryOption[] {
    const sorted = this.getContributors();
    const categoriesMap = new Map<string, CategoryOption>();

    for (const c of sorted) {
      const key = c.category;
      if (!categoriesMap.has(key)) {
        categoriesMap.set(key, {
          key: c.category,
          label: c.categoryLabel || c.category,
        });
      }
    }

    return Array.from(categoriesMap.values());
  }

  /**
   * Executes a search query across all active, authorized contributors concurrently.
   * Fault-isolated: If one contributor fails or rejects, other contributors' results are preserved.
   */
  async search(query: string, options?: SearchExecutionOptions): Promise<SearchItem[]> {
    const trimmed = (query ?? '').trim();
    if (trimmed.length === 0) {
      return [];
    }

    if (options?.signal?.aborted) {
      return [];
    }

    // 1. Filter contributors by category and permissions
    const activeContributors = this.getContributors().filter((contributor) => {
      // Category filter
      if (options?.category && options.category.toLowerCase() !== 'all') {
        if (contributor.category.toLowerCase() !== options.category.toLowerCase()) {
          return false;
        }
      }

      // Permission filter
      if (contributor.requiredPermission && options?.userPermissions !== undefined) {
        const hasPermission =
          options.userPermissions instanceof Set
            ? options.userPermissions.has(contributor.requiredPermission)
            : Array.isArray(options.userPermissions)
              ? options.userPermissions.includes(contributor.requiredPermission)
              : false;

        if (!hasPermission) {
          return false;
        }
      }

      return true;
    });

    if (activeContributors.length === 0) {
      return [];
    }

    // 2. Execute contributors in parallel with fault isolation and optional timeout
    const timeoutMs = options?.timeoutMs ?? 5000;

    const taskPromises = activeContributors.map(async (contributor) => {
      try {
        if (options?.signal?.aborted) {
          return [];
        }

        const searchPromise = Promise.resolve(contributor.search(trimmed, options?.signal));

        if (timeoutMs > 0) {
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<SearchItem[]>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`SearchContributor '${contributor.id}' timed out after ${timeoutMs}ms`));
            }, timeoutMs);
          });

          try {
            const results = await Promise.race([searchPromise, timeoutPromise]);
            return Array.isArray(results) ? results : [];
          } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
          }
        }

        const results = await searchPromise;
        return Array.isArray(results) ? results : [];
      } catch (err) {
        // Fault isolation: contributor failure does not break the overall search
        console.warn(`[UniversalSearchRegistry] Contributor '${contributor.id}' failed:`, err);
        return [];
      }
    });

    const settledResults = await Promise.all(taskPromises);

    // 3. Concatenate results in contributor priority order
    let aggregated: SearchItem[] = [];
    for (const items of settledResults) {
      aggregated = aggregated.concat(items);
    }

    // 4. Apply overall limit if specified
    if (options?.limit && options.limit > 0 && aggregated.length > options.limit) {
      return aggregated.slice(0, options.limit);
    }

    return aggregated;
  }

  /**
   * Clears all registered contributors. Useful for test isolation.
   */
  clear(): void {
    this.contributors.clear();
  }

  /**
   * Returns current count of registered contributors.
   */
  get size(): number {
    return this.contributors.size;
  }

  /**
   * Alias for size.
   */
  get count(): number {
    return this.contributors.size;
  }
}

/**
 * Global singleton instance of UniversalSearchRegistry.
 */
export const universalSearchRegistry = new UniversalSearchRegistry();
