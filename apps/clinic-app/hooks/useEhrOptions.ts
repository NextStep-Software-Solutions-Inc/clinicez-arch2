import { useState, useEffect, useMemo, useCallback } from 'react';
import type { EhrOptionDescriptor } from '@shared/safe';
import { optionsService } from '../services/optionsService';

export interface UseEhrOptionsConfig {
  workflowMode?: 'Regular' | 'YakapAvailment';
  enabled?: boolean;
}

export function useEhrOptions(
  optionSet: string,
  config?: UseEhrOptionsConfig,
) {
  const [options, setOptions] = useState<EhrOptionDescriptor[]>([]);
  const [loading, setLoading] = useState(config?.enabled !== false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (config?.enabled === false) return;
    setLoading(true);
    setError(null);
    try {
      const data = await optionsService.getOptionSet(optionSet);
      setOptions(data);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [optionSet, config?.enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const selectOptions = useMemo(() => {
    if (options.length === 0) return [];
    return options.map((opt) => ({
      label: opt.label,
      value: opt.code,
      philHealthCode: opt.philHealthCode ?? undefined,
      philHealthLibrary: opt.philHealthLibrary ?? undefined,
    }));
  }, [options]);

  return {
    options,
    selectOptions,
    loading,
    error,
    reload: load,
  };
}
