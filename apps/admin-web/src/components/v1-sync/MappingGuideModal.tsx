import React, { useEffect, useMemo, useState } from 'react';
import {
  IconAlertCircle,
  IconArrowRight,
  IconBook2,
  IconBuildingHospital,
  IconChevronDown,
  IconChevronRight,
  IconCloudLock,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { Button, Chip, TabButton, TabList, type ChipTone } from '@/components/ui';
import type {
  MappingGuideEntityItemDto,
  MappingGuideResponseDto,
  MappingGuideTrackSectionDto,
  SyncTrack,
} from '@/services/v1Sync.service';

export interface MappingGuideModalProps {
  guide: MappingGuideResponseDto | null;
  loading: boolean;
  error: string | null;
  initialTrack?: SyncTrack;
  onRetryLoad: () => void;
  onClose: () => void;
}

function getCategoryChipTone(category: string): ChipTone {
  const key = category.toLowerCase();
  if (key.includes('setup') || key.includes('schema')) return 'purple';
  if (key.includes('patient profile') || key.includes('identity') || key.includes('patient cloud'))
    return 'info';
  if (key.includes('clinical history') || key.includes('personal health') || key.includes('verification'))
    return 'success';
  if (key.includes('order') || key.includes('mirrored') || key.includes('exception'))
    return 'warning';
  if (key.includes('document') || key.includes('vault') || key.includes('visit')) return 'primary';
  return 'neutral';
}

function getMappingShapeLabel(entity: MappingGuideEntityItemDto): string {
  const src = entity.v1SourceTables;
  const tgt = entity.v2TargetTable;
  const rulesText = entity.rules.join(' ').toLowerCase();

  if (tgt.toLowerCase().includes('cloud vault')) return 'Encrypted Vault';
  if (rulesText.includes('fan-out') || rulesText.includes('1-to-many')) return '1 → N Fan-Out';
  if (rulesText.includes('folder flattening')) return 'Flattened · Typed';
  if (src.includes(' + ') && !src.includes('(+')) return 'N → 1 Unified';
  if (src.includes('(+')) return 'Enriched Join';
  return '1:1 Direct';
}

function splitTopLevelTokens(input: string): string[] {
  const tokens: string[] = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '(') {
      depth += 1;
      buf += ch;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      buf += ch;
    } else if (depth === 0 && (ch === ',' || ch === '+')) {
      if (buf.trim()) tokens.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) tokens.push(buf.trim());
  return tokens;
}

function parseTableTokens(raw: string): { primary: string[]; secondary: string[] } {
  const joinMatch = raw.match(/^([^(]+)\(\+([^)]+)\)(.*)$/);
  const cleanToken = (t: string) =>
    t
      .trim()
      .replace(/^public\./, '')
      .replace(/^"([^"]+)"$/, '$1')
      .replace(/^"([^"]+)"(\s+\(.*)$/, '$1$2')
      .trim();

  if (joinMatch) {
    const baseParts = splitTopLevelTokens([joinMatch[1], joinMatch[3]].join(' '))
      .map(cleanToken)
      .filter(Boolean);
    const joinedParts = splitTopLevelTokens(joinMatch[2]).map(cleanToken).filter(Boolean);
    return { primary: baseParts, secondary: joinedParts };
  }

  const parts = splitTopLevelTokens(raw).map(cleanToken).filter(Boolean);
  return { primary: parts, secondary: [] };
}

function parseRuleCallout(rule: string): {
  tag: string | null;
  body: string;
  tone: ChipTone;
} {
  const colonIdx = rule.indexOf(':');
  const hasPrefix = colonIdx > 0 && colonIdx <= 34;
  const tag = hasPrefix ? rule.slice(0, colonIdx).trim() : null;
  const body = (hasPrefix ? rule.slice(colonIdx + 1).trim() : rule).replace(/->/g, '→');
  const lower = rule.toLowerCase();

  if (lower.includes('private') || lower.includes('zero-auth0') || lower.includes('deleted folder')) {
    return { tag, body, tone: 'danger' };
  }
  if (lower.includes('folder flattening') || lower.includes('non-clobber')) {
    return { tag, body, tone: 'primary' };
  }
  if (lower.includes('fan-out') || lower.includes('split rule') || lower.includes('adoption')) {
    return { tag, body, tone: 'info' };
  }
  if (lower.includes('verification') || lower.includes('protected') || lower.includes('v2-wins')) {
    return { tag, body, tone: 'success' };
  }
  return { tag, body, tone: 'neutral' };
}

