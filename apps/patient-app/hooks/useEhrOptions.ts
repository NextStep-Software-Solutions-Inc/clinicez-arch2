import { useState, useEffect, useMemo } from 'react';
import type { EhrOptionDescriptor } from '@shared/safe';
import { optionsService } from '../services/api/optionsService';

export function useEhrOptions(optionSet: string) {
  const [options, setOptions] = useState<EhrOptionDescriptor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    optionsService.getOptionSet(optionSet).then((data) => {
      if (isMounted) {
        setOptions(data);
        setLoading(false);
      }
    }).catch(() => {
      if (isMounted) setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [optionSet]);

  const selectOptions = useMemo(() => {
    if (options.length === 0) return [];
    return options.map((o) => {
      let val = o.label;
      if (o.label === 'High School') val = 'HighSchool';
      else if (o.label === 'Post Graduate') val = 'PostGraduate';
      return {
        label: o.label,
        value: val,
      };
    });
  }, [options]);

  return { options, selectOptions, loading };
}
