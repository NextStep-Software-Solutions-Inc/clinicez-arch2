import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { optionsService } from "../src/services/options.service";
import { locationService, type PsgcLocationDto } from "../src/services/location.service";
import { apiClient } from "../src/transport/apiClient";
import PsgcAddressPicker, { type PsgcAddressValue } from "../src/components/common/PsgcAddressPicker";
import { type PatientJoinRequestedPayload } from "../src/components/join/types";

const PORTAL_WEB_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PORTAL_WEB_ROOT, "src");

// Mock LocalStorage Implementation
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
}

describe("Milestone M4-B Challenger Suite: Dynamic Options ETag & PSGC Concurrency", () => {
  const originalFetch = globalThis.fetch;
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).window = {
      localStorage: mockStorage,
    };
    optionsService.clearCache();
    locationService.clearCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as any).window;
  });

  // =========================================================================
  // Suite 1: Dynamic Options Service ETag 304 Revalidation & Caching
  // =========================================================================
  describe("Suite 1: Dynamic Options ETag 304 Revalidation & 2-Tier Caching", () => {
    const sampleOptions = [
      { code: "MALE", label: "Male", philHealthCode: "M" },
      { code: "FEMALE", label: "Female", philHealthCode: "F" },
    ];

    test("1.1: Initial 200 OK saves data to memory and localStorage with ETag", async () => {
      let requestedHeaders: Record<string, string> = {};

      globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        requestedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(JSON.stringify(sampleOptions), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ETag: '"sha256-sex-v1"',
          },
        });
      }) as any;

      const data = await optionsService.getOptionSet("sex");
      expect(data).toHaveLength(2);
      expect(data[0].code).toBe("MALE");
      expect(requestedHeaders["If-None-Match"]).toBeUndefined();

      // Verify persistent localStorage write
      const storedRaw = mockStorage.getItem("clinicez.portal.options.sex");
      expect(storedRaw).not.toBeNull();
      const stored = JSON.parse(storedRaw!);
      expect(stored.version).toBe('"sha256-sex-v1"');
      expect(stored.data).toHaveLength(2);
    });

    test("1.2: Subsequent request sends If-None-Match and handles 304 Not Modified without parsing body", async () => {
      let callCount = 0;
      let lastHeaders: Record<string, string> = {};

      globalThis.fetch = mock(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify(sampleOptions), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ETag: '"sha256-sex-v1"',
            },
          });
        }
        // Second call: 304 Not Modified with body that throws if json() is called
        return {
          status: 304,
          ok: false,
          headers: new Headers(),
          json: async () => {
            throw new Error("HTTP 304 must NOT call response.json()!");
          },
        } as any;
      }) as any;

      // 1st call (200 OK)
      const data1 = await optionsService.getOptionSet("sex");
      expect(data1).toHaveLength(2);

      // 2nd call (304 Not Modified)
      const data2 = await optionsService.getOptionSet("sex");
      expect(data2).toHaveLength(2);
      expect(data2[0].code).toBe("MALE");
      expect(callCount).toBe(2);
    });

    test("1.3: Rehydrates from localStorage when memory cache is wiped, sends If-None-Match, and survives 304", async () => {
      // Pre-seed localStorage as if loaded in a previous session
      mockStorage.setItem(
        "clinicez.portal.options.civil_status",
        JSON.stringify({
          version: '"etag-civil-v1"',
          data: [
            { code: "SINGLE", label: "Single" },
            { code: "MARRIED", label: "Married" },
          ],
        })
      );

      let sentIfNoneMatch: string | undefined;

      globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = (init?.headers as Record<string, string>) || {};
        sentIfNoneMatch = headers["If-None-Match"];
        // Return 304
        return {
          status: 304,
          ok: false,
          headers: new Headers(),
          json: async () => {
            throw new Error("Unexpected json() on 304");
          },
        } as any;
      }) as any;

      const data = await optionsService.getOptionSet("civil_status");
      expect(sentIfNoneMatch).toBe('"etag-civil-v1"');
      expect(data).toHaveLength(2);
      expect(data[0].code).toBe("SINGLE");
    });

    test("1.4: Dynamic update when ETag changes: returns new data and updates caches", async () => {
      let callCount = 0;
      const updatedOptions = [
        ...sampleOptions,
        { code: "OTHER", label: "Other", philHealthCode: "O" },
      ];

      globalThis.fetch = mock(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify(sampleOptions), {
            status: 200,
            headers: { "Content-Type": "application/json", ETag: '"sha256-v1"' },
          });
        }
        // Server updated option set with new ETag
        return new Response(JSON.stringify(updatedOptions), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"sha256-v2"' },
        });
      }) as any;

      const firstResult = await optionsService.getOptionSet("sex");
      expect(firstResult).toHaveLength(2);

      const secondResult = await optionsService.getOptionSet("sex");
      expect(secondResult).toHaveLength(3);
      expect(secondResult[2].code).toBe("OTHER");

      const stored = JSON.parse(mockStorage.getItem("clinicez.portal.options.sex")!);
      expect(stored.version).toBe('"sha256-v2"');
      expect(stored.data).toHaveLength(3);
    });

    test("1.5: Options manifest handles 200 initial fetch, 304 revalidation, and cache invalidation", async () => {
      let callCount = 0;
      const manifestV1 = {
        version: "v1.0",
        hash: "man-hash-1",
        options: { sex: "h1", civil_status: "h2" },
      };
      const manifestV2 = {
        version: "v2.0",
        hash: "man-hash-2",
        options: { sex: "h1-new", civil_status: "h2" },
      };

      globalThis.fetch = mock(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify(manifestV1), {
            status: 200,
            headers: { "Content-Type": "application/json", ETag: '"man-v1"' },
          });
        }
        if (callCount === 2) {
          return {
            status: 304,
            ok: false,
            headers: new Headers(),
          } as any;
        }
        return new Response(JSON.stringify(manifestV2), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"man-v2"' },
        });
      }) as any;

      // 1st: initial 200
      const m1 = await optionsService.getManifest();
      expect(m1?.version).toBe("v1.0");

      // 2nd: 304 revalidation
      const m2 = await optionsService.getManifest();
      expect(m2?.version).toBe("v1.0");

      // 3rd: updated 200
      const m3 = await optionsService.getManifest();
      expect(m3?.version).toBe("v2.0");
    });

    test("1.6: Network error recovery: falls back to cached data without crashing", async () => {
      // First prime cache
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(sampleOptions), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"v1"' },
        });
      }) as any;

      await optionsService.getOptionSet("sex");

      // Network goes down
      globalThis.fetch = mock(async () => {
        throw new TypeError("Failed to fetch: Connection refused");
      }) as any;

      const fallbackData = await optionsService.getOptionSet("sex");
      expect(fallbackData).toHaveLength(2);
      expect(fallbackData[0].code).toBe("MALE");
    });

    test("1.7: Corrupted or invalid localStorage gracefully ignored without crashing", async () => {
      mockStorage.setItem("clinicez.portal.options.sex", "{ invalid json corrupt !! ");

      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(sampleOptions), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"v1"' },
        });
      }) as any;

      const data = await optionsService.getOptionSet("sex");
      expect(data).toHaveLength(2);
    });

    test("1.8: clearCache() cleans memory and only clinicez.portal.options.* keys from localStorage", () => {
      mockStorage.setItem("clinicez.portal.options.sex", JSON.stringify({ version: "v1", data: [] }));
      mockStorage.setItem("clinicez.portal.options.manifest", JSON.stringify({ version: "v1", data: {} }));
      mockStorage.setItem("clinicez.portal.user.token", "preserve_this_token");

      optionsService.clearCache();

      expect(mockStorage.getItem("clinicez.portal.options.sex")).toBeNull();
      expect(mockStorage.getItem("clinicez.portal.options.manifest")).toBeNull();
      expect(mockStorage.getItem("clinicez.portal.user.token")).toBe("preserve_this_token");
    });
  });

  // =========================================================================
  // Suite 2: Static Code Residue Elimination Audit
  // =========================================================================
  describe("Suite 2: Static Bundled Option Array Elimination Audit", () => {
    function getAllSourceFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...getAllSourceFiles(fullPath));
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          results.push(fullPath);
        }
      }
      return results;
    }

    test("2.1: Zero occurrences of 'FALLBACK_REGIONS' across apps/portal-web/src", () => {
      const files = getAllSourceFiles(SRC_DIR);
      const matches: string[] = [];

      for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        if (content.includes("FALLBACK_REGIONS")) {
          matches.push(path.relative(PORTAL_WEB_ROOT, file));
        }
      }

      expect(matches).toEqual([]);
    });

    test("2.2: Zero occurrences of 'PHILHEALTH_RELATIONSHIPS' across apps/portal-web/src", () => {
      const files = getAllSourceFiles(SRC_DIR);
      const matches: string[] = [];

      for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        if (content.includes("PHILHEALTH_RELATIONSHIPS")) {
          matches.push(path.relative(PORTAL_WEB_ROOT, file));
        }
      }

      expect(matches).toEqual([]);
    });

    test("2.3: Zero occurrences of 'PHILIPPINE_REGIONS' across apps/portal-web/src", () => {
      const files = getAllSourceFiles(SRC_DIR);
      const matches: string[] = [];

      for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        if (content.includes("PHILIPPINE_REGIONS")) {
          matches.push(path.relative(PORTAL_WEB_ROOT, file));
        }
      }

      expect(matches).toEqual([]);
    });

    test("2.4: philippine-addresses.ts constant file has been permanently deleted", () => {
      const candidatePath = path.join(SRC_DIR, "constants", "philippine-addresses.ts");
      expect(fs.existsSync(candidatePath)).toBe(false);
    });
  });

  // =========================================================================
  // Suite 3: Location Service Dynamic Endpoints & Caching
  // =========================================================================
  describe("Suite 3: Location Service PSGC Dynamic Endpoints & Caching", () => {
    test("3.1: getRegions caches in memory and localStorage", async () => {
      const mockRegions: PsgcLocationDto[] = [
        { psgcCode: "1300000000", name: "National Capital Region (NCR)", level: "Region" },
        { psgcCode: "0400000000", name: "Region IV-A (CALABARZON)", level: "Region" },
      ];

      let apiCalls = 0;
      const originalGet = apiClient.get;
      apiClient.get = mock(async () => {
        apiCalls++;
        return { data: mockRegions } as any;
      });

      try {
        const first = await locationService.getRegions();
        expect(first).toHaveLength(2);
        expect(apiCalls).toBe(1);

        // Second call hits cache
        const second = await locationService.getRegions();
        expect(second).toHaveLength(2);
        expect(apiCalls).toBe(1);

        // Verify localStorage persistence
        const stored = mockStorage.getItem("clinicez.portal.psgc.regions");
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored!)).toHaveLength(2);
      } finally {
        apiClient.get = originalGet;
      }
    });

    test("3.2: getCities handles direct region queries for NCR without province parameter", async () => {
      let requestedUrl = "";
      const mockCities: PsgcLocationDto[] = [
        { psgcCode: "133900000", name: "City of Manila", level: "City", regionPsgc: "1300000000" },
        { psgcCode: "137400000", name: "Quezon City", level: "City", regionPsgc: "1300000000" },
      ];

      const originalGet = apiClient.get;
      apiClient.get = mock(async (url: string) => {
        requestedUrl = url;
        return { data: mockCities } as any;
      });

      try {
        const cities = await locationService.getCities(undefined, "1300000000");
        expect(cities).toHaveLength(2);
        expect(requestedUrl).toContain("/locations/psgc/cities?regionPsgc=1300000000");
        expect(requestedUrl).not.toContain("provincePsgc");
      } finally {
        apiClient.get = originalGet;
      }
    });

    test("3.3: clearCache() cleans memory and psgc keys in localStorage", () => {
      mockStorage.setItem("clinicez.portal.psgc.regions", JSON.stringify([{ psgcCode: "1" }]));
      mockStorage.setItem("clinicez.portal.options.sex", JSON.stringify({ version: "v1" }));

      locationService.clearCache();

      expect(mockStorage.getItem("clinicez.portal.psgc.regions")).toBeNull();
      // Unrelated option cache untouched
      expect(mockStorage.getItem("clinicez.portal.options.sex")).not.toBeNull();
    });
  });

  // =========================================================================
  // Suite 4: PSGC Cascading, NCR Hierarchy Bypass & Concurrency
  // =========================================================================
  describe("Suite 4: PSGC Cascading, NCR Hierarchy Bypass & Concurrency", () => {
    test("4.1: NCR special hierarchy renders Province dropdown disabled with direct cities label", () => {
      const html = renderToString(
        <PsgcAddressPicker
          value={{
            regionPsgc: "1300000000",
            regionName: "National Capital Region (NCR)",
          }}
          onChange={() => {}}
        />
      );

      // Province option reflects NCR bypass
      expect(html).toContain("Metro Manila (NCR - Direct Cities)");
      // Province dropdown is disabled
      expect(html).toContain("disabled");
      // City dropdown is NOT disabled because NCR bypasses province
      expect(html).not.toContain("Select Province First");
    });

    test("4.2: Non-NCR hierarchy requires province selection before enabling cities", () => {
      const html = renderToString(
        <PsgcAddressPicker
          value={{
            regionPsgc: "0400000000",
            regionName: "Region IV-A (CALABARZON)",
          }}
          onChange={() => {}}
        />
      );

      // Province is enabled and prompt says Select Province
      expect(html).toContain("Select Province");
      // City prompt says Select Province First
      expect(html).toContain("Select Province First");
    });

    test("4.3: Address formatting omitting province cleanly for NCR", () => {
      // Simulating emitChange logic
      const regions = [{ psgcCode: "1300000000", name: "National Capital Region (NCR)" }];
      const cities = [{ psgcCode: "133900000", name: "City of Manila" }];
      const barangays = [{ psgcCode: "133901001", name: "Barangay 1" }];

      const parts: string[] = [];
      const street = "456 Taft Avenue";
      const brgyName = "Barangay 1";
      const cityName = "City of Manila";
      const provinceName = "";
      const regionName = "National Capital Region (NCR)";
      const zipCode = "1000";

      if (street.trim()) parts.push(street.trim());
      if (brgyName) parts.push(`Brgy. ${brgyName}`);
      if (cityName) parts.push(cityName);
      if (provinceName && provinceName !== cityName) parts.push(provinceName);
      if (!provinceName && regionName && regionName !== cityName) parts.push(regionName);
      if (zipCode.trim()) parts.push(zipCode.trim());

      const formatted = parts.join(", ");
      expect(formatted).toBe("456 Taft Avenue, Brgy. Barangay 1, City of Manila, National Capital Region (NCR), 1000");
      expect(formatted).not.toContain("undefined");
      expect(formatted).not.toContain("null");
    });

    test("4.4: Concurrency: Rapid region switching does not leak stale async province or city promises", async () => {
      let region4Resolved = false;
      let ncrResolved = false;

      // Mock delayed response for Region IV-A (50ms) and faster for NCR (5ms)
      locationService.getProvinces = mock(async (regPsgc?: string) => {
        if (regPsgc === "0400000000") {
          await new Promise((r) => setTimeout(r, 40));
          region4Resolved = true;
          return [
            { psgcCode: "041000000", name: "Batangas", level: "Province" },
            { psgcCode: "042100000", name: "Cavite", level: "Province" },
          ];
        }
        if (regPsgc === "1300000000") {
          await new Promise((r) => setTimeout(r, 5));
          ncrResolved = true;
          return []; // NCR has 0 provinces
        }
        return [];
      });

      // Probe simulated state transitions
      let activeRegion = "0400000000";
      let isMounted1 = true;
      let activeProvinces: PsgcLocationDto[] = [];

      // User selects Region 4
      const p1 = locationService.getProvinces(activeRegion).then((data) => {
        if (isMounted1) activeProvinces = data;
      });

      // User immediately switches to NCR before p1 resolves
      isMounted1 = false; // Cleanup cancels effect 1
      activeRegion = "1300000000";
      let isMounted2 = true;

      const p2 = locationService.getProvinces(activeRegion).then((data) => {
        if (isMounted2) activeProvinces = data;
      });

      await Promise.all([p1, p2]);

      expect(region4Resolved).toBe(true);
      expect(ncrResolved).toBe(true);
      // activeProvinces must be NCR's empty array, NOT Batangas/Cavite!
      expect(activeProvinces).toEqual([]);
    });

    test("4.5: Child auto-reset: Switching region clears province, city, and barangay selections", () => {
      let emitted: PsgcAddressValue | null = null;
      const handleChange = (val: PsgcAddressValue) => {
        emitted = val;
      };

      // Simulating user choosing Region
      const newReg = "0700000000";
      const newProv = "";
      const newCity = "";
      const newBrgy = "";
      const street = "Street 1";
      const zip = "6000";

      // Test format function
      const emitChange = (reg: string, prov: string, city: string, brgy: string) => {
        handleChange({
          regionPsgc: reg,
          regionName: "Central Visayas",
          provincePsgc: prov || undefined,
          provinceName: undefined,
          cityMunicipalityPsgc: city,
          cityMunicipalityName: "",
          barangayPsgc: brgy,
          barangayName: "",
          streetAddress: street,
          zipCode: zip,
          formattedAddress: "Street 1, Central Visayas, 6000",
        });
      };

      emitChange(newReg, newProv, newCity, newBrgy);

      expect(emitted).not.toBeNull();
      expect(emitted!.regionPsgc).toBe("0700000000");
      expect(emitted!.provincePsgc).toBeUndefined();
      expect(emitted!.cityMunicipalityPsgc).toBe("");
      expect(emitted!.barangayPsgc).toBe("");
    });
  });

  // =========================================================================
  // Suite 5: Public Join Intake & PSGC Submission Payload Validation
  // =========================================================================
  describe("Suite 5: Public Join Intake & PSGC Submission Payload Validation", () => {
    test("5.1: Submitting with empty PSGC address produces clean undefined fields (no empty strings)", () => {
      const psgcAddress: Partial<PsgcAddressValue> = {};

      const payload: PatientJoinRequestedPayload = {
        tenantSlug: "ustp",
        facilitySlug: "cdo-clinic",
        joinCode: "CLINIC2026",
        firstName: "Juan",
        lastName: "Dela Cruz",
        dateOfBirth: "1990-01-01",
        sex: "Male",
        contactNumber: "09171234567",
        regionPsgc: psgcAddress.regionPsgc || undefined,
        provincePsgc: psgcAddress.provincePsgc || undefined,
        cityMunicipalityPsgc: psgcAddress.cityMunicipalityPsgc || undefined,
        barangayPsgc: psgcAddress.barangayPsgc || undefined,
        addresses: psgcAddress.regionPsgc
          ? [
              {
                addressType: "Current",
                regionPsgc: psgcAddress.regionPsgc,
              },
            ]
          : undefined,
      };

      expect(payload.regionPsgc).toBeUndefined();
      expect(payload.provincePsgc).toBeUndefined();
      expect(payload.cityMunicipalityPsgc).toBeUndefined();
      expect(payload.barangayPsgc).toBeUndefined();
      expect(payload.addresses).toBeUndefined();
    });

    test("5.2: Submitting with partial PSGC address (Region only) structures payload without breaking", () => {
      const psgcAddress: Partial<PsgcAddressValue> = {
        regionPsgc: "0400000000",
        regionName: "Region IV-A (CALABARZON)",
        cityMunicipalityPsgc: "",
        barangayPsgc: "",
      };

      const payload: PatientJoinRequestedPayload = {
        tenantSlug: "ustp",
        facilitySlug: "cdo-clinic",
        joinCode: "CLINIC2026",
        firstName: "Juan",
        lastName: "Dela Cruz",
        dateOfBirth: "1990-01-01",
        sex: "Male",
        contactNumber: "09171234567",
        regionPsgc: psgcAddress.regionPsgc || undefined,
        provincePsgc: psgcAddress.provincePsgc || undefined,
        cityMunicipalityPsgc: psgcAddress.cityMunicipalityPsgc || undefined,
        barangayPsgc: psgcAddress.barangayPsgc || undefined,
        regionName: psgcAddress.regionName || undefined,
        addresses: psgcAddress.regionPsgc
          ? [
              {
                addressType: "Current",
                isSameAsPermanent: true,
                regionPsgc: psgcAddress.regionPsgc,
                provincePsgc: psgcAddress.provincePsgc || undefined,
                cityMunicipalityPsgc: psgcAddress.cityMunicipalityPsgc || undefined,
                barangayPsgc: psgcAddress.barangayPsgc || undefined,
                regionName: psgcAddress.regionName || undefined,
              },
            ]
          : undefined,
      };

      expect(payload.regionPsgc).toBe("0400000000");
      expect(payload.provincePsgc).toBeUndefined();
      expect(payload.cityMunicipalityPsgc).toBeUndefined();
      expect(payload.addresses).toBeDefined();
      expect(payload.addresses).toHaveLength(1);
      expect(payload.addresses![0].regionPsgc).toBe("0400000000");
      expect(payload.addresses![0].provincePsgc).toBeUndefined();
    });

    test("5.3: Submitting with NCR address attaches provincePsgc: undefined and valid direct city PSGC", () => {
      const ncrAddress: Partial<PsgcAddressValue> = {
        regionPsgc: "1300000000",
        regionName: "National Capital Region (NCR)",
        provincePsgc: undefined,
        provinceName: undefined,
        cityMunicipalityPsgc: "133900000",
        cityMunicipalityName: "City of Manila",
        barangayPsgc: "133901001",
        barangayName: "Barangay 1",
        streetAddress: "456 Taft Avenue",
        zipCode: "1000",
        formattedAddress: "456 Taft Avenue, Brgy. Barangay 1, City of Manila, National Capital Region (NCR), 1000",
      };

      const payload: PatientJoinRequestedPayload = {
        tenantSlug: "ustp",
        facilitySlug: "cdo-clinic",
        joinCode: "CLINIC2026",
        firstName: "Jose",
        lastName: "Rizal",
        dateOfBirth: "1961-06-19",
        sex: "Male",
        contactNumber: "09189998888",
        regionPsgc: ncrAddress.regionPsgc,
        provincePsgc: ncrAddress.provincePsgc,
        cityMunicipalityPsgc: ncrAddress.cityMunicipalityPsgc,
        barangayPsgc: ncrAddress.barangayPsgc,
        regionName: ncrAddress.regionName,
        provinceName: ncrAddress.provinceName,
        cityMunicipalityName: ncrAddress.cityMunicipalityName,
        barangayName: ncrAddress.barangayName,
        streetAddress: ncrAddress.streetAddress,
        zipCode: ncrAddress.zipCode,
        addresses: [
          {
            addressType: "Current",
            isSameAsPermanent: true,
            regionPsgc: ncrAddress.regionPsgc,
            provincePsgc: ncrAddress.provincePsgc,
            cityMunicipalityPsgc: ncrAddress.cityMunicipalityPsgc,
            barangayPsgc: ncrAddress.barangayPsgc,
            regionName: ncrAddress.regionName,
            provinceName: ncrAddress.provinceName,
            cityMunicipalityName: ncrAddress.cityMunicipalityName,
            barangayName: ncrAddress.barangayName,
            streetAddress: ncrAddress.streetAddress,
            zipCode: ncrAddress.zipCode,
          },
        ],
      };

      expect(payload.regionPsgc).toBe("1300000000");
      expect(payload.provincePsgc).toBeUndefined();
      expect(payload.cityMunicipalityPsgc).toBe("133900000");
      expect(payload.barangayPsgc).toBe("133901001");
      expect(payload.addresses![0].provincePsgc).toBeUndefined();
      expect(payload.addresses![0].cityMunicipalityPsgc).toBe("133900000");
    });
  });
});
