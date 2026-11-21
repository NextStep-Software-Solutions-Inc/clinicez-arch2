"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { EhrOptionDescriptor } from "@shared/safe";
import { optionsService } from "@/services/options.service";

export interface SelectOptionItem {
  label: string;
  value: string;
  philHealthCode?: string | null;
  requiresSpecifyText?: boolean;
}

export function useEhrOptions(optionSet: string) {
  const [options, setOptions] = useState<EhrOptionDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await optionsService.getOptionSet(optionSet);
      setOptions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [optionSet]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const selectOptions = useMemo<SelectOptionItem[]>(() => {
    return options.map((opt) => ({
      label: opt.label,
      value: opt.code,
      philHealthCode: opt.philHealthCode,
      requiresSpecifyText: opt.requiresSpecifyText,
    }));
  }, [options]);

  return { options, selectOptions, loading, error, refresh: fetchOptions };
}
