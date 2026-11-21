import { useState, useEffect, useCallback } from 'react';
import type { PsgcLocationDto } from '@shared/safe';
import { locationService } from '../services/locationService';

export function usePsgcLocations(selectedRegionPsgc?: string | null, selectedProvincePsgc?: string | null, selectedCityPsgc?: string | null) {
  const [regions, setRegions] = useState<PsgcLocationDto[]>([]);
  const [provinces, setProvinces] = useState<PsgcLocationDto[]>([]);
  const [cities, setCities] = useState<PsgcLocationDto[]>([]);
  const [barangays, setBarangays] = useState<PsgcLocationDto[]>([]);

  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  // Load regions on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingRegions(true);
    locationService
      .getRegions()
      .then((data) => {
        if (isMounted) setRegions(data);
      })
      .finally(() => {
        if (isMounted) setLoadingRegions(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Load provinces or bypass for NCR (1300000000 / NCR)
  useEffect(() => {
    let isMounted = true;
    if (!selectedRegionPsgc) {
      setProvinces([]);
      return;
    }

    setLoadingProvinces(true);
    locationService
      .getProvinces(selectedRegionPsgc)
      .then((data) => {
        if (isMounted) setProvinces(data);
      })
      .finally(() => {
        if (isMounted) setLoadingProvinces(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedRegionPsgc]);

  // Load cities/municipalities
  useEffect(() => {
    let isMounted = true;
    if (!selectedRegionPsgc && !selectedProvincePsgc) {
      setCities([]);
      return;
    }

    setLoadingCities(true);
    locationService
      .getCities(selectedProvincePsgc, selectedRegionPsgc)
      .then((data) => {
        if (isMounted) setCities(data);
      })
      .finally(() => {
        if (isMounted) setLoadingCities(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedProvincePsgc, selectedRegionPsgc]);

  // Load barangays
  useEffect(() => {
    let isMounted = true;
    if (!selectedCityPsgc) {
      setBarangays([]);
      return;
    }

    setLoadingBarangays(true);
    locationService
      .getBarangays(selectedCityPsgc)
      .then((data) => {
        if (isMounted) setBarangays(data);
      })
      .finally(() => {
        if (isMounted) setLoadingBarangays(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCityPsgc]);

  return {
    regions,
    provinces,
    cities,
    barangays,
    loadingRegions,
    loadingProvinces,
    loadingCities,
    loadingBarangays,
  };
}