function formatTransformText(text: string): string {
  return text.replace(/->/g, '→');
}

function entityMatchesQuery(entity: MappingGuideEntityItemDto, query: string): boolean {
  if (!query) return true;
  const haystacks = [
    entity.key,
    entity.displayName,
    entity.category,
    entity.v1SourceTables,
    entity.v2TargetTable,
    entity.summary,
    entity.conflictPolicy ?? '',
    ...entity.rules,
    ...entity.columns.flatMap((c) => [c.v1Column, c.v2Column, c.transform ?? '']),
  ];
  return haystacks.some((item) => item.toLowerCase().includes(query));
}

function columnMatchesQuery(entity: MappingGuideEntityItemDto, query: string): boolean {
  if (!query) return false;
  return entity.columns.some(
    (c) =>
      c.v1Column.toLowerCase().includes(query) ||
      c.v2Column.toLowerCase().includes(query) ||
      (c.transform ?? '').toLowerCase().includes(query)
  );
}

function trackIcon(track: SyncTrack) {
  if (track === 'TRACK1_CLINIC') return <IconBuildingHospital className="h-3.5 w-3.5" />;
  if (track === 'TRACK2_PATIENT') return <IconUsers className="h-3.5 w-3.5" />;
  return <IconCloudLock className="h-3.5 w-3.5" />;
}

interface PipelineStage {
  step: string;
  tone: ChipTone;
  title: string;
  detail: string;
  tags: string[];
}

function getPipelineStages(track: SyncTrack): PipelineStage[] {
  if (track === 'TRACK1_CLINIC') {
    return [
      {
        step: '1. Classic (v1) Source',
        tone: 'warning',
        title: '65 Tracked Clinic Tables',
        detail: 'UPPER_CASE enums, nested folders, and separate Lab / Imaging / ECG tables.',
        tags: ['User & Profiles', 'Visits & SOAP', 'Shared Files'],
      },
      {
        step: '2. Transform & Guards',
        tone: 'info',
        title: 'Normalize · Scope · Shield',
        detail: 'Deterministic UUIDv5 IDs, v2-Wins conflict checks, and Deletion Shield.',
        tags: ['PascalCase Enums', 'Exclude PRIVATE', 'CustomFields JSONB'],
      },
      {
        step: '3. Clinic EZ v2 Target',
        tone: 'primary',
        title: '25 Multi-Tenant Clinic Tables',
        detail: 'Stamped with explicit TenantId + ClinicId inside the Clinic Database.',
        tags: ['Unified LabOrders', 'Flat Doc Vault', 'Admin Vault'],
      },
    ];
  }
  if (track === 'TRACK2_PATIENT') {
    return [
      {
        step: '1. Classic (v1) Source',
        tone: 'warning',
        title: 'Accounts, Folders & Clinic Data',
        detail: 'Legacy auth0|* and Clerk user_* accounts, personal records, and PRIVATE files.',
        tags: ['Scoped or Global', 'Folder Trees', 'PhilHealth PINs'],
      },
      {
        step: '2. Identity & Privacy Router',
        tone: 'info',
        title: 'Adopt · Flatten · Bounds Check',
        detail: 'Strips auth0|*, adopts live Clerk users, and flattens Folder.name into notes.',
        tags: ['Zero-Auth0', 'Folder → notes', '3 Gov ID Rows'],
      },
      {
        step: '3. Clinic EZ v2 Target',
        tone: 'primary',
        title: '15 Personal + 9 Mirrored Tables',
        detail: 'Patient-owned profile & private files plus bound-clinic mirrored history.',
        tags: ['PRIVATE Isolated', '6 Seeded Doc Types', 'clinic_ez_id'],
      },
    ];
  }
  return [
    {
      step: '1. Legacy File Links',
      tone: 'warning',
      title: 'Pending v2 Metadata Rows',
      detail: 'Scans unencrypted Clinic and Patient file rows; downloads shared URLs once.',
      tags: ['Primary Storage', 'Size & HTML Guard'],
    },
    {
      step: '2. Envelope Encryption',
      tone: 'info',
      title: 'AES-256-GCM · Separate Keys',
      detail: 'Encrypts independent Clinic & Patient copies with unique per-file keys and IVs.',
      tags: ['SHA-256 Verified', 'Non-Clobber CDC'],
    },
    {
      step: '3. Isolated Cloud Vaults',
      tone: 'primary',
      title: 'Atomic Vault Pointer Swap',
      detail: 'Swaps encrypted keys into RecordAttachments & file_records; keeps external links.',
      tags: ['Clinic Vault', 'Patient Vault', 'External Kept As-Is'],
    },
  ];
}

