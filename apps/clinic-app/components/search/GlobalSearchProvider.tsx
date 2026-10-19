import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  universalSearchRegistry,
  type SearchItem,
  type CategoryOption,
} from '@shared/safe';
import { clinicService } from '../../services/clinicService';
import { useAuth } from '../../context/AuthContext';
import GlobalSearchModal from './GlobalSearchModal';

export interface GlobalSearchContextValue {
  isOpen: boolean;
  openSearch: (initialQuery?: string, initialCategory?: string) => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  query: string;
  setQuery: (q: string) => void;
  activeCategory: string;
  setActiveCategory: (cat: string) => void;
  results: SearchItem[];
  loading: boolean;
  error: string | null;
  categories: CategoryOption[];
  handleSelectResult: (item: SearchItem) => void;
  registerNavigator: (navigator: (route: string, params?: any) => void) => () => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function useGlobalSearch(): GlobalSearchContextValue {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error('useGlobalSearch must be used within a GlobalSearchProvider');
  }
  return ctx;
}

export const QUICK_ACTIONS: SearchItem[] = [
  {
    id: 'quick-action-register',
    category: 'Quick Actions',
    title: 'Register Walk-In Patient',
    subtitle: 'Open walk-in patient intake form to record demographics and vitals',
    badgeText: 'Intake',
    badgeVariant: 'routine',
    targetRoute: 'Patients',
    routeParams: { openRegister: 'true' },
  },
  {
    id: 'quick-action-queue',
    category: 'Quick Actions',
    title: 'View OPD Clinical Queue',
    subtitle: 'Monitor triage station, doctor consultation queue, and waiting room',
    badgeText: 'Queue',
    badgeVariant: 'urgent',
    targetRoute: 'Dashboard',
    routeParams: { tab: 'QUEUE' },
  },
  {
    id: 'quick-action-roster',
    category: 'Quick Actions',
    title: 'Doctor Rosters & Shift Schedules',
    subtitle: 'View attending physician shift templates, breaks, and available slots',
    badgeText: 'Roster',
    badgeVariant: 'routine',
    targetRoute: 'Appointments',
    routeParams: { tab: 'roster' },
  },
  {
    id: 'quick-action-services',
    category: 'Quick Actions',
    title: 'Services & Pricing Catalog',
    subtitle: 'Browse consultation fees, laboratory test codes, and PhilHealth packages',
    badgeText: 'Catalog',
    badgeVariant: 'neutral',
    targetRoute: 'Settings',
    routeParams: { tab: 'services' },
  },
];

export const SETTINGS_NAV_ITEMS: SearchItem[] = [
  {
    id: 'setting-general',
    category: 'Settings',
    title: 'Clinic General Settings',
    subtitle: 'Facility identity, operational mode, hours, and specialty mode',
    badgeText: 'General',
    badgeVariant: 'neutral',
    targetRoute: 'Settings',
    routeParams: { tab: 'general' },
  },
  {
    id: 'setting-services',
    category: 'Settings',
    title: 'Services & Pricing Catalog',
    subtitle: 'Consultation fees, laboratory test codes, and procedure items',
    badgeText: 'Services',
    badgeVariant: 'neutral',
    targetRoute: 'Settings',
    routeParams: { tab: 'services' },
  },
  {
    id: 'setting-staff',
    category: 'Settings',
    title: 'Staff Accounts & Provider Directory',
    subtitle: 'Manage doctors, nurses, receptionists, licenses, and rooms',
    badgeText: 'Staff',
    badgeVariant: 'routine',
    targetRoute: 'Settings',
    routeParams: { tab: 'staff' },
  },
  {
    id: 'setting-rbac',
    category: 'Settings',
    title: 'Roles & Permissions (RBAC)',
    subtitle: 'Configure access roles, permissions matrix, and security policies',
    badgeText: 'Access',
    badgeVariant: 'neutral',
    targetRoute: 'Settings',
    routeParams: { tab: 'rbac' },
  },
  {
    id: 'setting-readiness',
    category: 'Settings',
    title: 'Facility Readiness & Station Inspection',
    subtitle: 'Clinic workstation readiness checklists and station verification',
    badgeText: 'Readiness',
    badgeVariant: 'routine',
    targetRoute: 'Settings',
    routeParams: { tab: 'readiness' },
  },
  {
    id: 'setting-fields',
    category: 'Settings',
    title: 'Custom Clinical Fields',
    subtitle: 'Configure specialty-specific intake and SOAP note fields',
    badgeText: 'Fields',
    badgeVariant: 'neutral',
    targetRoute: 'Settings',
    routeParams: { tab: 'fields' },
  },
  {
    id: 'setting-philhealth',
    category: 'Settings',
    title: 'PhilHealth Konsulta & Yakap Config',
    subtitle: 'Accreditation numbers, PMAC keys, and claims transmittal settings',
    badgeText: 'PhilHealth',
    badgeVariant: 'urgent',
    targetRoute: 'Settings',
    routeParams: { tab: 'philhealth' },
  },
  {
    id: 'setting-license',
    category: 'Settings',
    title: 'Software License & Station Activation',
    subtitle: 'Device registration, workstation tokens, and license tier',
    badgeText: 'License',
    badgeVariant: 'neutral',
    targetRoute: 'Settings',
    routeParams: { tab: 'license' },
  },
  {
    id: 'setting-audit',
    category: 'Settings',
    title: 'Audit Trail & Forensic Logs',
    subtitle: 'Security event logs, user activity history, and forensic export',
    badgeText: 'Audit',
    badgeVariant: 'neutral',
    targetRoute: 'Settings',
    routeParams: { tab: 'audit' },
  },
];

