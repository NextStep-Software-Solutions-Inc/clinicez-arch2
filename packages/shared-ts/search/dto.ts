/**
 * Universal Pluggable Search Provider Framework - TypeScript DTOs
 *
 * Shared contracts for search items, badges, and response envelopes.
 * Strictly mirrors C# contracts in packages/shared-dotnet/Search/.
 */

/**
 * Semantic urgency indicators for badges.
 * Aligns with @clinicez/design-tokens clinical triage and operational urgency states.
 */
export type SearchBadgeVariant = 'routine' | 'urgent' | 'emergency' | 'neutral';

/**
 * Structured badge payload for search items.
 */
export interface SearchBadgeDto {
  text: string;
  variant?: SearchBadgeVariant;
}

/**
 * Convenience alias for SearchBadgeDto.
 */
export type SearchBadge = SearchBadgeDto;

/**
 * Search result item DTO returned from backend or frontend search providers.
 */
export interface SearchResultItemDto {
  /** Unique entity identifier (e.g. GUID or code) */
  id: string;
  /** Category key (e.g. "Patients", "Consultations", "Settings") */
  category: string;
  /** Primary label displayed in search item row (e.g. "Juan Dela Cruz") */
  title: string;
  /** Secondary descriptive metadata (e.g. "PIN: 12-345678901-2 • DOB: 1985-04-12") */
  subtitle: string;
  /** Optional badge text displayed next to title (e.g. "Senior", "Panic", "Unpaid") */
  badgeText?: string;
  /** Optional badge styling variant ('routine' | 'urgent' | 'emergency' | 'neutral') */
  badgeVariant?: SearchBadgeVariant;
  /** Host workstation navigation route (e.g. "PatientChart", "ConsultationWorkspace", "Settings") */
  targetRoute: string;
  /** Route parameters for deep linking (e.g. { patientId: "...", tab: "services" }) */
  routeParams?: Record<string, string>;
  /** Optional structured badge object (mirrors backend SearchBadgeDto) */
  badge?: SearchBadgeDto;
}

/**
 * Search response envelope returned from REST API (/api/v1/search).
 */
export interface SearchResponseDto {
  /** Aggregated search result items across active providers */
  items: SearchResultItemDto[];
  /** Total count of items matching the query */
  totalCount: number;
}

/**
 * Convenience alias for SearchResponseDto.
 */
export type SearchResponse = SearchResponseDto;

/**
 * Category metadata for frontend filter tab pills.
 */
export interface SearchCategoryDto {
  key: string;
  label: string;
  count?: number;
}