function TrackPipelineDiagram({ track }: { track: SyncTrack }) {
  const stages = getPipelineStages(track);
  return (
    <div
      data-testid="track-pipeline-diagram"
      className="rounded-xl bg-surface border border-border grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden"
    >
      {stages.map((stage, idx) => (
        <div key={stage.step} className="p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Chip tone={stage.tone} size="xs" dot>
              {stage.step}
            </Chip>
            {idx < stages.length - 1 && (
              <IconArrowRight className="h-3.5 w-3.5 text-text-muted hidden md:block shrink-0" />
            )}
          </div>
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-text">{stage.title}</div>
            <p className="text-[11px] text-text-muted leading-snug">{stage.detail}</p>
          </div>
          <div className="flex flex-wrap gap-1 pt-0.5">
            {stage.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded bg-surface-muted border border-border text-[10px] font-medium text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MappingGuideModal({
  guide,
  loading,
  error,
  initialTrack = 'TRACK1_CLINIC',
  onRetryLoad,
  onClose,
}: MappingGuideModalProps) {
  const [activeTrack, setActiveTrack] = useState<SyncTrack>(initialTrack);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [protectionsExpanded, setProtectionsExpanded] = useState(false);

  useEffect(() => {
    setActiveTrack(initialTrack);
    setSelectedCategory('ALL');
  }, [initialTrack]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const trackMatchCounts = useMemo(() => {
    const counts = new Map<SyncTrack, number>();
    for (const track of guide?.tracks ?? []) {
      const matched = normalizedQuery
        ? track.entities.filter((e) => entityMatchesQuery(e, normalizedQuery)).length
        : track.entities.length;
      counts.set(track.track, matched);
    }
    return counts;
  }, [guide, normalizedQuery]);

  const activeSection: MappingGuideTrackSectionDto | null = useMemo(() => {
    if (!guide?.tracks?.length) return null;
    return guide.tracks.find((t) => t.track === activeTrack) ?? guide.tracks[0];
  }, [guide, activeTrack]);

  const categories = useMemo(() => {
    if (!activeSection) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const entity of activeSection.entities) {
      if (!seen.has(entity.category)) {
        seen.add(entity.category);
        list.push(entity.category);
      }
    }
    return list;
  }, [activeSection]);

  const filteredEntities = useMemo(() => {
    if (!activeSection) return [];
    return activeSection.entities.filter((entity) => {
      if (selectedCategory !== 'ALL' && entity.category !== selectedCategory) {
        return false;
      }
      return entityMatchesQuery(entity, normalizedQuery);
    });
  }, [activeSection, selectedCategory, normalizedQuery]);

  const allVisibleExpanded = useMemo(() => {
    if (filteredEntities.length === 0) return false;
    return filteredEntities.every((entity) => {
      const key = `${activeSection?.track ?? activeTrack}:${entity.key}`;
      return Boolean(expandedKeys[key]);
    });
  }, [filteredEntities, expandedKeys, activeSection, activeTrack]);

  const handleToggleEntity = (track: SyncTrack, entityKey: string) => {
    const compositeKey = `${track}:${entityKey}`;
    setExpandedKeys((prev) => ({ ...prev, [compositeKey]: !prev[compositeKey] }));
  };

  const handleToggleAllVisible = () => {
    const track = activeSection?.track ?? activeTrack;
    const nextState = !allVisibleExpanded;
    setExpandedKeys((prev) => {
      const next = { ...prev };
      for (const entity of filteredEntities) {
        next[`${track}:${entity.key}`] = nextState;
      }
      return next;
    });
  };

  return (
    <div
      data-testid="mapping-guide-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="v1 to v2 Mapping Guide"
        onClick={(e) => e.stopPropagation()}
        className="max-w-5xl w-full max-h-[90vh] flex flex-col rounded-2xl bg-surface border border-border shadow-xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <IconBook2 className="h-4 w-4 text-primary shrink-0" />
              <h3 className="text-base font-bold text-text">v1 → v2 Mapping Guide</h3>
              {guide?.version && (
                <Chip tone="neutral" size="xs" className="tabular-nums">
                  Schema Ref {guide.version}
                </Chip>
              )}
            </div>
            <p className="text-xs text-text-muted">
              Transformation flow, privacy rules, and exact Classic Clinic EZ (v1) → Clinic EZ v2
              table and column mappings across all three tracks.
            </p>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onClose}
            tooltip="Close"
            aria-label="Close mapping guide"
            className="shrink-0"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        {loading && !guide ? (
          <div className="p-10 text-center text-xs text-text-muted flex items-center justify-center gap-2">
            <IconRefresh className="h-4 w-4 animate-spin text-primary" />
            <span>Loading v1 → v2 mapping guide...</span>
          </div>
        ) : error && !guide ? (
          <div className="p-6">
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <IconAlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <Button variant="dangerSubtle" size="xs" onClick={onRetryLoad} className="shrink-0">
                Retry
              </Button>
            </div>
          </div>
        ) : guide && activeSection ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Track Switcher + Search + Category Filters */}
            <div className="px-6 py-3.5 border-b border-border bg-surface-muted/30 space-y-3 shrink-0">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <TabList ariaLabel="Mapping guide tracks" fullWidthUntil="lg">
                  {guide.tracks.map((section) => {
                    const count = trackMatchCounts.get(section.track) ?? section.entities.length;
                    return (
                      <TabButton
                        key={section.track}
                        active={activeSection.track === section.track}
                        fullWidthUntil="lg"
                        onClick={() => {
                          setActiveTrack(section.track);
                          setSelectedCategory('ALL');
                        }}
                        leadingIcon={trackIcon(section.track)}
                        tooltip={false}
                        badge={
                          <Chip
                            tone={normalizedQuery && count === 0 ? 'neutral' : 'primary'}
                            size="xs"
                            className="tabular-nums"
                          >
                            {count}
                          </Chip>
                        }
                      >
                        {section.title}
                      </TabButton>
                    );
                  })}
                </TabList>

                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative flex-1 lg:w-72 min-w-0">
                    <IconSearch className="h-3.5 w-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="mapping-guide-search"
                      type="text"
                      aria-label="Search tables, columns, or rules"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tables, columns, enums, folders..."
                      className="w-full h-8 pl-8 pr-7 rounded-xl bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear mapping search"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                      >
                        <IconX className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={handleToggleAllVisible}
                    disabled={filteredEntities.length === 0}
                    className="shrink-0"
                  >
                    {allVisibleExpanded ? 'Collapse Columns' : 'Expand All Columns'}
                  </Button>
                </div>
              </div>

              {/* Clean High-Contrast Category Pills */}
              {categories.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="unstyled"
                    size="custom"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`h-7 px-3 rounded-full text-[11px] font-semibold border transition-colors ${
                      selectedCategory === 'ALL'
                        ? 'bg-primary text-white border-primary shadow-xs'
                        : 'bg-surface border-border text-text-secondary hover:bg-surface-muted hover:text-text'
                    }`}
                  >
                    All Categories ({activeSection.entities.length})
                  </Button>
                  {categories.map((cat) => {
                    const isActive = selectedCategory === cat;
                    return (
                      <Button
                        key={cat}
                        variant="unstyled"
                        size="custom"
                        onClick={() => setSelectedCategory(cat)}
                        className={`h-7 px-3 rounded-full text-[11px] font-semibold border transition-colors ${
                          isActive
                            ? 'bg-primary text-white border-primary shadow-xs'
                            : 'bg-surface border-border text-text-secondary hover:bg-surface-muted hover:text-text'
                        }`}
                      >
                        {cat}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scrollable Mapping Content */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Platform Safety Guarantees Banner (Native Emerald Subtle Style) */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
                <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <IconShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-semibold text-text">
                      Platform Safety Guarantees
                    </span>
                    <span className="text-[11px] text-text-muted">
                      v2-Wins · Deletion Shield · Idempotent UUIDv5 · Zero-Auth0 · Privacy Isolation
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-expanded={protectionsExpanded}
                    onClick={() => setProtectionsExpanded((prev) => !prev)}
                    trailingIcon={
                      protectionsExpanded ? (
                        <IconChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <IconChevronRight className="h-3.5 w-3.5" />
                      )
                    }
                    className="shrink-0"
                  >
                    {protectionsExpanded ? 'Hide Rules' : 'Read Rules'}
                  </Button>
                </div>
                {protectionsExpanded && (
                  <div className="px-4 pb-3 pt-2 space-y-1.5 border-t border-emerald-500/15 bg-surface/50">
                    {guide.coreProtections.map((rule, idx) => {
                      const parsed = parseRuleCallout(rule);
                      return (
                        <div key={idx} className="flex items-start gap-2 text-[11px] leading-relaxed">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          <span className="text-text-secondary">
                            {parsed.tag && (
                              <strong className="font-semibold text-text">{parsed.tag}: </strong>
                            )}
                            {parsed.body}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Track Flow Diagram & Global Rules */}
              <div className="p-4 rounded-xl bg-surface-muted/40 border border-border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-text">{activeSection.title}</span>
                    <Chip tone="neutral" size="xs">
                      {activeSection.targetDatabase}
                    </Chip>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Classic (v1)
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      Clinic EZ v2
                    </span>
                    <span className="tabular-nums">
                      {filteredEntities.length} / {activeSection.entities.length}
                    </span>
                  </div>
                </div>

                <TrackPipelineDiagram track={activeSection.track} />

                <p className="text-xs text-text-secondary leading-relaxed">
                  {activeSection.overview}
                </p>

                {activeSection.globalRules.length > 0 && (
                  <ul className="space-y-1 text-[11px] text-text-muted list-disc pl-5">
                    {activeSection.globalRules.map((rule, idx) => {
                      const parsed = parseRuleCallout(rule);
                      return (
                        <li key={idx} className="leading-relaxed">
                          {parsed.tag && (
                            <strong className="font-semibold text-text-secondary">
                              {parsed.tag}:{' '}
                            </strong>
                          )}
                          {parsed.body}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Filtered Entity Mapping Cards */}
              {filteredEntities.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-border text-center space-y-2">
                  <div className="text-sm font-semibold text-text">
                    No matching mappings in {activeSection.title}
                  </div>
                  <p className="text-xs text-text-muted">
                    Try another table, column, or keyword, or switch tabs to view matches in other
                    tracks.
                  </p>
                  {searchQuery && (
                    <Button variant="secondary" size="xs" onClick={() => setSearchQuery('')}>
                      Clear Search
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredEntities.map((entity) => {
                    const compositeKey = `${activeSection.track}:${entity.key}`;
                    const autoExpanded =
                      normalizedQuery.length >= 2 && columnMatchesQuery(entity, normalizedQuery);
                    const isExpanded =
                      compositeKey in expandedKeys ? Boolean(expandedKeys[compositeKey]) : autoExpanded;
                    const categoryTone = getCategoryChipTone(entity.category);
                    const shapeLabel = getMappingShapeLabel(entity);
                    const sourceTables = parseTableTokens(entity.v1SourceTables);
                    const targetTables = parseTableTokens(entity.v2TargetTable);

                    return (
                      <div
                        key={compositeKey}
                        className="rounded-xl border border-border bg-surface overflow-hidden"
                      >
                        <div className="p-4 space-y-3">
                          {/* Aligned Card Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-bold text-text">
                                  {entity.displayName}
                                </span>
                                <Chip tone={categoryTone} size="xs" dot>
                                  {entity.category}
                                </Chip>
                                <Chip tone="neutral" size="xs">
                                  {shapeLabel}
                                </Chip>
                              </div>
                              <p className="text-xs text-text-secondary leading-relaxed">
                                {entity.summary}
                              </p>
                            </div>
                            <Button
                              variant="secondary"
                              size="xs"
                              aria-expanded={isExpanded}
                              aria-label={`Toggle column mapping for ${entity.displayName}`}
                              onClick={() => handleToggleEntity(activeSection.track, entity.key)}
                              leadingIcon={
                                isExpanded ? (
                                  <IconChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <IconChevronRight className="h-3.5 w-3.5" />
                                )
                              }
                              className="shrink-0"
                            >
                              {isExpanded ? 'Hide Columns' : `Columns (${entity.columns.length})`}
                            </Button>
                          </div>

                          {/* Restrained Color-Coded Source -> Target Bar */}
                          <div className="px-3.5 py-2.5 rounded-lg bg-surface-muted/40 border border-border grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                            <div className="space-y-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                                Classic (v1) Source
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {sourceTables.primary.map((tbl, i) => (
                                  <code
                                    key={`p-${i}`}
                                    className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 font-mono text-[11px] font-medium text-amber-800 dark:text-amber-300 break-words"
                                  >
                                    {tbl}
                                  </code>
                                ))}
                                {sourceTables.secondary.map((tbl, i) => (
                                  <code
                                    key={`s-${i}`}
                                    className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] text-text-muted break-words"
                                  >
                                    + {tbl}
                                  </code>
                                ))}
                              </div>
                            </div>

                            <IconArrowRight className="h-3.5 w-3.5 text-text-muted hidden md:block shrink-0" />

                            <div className="space-y-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                Clinic EZ v2 Target
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {targetTables.primary.map((tbl, i) => (
                                  <code
                                    key={`tp-${i}`}
                                    className="px-1.5 py-0.5 rounded bg-primary-subtle border border-primary/20 font-mono text-[11px] font-semibold text-primary break-words"
                                  >
                                    {tbl}
                                  </code>
                                ))}
                                {targetTables.secondary.map((tbl, i) => (
                                  <code
                                    key={`ts-${i}`}
                                    className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] text-text-muted break-words"
                                  >
                                    + {tbl}
                                  </code>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Transformation & Exclusion Rules */}
                          {entity.rules.length > 0 && (
                            <ul className="space-y-1.5 text-[11px] text-text-secondary">
                              {entity.rules.map((rule, idx) => {
                                const parsed = parseRuleCallout(rule);
                                return (
                                  <li key={idx} className="flex items-start gap-2 leading-relaxed">
                                    <span className="h-1.5 w-1.5 rounded-full bg-text-muted/60 mt-1.5 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                      {parsed.tag && (
                                        <Chip
                                          tone={parsed.tone}
                                          size="xs"
                                          className="mr-1.5 align-baseline"
                                        >
                                          {parsed.tag}
                                        </Chip>
                                      )}
                                      <span>{parsed.body}</span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        {/* Expandable Column-Level Transformation Table */}
                        {isExpanded && (
                          <div className="border-t border-border bg-surface-muted/20 px-4 py-3 space-y-2.5">
                            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                              <table className="w-full text-left border-collapse text-[11px]">
                                <thead className="bg-surface-muted border-b border-border text-[10px] uppercase tracking-wider">
                                  <tr>
                                    <th className="py-2 pl-3 pr-2 font-semibold text-amber-700 dark:text-amber-400">
                                      Classic (v1) Column
                                    </th>
                                    <th className="py-2 px-1 w-6 text-center text-text-muted" />
                                    <th className="py-2 px-2 font-semibold text-primary">
                                      Clinic EZ v2 Column
                                    </th>
                                    <th className="py-2 pl-2 pr-3 font-semibold text-text-muted">
                                      Transformation &amp; Validation
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {entity.columns.map((col, idx) => (
                                    <tr key={idx}>
                                      <td className="py-2 pl-3 pr-2 font-mono text-text align-top">
                                        {col.v1Column}
                                      </td>
                                      <td className="py-2 px-1 text-center align-top text-text-muted">
                                        →
                                      </td>
                                      <td className="py-2 px-2 font-mono font-semibold text-primary align-top">
                                        {col.v2Column}
                                      </td>
                                      <td className="py-2 pl-2 pr-3 text-text-secondary align-top leading-relaxed">
                                        {col.transform
                                          ? formatTransformText(col.transform)
                                          : 'Direct trimmed copy'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {entity.conflictPolicy && (
                              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                                <IconShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                <span>Protection policy: {entity.conflictPolicy}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-surface-muted/30 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-text-muted">
            Read-only schema reference · Contains zero patient data or credentials.
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