export interface SearchNavigationResolution {
  destinationRoute: string;
  destinationParams: Record<string, any>;
}

/**
 * Resolves the destination route and parameter dictionary for a selected SearchItem.
 * Pure function covering all 7 clinical categories and unrecognized route passthrough.
 */
export function resolveSearchNavigation(item: SearchItem): SearchNavigationResolution {
  const params = item.routeParams || {};
  const targetRoute = item.targetRoute;

  let destinationRoute = targetRoute;
  let destinationParams: Record<string, any> = { ...params };

  switch (targetRoute) {
    case 'Patients':
      destinationRoute = 'Patients';
      destinationParams = {
        openPatientId: params.openPatientId || params.patientId || item.id,
        openRegister: params.openRegister === 'true',
        ...(params.tab ? { tab: params.tab } : {}),
        ...(params.toothNumber ? { toothNumber: params.toothNumber } : {}),
      };
      break;

    case 'Consultations':
      destinationRoute = 'Consultations';
      destinationParams = {
        consultationId: params.consultationId,
        patientId: params.patientId,
        queueId: params.queueId,
      };
      break;

    case 'Appointments':
      destinationRoute = 'Appointments';
      destinationParams = {
        appointmentId: params.appointmentId,
        patientId: params.patientId,
        patientName: params.patientName,
      };
      break;

    case 'Queue':
    case 'Dashboard':
      destinationRoute = 'Dashboard';
      destinationParams = {
        tab: 'QUEUE',
        ticketId: params.queueId || params.ticketId,
      };
      break;

    case 'Billing':
      destinationRoute = 'Billing';
      destinationParams = {
        invoiceId: params.invoiceId,
        patientId: params.patientId,
      };
      break;

    case 'LabOrders':
    case 'ResultReview':
      destinationRoute = 'ResultReview';
      destinationParams = {
        orderId: params.orderId || item.id,
      };
      break;

    case 'Settings':
      destinationRoute = 'Settings';
      destinationParams = {
        tab: params.tab,
        subtab: params.subtab,
        roomId: params.roomId,
        serviceId: params.serviceId,
      };
      break;

    default:
      destinationRoute = targetRoute;
      destinationParams = params;
      break;
  }

  return { destinationRoute, destinationParams };
}

export interface GlobalSearchProviderProps {
  children: React.ReactNode;
}

