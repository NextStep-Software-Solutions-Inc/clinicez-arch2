"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { SelectField } from "@/components/ui/select";
import { locationService, type PsgcLocationDto } from "@/services/location.service";
import { IconMapPin, IconLoader } from "@tabler/icons-react";

export interface PsgcAddressValue {
  regionPsgc: string;
  regionName: string;
  provincePsgc?: string;
  provinceName?: string;
  cityMunicipalityPsgc: string;
  cityMunicipalityName: string;
  barangayPsgc: string;
  barangayName: string;
  streetAddress?: string;
  zipCode?: string;
  formattedAddress: string;
}

export interface PsgcAddressPickerProps {
  value?: Partial<PsgcAddressValue>;
  onChange: (val: PsgcAddressValue) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export default function PsgcAddressPicker({
  value,
  onChange,
  disabled = false,
  required = false,
  className = "",
}: PsgcAddressPickerProps) {
  // Cascading lists
  const [regions, setRegions] = useState<PsgcLocationDto[]>([]);
  const [provinces, setProvinces] = useState<PsgcLocationDto[]>([]);
  const [cities, setCities] = useState<PsgcLocationDto[]>([]);
  const [barangays, setBarangays] = useState<PsgcLocationDto[]>([]);

  // Loading states
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  // Selected values
  const [regionPsgc, setRegionPsgc] = useState(value?.regionPsgc || "");
  const [provincePsgc, setProvincePsgc] = useState(value?.provincePsgc || "");
  const [cityPsgc, setCityPsgc] = useState(value?.cityMunicipalityPsgc || "");
  const [barangayPsgc, setBarangayPsgc] = useState(value?.barangayPsgc || "");
  const [street, setStreet] = useState(value?.streetAddress || "");
  const [zipCode, setZipCode] = useState(value?.zipCode || "");

  // NCR or chartered region check (e.g. NCR 1300000000 has direct cities)
  const isNcrOrDirectRegion = useMemo(() => {
    return regionPsgc === "1300000000" || (provinces.length === 0 && cities.length > 0);
  }, [regionPsgc, provinces.length, cities.length]);

  // Sync external value changes
  useEffect(() => {
    if (value?.regionPsgc && value.regionPsgc !== regionPsgc) {
      setRegionPsgc(value.regionPsgc);
    }
    if (value?.provincePsgc !== undefined && value.provincePsgc !== provincePsgc) {
      setProvincePsgc(value.provincePsgc);
    }
    if (value?.cityMunicipalityPsgc && value.cityMunicipalityPsgc !== cityPsgc) {
      setCityPsgc(value.cityMunicipalityPsgc);
    }
    if (value?.barangayPsgc && value.barangayPsgc !== barangayPsgc) {
      setBarangayPsgc(value.barangayPsgc);
    }
    if (value?.streetAddress !== undefined && value.streetAddress !== street) {
      setStreet(value.streetAddress);
    }
    if (value?.zipCode !== undefined && value.zipCode !== zipCode) {
      setZipCode(value.zipCode);
    }
  }, [value]);

  // 1. Load regions on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingRegions(true);
    locationService
      .getRegions()
      .then((data) => {
        if (isMounted) {
          setRegions(data);
          setLoadingRegions(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingRegions(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. When region changes, load provinces and direct cities (for NCR)
  useEffect(() => {
    if (!regionPsgc) {
      setProvinces([]);
      setCities([]);
      setBarangays([]);
      return;
    }

    let isMounted = true;
    setLoadingProvinces(true);

    locationService
      .getProvinces(regionPsgc)
      .then(async (provData) => {
        if (!isMounted) return;
        setProvinces(provData);
        setLoadingProvinces(false);

        // If NCR or zero provinces exist, load cities directly by region
        if (provData.length === 0 || regionPsgc === "1300000000") {
          setLoadingCities(true);
          const directCities = await locationService.getCities(undefined, regionPsgc);
          if (isMounted) {
            setCities(directCities);
            setLoadingCities(false);
          }
        }
      })
      .catch(() => {
        if (isMounted) setLoadingProvinces(false);
      });

    return () => {
      isMounted = false;
    };
  }, [regionPsgc]);

  // 3. When province changes (non-NCR), load cities
  useEffect(() => {
    if (regionPsgc === "1300000000") return; // Handled above
    if (!provincePsgc) {
      setCities([]);
      setBarangays([]);
      return;
    }

    let isMounted = true;
    setLoadingCities(true);
    locationService
      .getCities(provincePsgc, regionPsgc)
      .then((cityData) => {
        if (isMounted) {
          setCities(cityData);
          setLoadingCities(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingCities(false);
      });

    return () => {
      isMounted = false;
    };
  }, [provincePsgc, regionPsgc]);

  // 4. When city changes, load barangays
  useEffect(() => {
    if (!cityPsgc) {
      setBarangays([]);
      return;
    }

    let isMounted = true;
    setLoadingBarangays(true);
    locationService
      .getBarangays(cityPsgc)
      .then((brgyData) => {
        if (isMounted) {
          setBarangays(brgyData);
          setLoadingBarangays(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingBarangays(false);
      });

    return () => {
      isMounted = false;
    };
  }, [cityPsgc]);

  // Emit updated values whenever selections change
  const emitChange = useCallback(
    (
      newReg: string,
      newProv: string,
      newCity: string,
      newBrgy: string,
      newStreet: string,
      newZip: string
    ) => {
      const regionObj = regions.find((r) => r.psgcCode === newReg);
      const provinceObj = provinces.find((p) => p.psgcCode === newProv);
      const cityObj = cities.find((c) => c.psgcCode === newCity);
      const brgyObj = barangays.find((b) => b.psgcCode === newBrgy);

      const regionName = regionObj?.name || "";
      const provinceName = provinceObj?.name || "";
      const cityName = cityObj?.name || "";
      const brgyName = brgyObj?.name || "";

      const parts: string[] = [];
      if (newStreet.trim()) parts.push(newStreet.trim());
      if (brgyName) parts.push(`Brgy. ${brgyName}`);
      if (cityName) parts.push(cityName);
      if (provinceName && provinceName !== cityName) parts.push(provinceName);
      if (!provinceName && regionName && regionName !== cityName) parts.push(regionName);
      if (newZip.trim()) parts.push(newZip.trim());

      const formatted = parts.join(", ");

      onChange({
        regionPsgc: newReg,
        regionName,
        provincePsgc: newProv || undefined,
        provinceName: provinceName || undefined,
        cityMunicipalityPsgc: newCity,
        cityMunicipalityName: cityName,
        barangayPsgc: newBrgy,
        barangayName: brgyName,
        streetAddress: newStreet.trim() || undefined,
        zipCode: newZip.trim() || undefined,
        formattedAddress: formatted,
      });
    },
    [regions, provinces, cities, barangays, onChange]
  );

  return (
    <div className={`space-y-3.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-bold text-foreground">
        <IconMapPin className="w-4 h-4 text-primary shrink-0" />
        <span>Address</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Region */}
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <span>
              Region {required && <span className="text-destructive">*</span>}
            </span>
            {loadingRegions && (
              <IconLoader className="h-3 w-3 animate-spin text-primary" />
            )}
          </label>
          <SelectField
            ariaLabel="Region"
            value={regionPsgc}
            disabled={disabled || loadingRegions}
            required={required}
            placeholder="Select Region"
            onValueChange={(val) => {
              setRegionPsgc(val);
              setProvincePsgc("");
              setCityPsgc("");
              setBarangayPsgc("");
              emitChange(val, "", "", "", street, zipCode);
            }}
            options={regions.map((r) => ({
              value: r.psgcCode,
              label: r.name,
            }))}
          />
        </div>

        {/* Province (Hidden or disabled if NCR / single direct district) */}
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <span>
              Province {!isNcrOrDirectRegion && required && <span className="text-destructive">*</span>}
            </span>
            {loadingProvinces && (
              <IconLoader className="h-3 w-3 animate-spin text-primary" />
            )}
          </label>
          <SelectField
            ariaLabel="Province"
            value={provincePsgc}
            disabled={disabled || loadingProvinces || isNcrOrDirectRegion || !regionPsgc}
            required={!isNcrOrDirectRegion && required}
            placeholder={
              isNcrOrDirectRegion
                ? "Metro Manila (NCR - Direct Cities)"
                : !regionPsgc
                  ? "Select Region First"
                  : "Select Province"
            }
            onValueChange={(val) => {
              setProvincePsgc(val);
              setCityPsgc("");
              setBarangayPsgc("");
              emitChange(regionPsgc, val, "", "", street, zipCode);
            }}
            options={provinces.map((p) => ({
              value: p.psgcCode,
              label: p.name,
            }))}
          />
        </div>

        {/* City / Municipality */}
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <span>
              City / Municipality {required && <span className="text-destructive">*</span>}
            </span>
            {loadingCities && (
              <IconLoader className="h-3 w-3 animate-spin text-primary" />
            )}
          </label>
          <SelectField
            ariaLabel="City or Municipality"
            value={cityPsgc}
            disabled={disabled || loadingCities || (!provincePsgc && !isNcrOrDirectRegion)}
            required={required}
            placeholder={
              !regionPsgc
                ? "Select Region First"
                : !provincePsgc && !isNcrOrDirectRegion
                  ? "Select Province First"
                  : "Select City / Municipality"
            }
            onValueChange={(val) => {
              setCityPsgc(val);
              setBarangayPsgc("");
              const cityObj = cities.find((c) => c.psgcCode === val);
              const resolvedZip = cityObj?.zipCode || zipCode;
              if (cityObj?.zipCode) setZipCode(cityObj.zipCode);
              emitChange(regionPsgc, provincePsgc, val, "", street, resolvedZip);
            }}
            options={cities.map((c) => ({
              value: c.psgcCode,
              label: c.name,
            }))}
          />
        </div>

        {/* Barangay */}
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <span>
              Barangay {required && <span className="text-destructive">*</span>}
            </span>
            {loadingBarangays && (
              <IconLoader className="h-3 w-3 animate-spin text-primary" />
            )}
          </label>
          <SelectField
            ariaLabel="Barangay"
            value={barangayPsgc}
            disabled={disabled || loadingBarangays || !cityPsgc}
            required={required}
            placeholder={!cityPsgc ? "Select City / Municipality First" : "Select Barangay"}
            onValueChange={(val) => {
              setBarangayPsgc(val);
              emitChange(regionPsgc, provincePsgc, cityPsgc, val, street, zipCode);
            }}
            options={barangays.map((b) => ({
              value: b.psgcCode,
              label: b.name,
            }))}
          />
        </div>

        {/* Street / Building Address */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-foreground">
            House No. / Building / Street
          </label>
          <input
            type="text"
            value={street}
            disabled={disabled}
            placeholder="e.g. 123 Rizal Ave, Suite 4B"
            onChange={(e) => {
              const val = e.target.value;
              setStreet(val);
              emitChange(regionPsgc, provincePsgc, cityPsgc, barangayPsgc, val, zipCode);
            }}
            className="w-full px-3.5 py-2 rounded-xl border border-input text-xs bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>

        {/* ZIP Code */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-foreground">
            ZIP Code
          </label>
          <input
            type="text"
            value={zipCode}
            disabled={disabled}
            placeholder="e.g. 1109"
            maxLength={10}
            onChange={(e) => {
              const val = e.target.value;
              setZipCode(val);
              emitChange(regionPsgc, provincePsgc, cityPsgc, barangayPsgc, street, val);
            }}
            className="w-full px-3.5 py-2 rounded-xl border border-input text-xs font-mono bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
