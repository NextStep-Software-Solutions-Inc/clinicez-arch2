# API Integration & Architecture Guide

This guide establishes the **Predictable Service Layer Pattern** to be used across the Clinic EZ mobile application. It ensures an enterprise-grade, highly maintainable, and strictly separated architecture.

## 1. 100% Separation of Concerns

To keep the codebase scalable for a large team, we strictly separate the **Network Layer**, the **Orchestration Layer**, and the **UI Component Layer**.

### A. The Network Layer (`services/api/`)
**Rule:** All raw HTTP requests MUST live here. UI components should never call `axios` or `fetch` directly.
- **`apiClient.ts`**: The core Axios instance. It automatically attaches auth tokens and unwraps the `.NET` `ApiResponse<T>` envelope. It also maps errors to a standard `ApiError` class.
- **Domain API Modules (e.g., `appointmentsApi.ts`, `filesApi.ts`)**: These files contain pure HTTP functions. They do not handle local caching, SQLite, or React State.
```typescript
// Example: services/api/patientApi.ts
export async function fetchPatientProfile(getToken: () => Promise<string | null>, patientId: string) {
  return api.get<PatientProfileDto>(getToken, `/patients/${patientId}/profile`);
}
```

### B. The Orchestration Layer (`services/[domain]/`)
**Rule:** Business logic, SQLite (Drizzle ORM) caching, and Offline-First synchronization live here.
- **`[domain]Service.ts`**: These files act as managers. They decide whether to read from the local SQLite database or hit the Network Layer to sync data. 
- By keeping this separate from the Network Layer, we ensure that API logic doesn't get tangled with local database logic.

### C. The UI Component Layer (`hooks/`, `components/`)
**Rule:** Components must be "dumb" when it comes to data fetching. They should rely on custom hooks to supply data.

---

## 2. Request Deduplication using SWR

To prevent redundant network requests and improve performance, we use **SWR (stale-while-revalidate)** for all direct UI-to-API fetches.

**Best Practice:** Do not use `useEffect` to fetch data. Always use `useSWR` combined with our generic `swrFetcher` and `swrKey` from `apiClient.ts`. SWR automatically deduplicates simultaneous requests to the same endpoint.

```tsx
import useSWR from 'swr';
import { swrFetcher, swrKey } from 'services/api';
import { useAuth } from '@clerk/expo';

export function useAppointments(patientId: string) {
  const { getToken } = useAuth();
  
  const { data, error, isLoading } = useSWR(
    [swrKey(`/patients/${patientId}/appointments`), getToken],
    ([url, tokenFn]) => swrFetcher<ClinicAppointmentsResult>(url, tokenFn)
  );

  return { data, error, isLoading };
}
```
*Note: For Offline-First domains like `Files`, SWR is generally not used because the UI reads directly from the local SQLite database, while a background sync engine (`syncService.ts`) handles network deduplication.*

---

## 3. Enterprise Best Practices

For a team scaling an enterprise React Native application, adhere to the following patterns:

1. **Domain-Driven Design (DDD) Folders**: Keep features isolated. Don't put all components in one massive `components/` folder. Group them by domain (e.g., `components/appointments/`, `components/files/`).
2. **Never Pass Functions as API Payloads**: Always execute function refs (like `getToken()`) *before* or *during* the API call wrapper. Do not nest them unnecessarily, which can lead to serialization bugs (e.g., sending `Bearer [Function]` to the backend).
3. **Graceful Degradation**: Always handle network failures. `ApiError` provides a `userMessage` specifically designed to be safe for display in Toast notifications or Error Boundaries.
4. **Offline-First via Drizzle**: For critical user data, prioritize writing to the local Drizzle schema first, and flag it as `syncStatus: 'queued'`. Background workers will eventually sync it to the backend. This ensures a 0-latency feel for the user.