export function GlobalSearchProvider({ children }: GlobalSearchProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigatorRef = useRef<((route: string, params?: any) => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safe access to auth permissions (if AuthContext is mounted)
  let staffPermissions: string[] | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const auth = useAuth();
    staffPermissions = auth?.permissions;
  } catch {
    staffPermissions = undefined;
  }

  const registerNavigator = useCallback(
    (navigator: (route: string, params?: any) => void) => {
      navigatorRef.current = navigator;
      return () => {
        if (navigatorRef.current === navigator) {
          navigatorRef.current = null;
        }
      };
    },
    [],
  );

  const openSearch = useCallback((initialQuery?: string, initialCategory?: string) => {
    if (initialQuery !== undefined) setQuery(initialQuery);
    if (initialCategory !== undefined) setActiveCategory(initialCategory);
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveCategory('all');
    setLoading(false);
    setError(null);
  }, []);

  const toggleSearch = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Register contributors into universalSearchRegistry on mount
  useEffect(() => {
    // 1. Quick Actions contributor
    const unregisterQuickActions = universalSearchRegistry.register({
      id: 'clinic-quick-actions',
      category: 'Quick Actions',
      categoryLabel: 'Quick Actions',
      priority: 5,
      search: (q: string) => {
        const lower = q.toLowerCase();
        return QUICK_ACTIONS.filter(
          (item) =>
            item.title.toLowerCase().includes(lower) ||
            item.subtitle.toLowerCase().includes(lower) ||
            (item.badgeText && item.badgeText.toLowerCase().includes(lower)),
        );
      },
    });

    // 2. Settings Navigation contributor
    const unregisterSettingsNav = universalSearchRegistry.register({
      id: 'clinic-settings-nav',
      category: 'Settings',
      categoryLabel: 'Settings',
      priority: 15,
      search: (q: string) => {
        const lower = q.toLowerCase();
        return SETTINGS_NAV_ITEMS.filter(
          (item) =>
            item.title.toLowerCase().includes(lower) ||
            item.subtitle.toLowerCase().includes(lower) ||
            (item.routeParams?.tab && item.routeParams.tab.toLowerCase().includes(lower)) ||
            (item.badgeText && item.badgeText.toLowerCase().includes(lower)),
        );
      },
    });

    // 3. Backend API Search contributor
    const unregisterClinicApi = universalSearchRegistry.register({
      id: 'clinic-api-search',
      category: 'Clinic',
      categoryLabel: 'Clinic Records',
      priority: 25,
      search: async (q: string, signal?: AbortSignal) => {
        const [res, err] = await clinicService.search(q, undefined, 20, signal);
        if (err || !res) return [];
        return res.items as SearchItem[];
      },
    });

    return () => {
      unregisterQuickActions();
      unregisterSettingsNav();
      unregisterClinicApi();
    };
  }, []);

  // Debounced Search Execution (200ms) with AbortController
  useEffect(() => {
    const trimmed = query.trim();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const items = await universalSearchRegistry.search(trimmed, {
          signal: controller.signal,
          userPermissions: staffPermissions,
        });

        if (!controller.signal.aborted) {
          setResults(items);
          setLoading(false);
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(err?.message || 'Search execution failed');
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      controller.abort();
    };
  }, [query, staffPermissions]);

  // Deep Navigation Dispatching
  const handleSelectResult = useCallback(
    (item: SearchItem) => {
      // 1. Invoke onSelect callback if provided
      if (typeof item.onSelect === 'function') {
        item.onSelect();
      }

      // 2. Close modal & reset query
      setIsOpen(false);
      setQuery('');

      // 3. Resolve target route and deep link parameters
      const { destinationRoute, destinationParams } = resolveSearchNavigation(item);

      if (navigatorRef.current) {
        navigatorRef.current(destinationRoute, destinationParams);
      }
    },
    [],
  );

  // Dynamic Category options derived from active contributors and current results
  const categories: CategoryOption[] = useMemo(() => {
    const list: CategoryOption[] = [{ key: 'all', label: 'All' }];
    const seen = new Set<string>(['all']);

    for (const c of universalSearchRegistry.getCategories()) {
      const lower = c.key.toLowerCase();
      if (!seen.has(lower) && lower !== 'clinic') {
        seen.add(lower);
        list.push({ key: c.key, label: c.label || c.key });
      }
    }

    for (const r of results) {
      if (r.category) {
        const lower = r.category.toLowerCase();
        if (!seen.has(lower) && lower !== 'clinic') {
          seen.add(lower);
          list.push({ key: r.category, label: r.category });
        }
      }
    }

    return list;
  }, [results]);

  const value: GlobalSearchContextValue = useMemo(
    () => ({
      isOpen,
      openSearch,
      closeSearch,
      toggleSearch,
      query,
      setQuery,
      activeCategory,
      setActiveCategory,
      results,
      loading,
      error,
      categories,
      handleSelectResult,
      registerNavigator,
    }),
    [
      isOpen,
      openSearch,
      closeSearch,
      toggleSearch,
      query,
      activeCategory,
      results,
      loading,
      error,
      categories,
      handleSelectResult,
      registerNavigator,
    ],
  );

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      <GlobalSearchModal
        visible={isOpen}
        onClose={closeSearch}
        query={query}
        onChangeQuery={setQuery}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        categories={categories}
        results={results}
        quickActions={QUICK_ACTIONS}
        loading={loading}
        onSelectItem={handleSelectResult}
        error={error}
      />
    </GlobalSearchContext.Provider>
  );
}

export default GlobalSearchProvider;
