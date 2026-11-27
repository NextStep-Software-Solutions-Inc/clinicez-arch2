import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React, { act, useState } from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import type { PsgcLocationDto, StructuredPsgcAddress } from '@shared/safe';
import { NCR_REGION_PSGC } from '../utils/addressValidation';

// ── Unify React instance across patient-app and workspace root ────────────────
for (const reactPkg of [
  '../../../node_modules/react',
  '../../../packages/comms-sdk/node_modules/react',
]) {
  try {
    mock.module(require.resolve(reactPkg), () => ({ ...React, default: React }));
  } catch { /* not present */ }
  try {
    mock.module(require.resolve(`${reactPkg}/jsx-runtime`), () => ReactJsxRuntime);
  } catch { /* not present */ }
  try {
    mock.module(require.resolve(`${reactPkg}/jsx-dev-runtime`), () => ReactJsxDevRuntime);
  } catch { /* not present */ }
}
mock.module('react', () => ({ ...React, default: React }));
mock.module('react/jsx-runtime', () => ReactJsxRuntime);
mock.module('react/jsx-dev-runtime', () => ReactJsxDevRuntime);

const { createRoot } = await import('react-dom/client');
type Root = ReturnType<typeof createRoot>;

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// ── Minimal DOM container for React 19 createRoot ────────────────────────────
function createFakeDocument() {
  const createNode = (tagName: string) => {
    const node: any = {
      nodeType: 1,
      nodeName: tagName.toUpperCase(),
      tagName: tagName.toUpperCase(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      childNodes: [] as any[],
      style: {},
      ownerDocument: null as any,
      parentNode: null as any,
      appendChild(child: any) {
        child.parentNode = node;
        node.childNodes.push(child);
        return child;
      },
      removeChild(child: any) {
        const idx = node.childNodes.indexOf(child);
        if (idx >= 0) node.childNodes.splice(idx, 1);
        child.parentNode = null;
        return child;
      },
      insertBefore(child: any, ref: any) {
        child.parentNode = node;
        const idx = ref ? node.childNodes.indexOf(ref) : -1;
        if (idx >= 0) node.childNodes.splice(idx, 0, child);
        else node.childNodes.push(child);
        return child;
      },
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      removeAttribute() {},
    };
    return node;
  };

  const doc: any = {
    nodeType: 9,
    nodeName: '#document',
    defaultView: null as any,
    activeElement: null,
    documentElement: null as any,
    body: null as any,
    createElement(tag: string) {
      const el = createNode(tag);
      el.ownerDocument = doc;
      return el;
    },
    createTextNode(text: string) {
      return {
        nodeType: 3,
        nodeName: '#text',
        nodeValue: text,
        ownerDocument: doc,
        parentNode: null,
      };
    },
    addEventListener() {},
    removeEventListener() {},
  };
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  doc.defaultView = {
    document: doc,
    Node: function Node() {},
    Element: function Element() {},
    HTMLElement: class FakeHTMLElement {},
    HTMLIFrameElement: class FakeHTMLIFrameElement {},
    navigator: { userAgent: 'bun-test' },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({}),
  };
  return doc;
}

const fakeDoc = createFakeDocument();
(globalThis as any).window = fakeDoc.defaultView;
(globalThis as any).document = fakeDoc;
(globalThis as any).HTMLElement = fakeDoc.defaultView.HTMLElement;
(globalThis as any).HTMLIFrameElement = fakeDoc.defaultView.HTMLIFrameElement;

// ── Captured rendered child props ────────────────────────────────────────────
const capturedFields = new Map<string, any>();
const capturedModals = new Map<string, any>();

mock.module('../components/profile/ProfileFormField', () => ({
  default: (props: any) => {
    capturedFields.set(props.label, props);
    return null;
  },
}));

mock.module('../components/profile/ProfileToggle', () => ({
  default: () => null,
}));

mock.module('../components/profile/ProfileSelectModal', () => ({
  default: (props: any) => {
    capturedModals.set(props.title, props);
    return null;
  },
}));

// ── Mock locationService ─────────────────────────────────────────────────────
const MOCK_REGIONS: PsgcLocationDto[] = [
  { psgcCode: '0400000000', name: 'Region IV-A (CALABARZON)', level: 'Region', regionPsgc: '0400000000' },
  { psgcCode: NCR_REGION_PSGC, name: 'National Capital Region (NCR)', level: 'Region', regionPsgc: NCR_REGION_PSGC },
];

const MOCK_CALABARZON_PROVINCES: PsgcLocationDto[] = [
  { psgcCode: '0421000000', name: 'Cavite', level: 'Province', regionPsgc: '0400000000' },
  { psgcCode: '0434000000', name: 'Laguna', level: 'Province', regionPsgc: '0400000000' },
];

const MOCK_NCR_CITIES: PsgcLocationDto[] = [
  { psgcCode: '1339010000', name: 'City of Manila', level: 'CityMunicipality', regionPsgc: NCR_REGION_PSGC, zipCode: '1000' },
  { psgcCode: '1376020000', name: 'City of Makati', level: 'CityMunicipality', regionPsgc: NCR_REGION_PSGC, zipCode: '1200' },
  { psgcCode: '1376040000', name: 'City of Parañaque', level: 'CityMunicipality', regionPsgc: NCR_REGION_PSGC, zipCode: '1700' },
];

const MOCK_CAVITE_CITIES: PsgcLocationDto[] = [
  { psgcCode: '0421080000', name: 'City of Imus', level: 'CityMunicipality', regionPsgc: '0400000000', provincePsgc: '0421000000', zipCode: '4103' },
];

const MOCK_MAKATI_BARANGAYS: PsgcLocationDto[] = [
  { psgcCode: '137602002', name: 'Bel-Air', level: 'Barangay', regionPsgc: NCR_REGION_PSGC, cityMunicipalityPsgc: '1376020000' },
  { psgcCode: '137602023', name: 'Poblacion', level: 'Barangay', regionPsgc: NCR_REGION_PSGC, cityMunicipalityPsgc: '1376020000' },
];

const MOCK_IMUS_BARANGAYS: PsgcLocationDto[] = [
  { psgcCode: '042108001', name: 'Alapan I-A', level: 'Barangay', regionPsgc: '0400000000', provincePsgc: '0421000000', cityMunicipalityPsgc: '0421080000' },
];

let regionsResponse: PsgcLocationDto[] = MOCK_REGIONS;
let regionsDelayMs = 0;
const locationCalls: string[] = [];

mock.module('../services/api/locationService', () => ({
  locationService: {
    getRegions: async () => {
      locationCalls.push('getRegions');
      if (regionsDelayMs > 0) {
        await new Promise((r) => setTimeout(r, regionsDelayMs));
      }
      return regionsResponse;
    },
    getProvinces: async (regionPsgc?: string) => {
      locationCalls.push(`getProvinces:${regionPsgc ?? ''}`);
      if (regionPsgc === '0400000000') return MOCK_CALABARZON_PROVINCES;
      return [];
    },
    getCities: async (provincePsgc?: string, regionPsgc?: string) => {
      locationCalls.push(`getCities:${provincePsgc ?? ''}:${regionPsgc ?? ''}`);
      if (regionPsgc === NCR_REGION_PSGC && !provincePsgc) return MOCK_NCR_CITIES;
      if (provincePsgc === '0421000000') return MOCK_CAVITE_CITIES;
      return [];
    },
    getBarangays: async (cityPsgc: string) => {
      locationCalls.push(`getBarangays:${cityPsgc}`);
      if (cityPsgc === '1376020000') return MOCK_MAKATI_BARANGAYS;
      if (cityPsgc === '0421080000') return MOCK_IMUS_BARANGAYS;
      return [];
    },
    searchLocations: async () => [],
    clearMemoryCache: () => {},
  },
}));

const { default: CascadingAddressPicker } = await import('../components/profile/CascadingAddressPicker');

const flushAsync = async (cycles = 4) => {
  for (let i = 0; i < cycles; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
};

describe('Issue #298: CascadingAddressPicker hydration without PSGC codes', () => {
  let root: Root | null = null;
  let container: any = null;

  beforeEach(() => {
    capturedFields.clear();
    capturedModals.clear();
    locationCalls.length = 0;
    regionsResponse = MOCK_REGIONS;
    regionsDelayMs = 0;
    container = fakeDoc.createElement('div');
    fakeDoc.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  test('Issue #298 repro: NCR with regionName populated and regionPsgc=null unlocks City/Municipality, loads NCR cities, and enables Barangay on City selection', async () => {
    let latestValue: StructuredPsgcAddress | null = null;

    function ControlledHarness() {
      const [addr, setAddr] = useState<StructuredPsgcAddress>({
        regionPsgc: null,
        regionName: 'National Capital Region (NCR)',
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
      });
      latestValue = addr;
      return React.createElement(CascadingAddressPicker, {
        value: addr,
        onChange: setAddr,
        required: true,
      });
    }

    await act(async () => {
      root!.render(React.createElement(ControlledHarness));
    });
    await flushAsync();

    // Region PSGC was backfilled to canonical NCR 1300000000
    expect(latestValue!.regionPsgc).toBe(NCR_REGION_PSGC);
    expect(latestValue!.regionName).toBe('National Capital Region (NCR)');

    // Province picker is hidden for NCR
    expect(capturedFields.has('Province')).toBe(false);

    // City / Municipality picker MUST be enabled with loaded NCR cities (NOT locked on "Select Region first")
    const cityField = capturedFields.get('City / Municipality');
    expect(cityField).toBeDefined();
    expect(cityField.editable).toBe(true);
    expect(cityField.placeholder).toBe('Select City / Municipality');

    const cityModal = capturedModals.get('Select City / Municipality');
    expect(cityModal.options.map((o: any) => o.value)).toEqual([
      '1339010000',
      '1376020000',
      '1376040000',
    ]);
    expect(locationCalls).toContain(`getCities::${NCR_REGION_PSGC}`);

    // Barangay is still locked until a City is chosen
    expect(capturedFields.get('Barangay').editable).toBe(false);
    expect(capturedFields.get('Barangay').placeholder).toBe('Select City first');

    // User selects City of Makati -> Barangay unlocks and loads Makati barangays
    await act(async () => {
      cityModal.onSelect('1376020000');
    });
    await flushAsync();

    expect(latestValue!.regionPsgc).toBe(NCR_REGION_PSGC);
    expect(latestValue!.cityMunicipalityPsgc).toBe('1376020000');
    expect(latestValue!.cityMunicipalityName).toBe('City of Makati');
    expect(latestValue!.postalCode).toBe('1200');

    const barangayField = capturedFields.get('Barangay');
    expect(barangayField.editable).toBe(true);
    expect(barangayField.placeholder).toBe('Select Barangay');
    expect(capturedModals.get('Select Barangay').options.map((o: any) => o.label)).toEqual([
      'Bel-Air',
      'Poblacion',
    ]);
  });

  test('NCR still resolves regionPsgc=1300000000 and enables City/Municipality even if getRegions() returns empty', async () => {
    regionsResponse = [];
    let latestValue: StructuredPsgcAddress | null = null;

    function OfflineNcrHarness() {
      const [addr, setAddr] = useState<StructuredPsgcAddress>({
        regionPsgc: null,
        regionName: 'National Capital Region (NCR)',
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
      });
      latestValue = addr;
      return React.createElement(CascadingAddressPicker, {
        value: addr,
        onChange: setAddr,
      });
    }

    await act(async () => {
      root!.render(React.createElement(OfflineNcrHarness));
    });
    await flushAsync();

    expect(latestValue!.regionPsgc).toBe(NCR_REGION_PSGC);
    expect(capturedFields.get('City / Municipality').editable).toBe(true);
    expect(capturedModals.get('Select City / Municipality').options.length).toBe(3);
  });

  test('Legacy full text-only NCR address resolves regionPsgc, cityMunicipalityPsgc, and barangayPsgc automatically', async () => {
    let latestValue: StructuredPsgcAddress | null = null;

    function LegacyNcrHarness() {
      const [addr, setAddr] = useState<StructuredPsgcAddress>({
        regionPsgc: null,
        regionName: 'National Capital Region (NCR)',
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: 'Makati City',
        barangayPsgc: null,
        barangayName: 'Bel-Air',
        houseStreet: 'Unit 402, Ayala Ave',
      });
      latestValue = addr;
      return React.createElement(CascadingAddressPicker, {
        value: addr,
        onChange: setAddr,
      });
    }

    await act(async () => {
      root!.render(React.createElement(LegacyNcrHarness));
    });
    await flushAsync(6);

    expect(latestValue!.regionPsgc).toBe(NCR_REGION_PSGC);
    expect(latestValue!.cityMunicipalityPsgc).toBe('1376020000');
    expect(latestValue!.barangayPsgc).toBe('137602002');
    expect(latestValue!.postalCode).toBe('1200');
    expect(latestValue!.houseStreet).toBe('Unit 402, Ayala Ave');

    expect(capturedFields.get('City / Municipality').editable).toBe(true);
    expect(capturedFields.get('Barangay').editable).toBe(true);
    expect(capturedModals.get('Select City / Municipality').selected).toBe('1376020000');
    expect(capturedModals.get('Select Barangay').selected).toBe('137602002');
  });

  test('Legacy full text-only non-NCR address cascades and resolves all 4 PSGC tiers without clobbering concurrent user edits', async () => {
    regionsDelayMs = 25;
    let latestValue: StructuredPsgcAddress | null = null;

    function LegacyProvincialHarness() {
      const [addr, setAddr] = useState<StructuredPsgcAddress>({
        regionPsgc: null,
        regionName: 'Region IV-A',
        provincePsgc: null,
        provinceName: 'Cavite',
        cityMunicipalityPsgc: null,
        cityMunicipalityName: 'City of Imus',
        barangayPsgc: null,
        barangayName: 'Alapan I-A',
        houseStreet: 'Initial Street',
      });
      latestValue = addr;
      return React.createElement(CascadingAddressPicker, {
        value: addr,
        onChange: setAddr,
      });
    }

    await act(async () => {
      root!.render(React.createElement(LegacyProvincialHarness));
    });

    // Simulate user editing street address while regions are still loading
    await act(async () => {
      capturedFields.get('House / Unit / Building / Street').onChangeText('Updated Street 99');
    });

    await flushAsync(10);

    expect(latestValue!.regionPsgc).toBe('0400000000');
    expect(latestValue!.provincePsgc).toBe('0421000000');
    expect(latestValue!.cityMunicipalityPsgc).toBe('0421080000');
    expect(latestValue!.barangayPsgc).toBe('042108001');
    // User's concurrent street edit must NOT have been overwritten by async backfill
    expect(latestValue!.houseStreet).toBe('Updated Street 99');

    expect(capturedFields.get('Province').editable).toBe(true);
    expect(capturedFields.get('City / Municipality').editable).toBe(true);
    expect(capturedFields.get('Barangay').editable).toBe(true);
  });

  test('Guards against infinite onChange loops when caller supplies a no-op onChange', async () => {
    let onChangeCalls = 0;

    function NoOpParentHarness() {
      return React.createElement(CascadingAddressPicker, {
        value: {
          regionPsgc: null,
          regionName: 'National Capital Region (NCR)',
          cityMunicipalityPsgc: null,
          cityMunicipalityName: null,
          barangayPsgc: null,
          barangayName: null,
        },
        onChange: () => {
          onChangeCalls += 1;
        },
      });
    }

    await act(async () => {
      root!.render(React.createElement(NoOpParentHarness));
    });
    await flushAsync(5);

    expect(onChangeCalls).toBe(1);
    // Even with a no-op parent, City / Municipality is still enabled via effectiveRegionPsgc
    expect(capturedFields.get('City / Municipality').editable).toBe(true);
  });

  test('Partial non-NCR address (regionName only, regionPsgc=null) unlocks Province and keeps City disabled until Province is chosen', async () => {
    let latestValue: StructuredPsgcAddress | null = null;

    function PartialNonNcrHarness() {
      const [addr, setAddr] = useState<StructuredPsgcAddress>({
        regionPsgc: null,
        regionName: 'Region IV-A (CALABARZON)',
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
      });
      latestValue = addr;
      return React.createElement(CascadingAddressPicker, {
        value: addr,
        onChange: setAddr,
      });
    }

    await act(async () => {
      root!.render(React.createElement(PartialNonNcrHarness));
    });
    await flushAsync(6);

    expect(latestValue!.regionPsgc).toBe('0400000000');
    expect(capturedFields.get('Province').editable).toBe(true);
    expect(capturedModals.get('Select Province').options.map((o: any) => o.value)).toEqual([
      '0421000000',
      '0434000000',
    ]);
    expect(capturedFields.get('City / Municipality').editable).toBe(false);
    expect(capturedFields.get('City / Municipality').placeholder).toBe('Select Province first');
    expect(capturedFields.get('Barangay').editable).toBe(false);
  });

  test('Switching from hydrated NCR address to non-NCR region cleanly resets downstream fields and reveals Province', async () => {
    let latestValue: StructuredPsgcAddress | null = null;

    function SwitchRegionHarness() {
      const [addr, setAddr] = useState<StructuredPsgcAddress>({
        regionPsgc: null,
        regionName: 'National Capital Region (NCR)',
        cityMunicipalityPsgc: null,
        cityMunicipalityName: 'City of Makati',
        barangayPsgc: null,
        barangayName: 'Bel-Air',
      });
      latestValue = addr;
      return React.createElement(CascadingAddressPicker, {
        value: addr,
        onChange: setAddr,
      });
    }

    await act(async () => {
      root!.render(React.createElement(SwitchRegionHarness));
    });
    await flushAsync(6);

    expect(latestValue!.regionPsgc).toBe(NCR_REGION_PSGC);
    expect(latestValue!.cityMunicipalityPsgc).toBe('1376020000');

    // User switches Region to CALABARZON
    await act(async () => {
      capturedModals.get('Select Region').onSelect('0400000000');
    });
    await flushAsync(6);

    expect(latestValue!.regionPsgc).toBe('0400000000');
    expect(latestValue!.regionName).toBe('Region IV-A (CALABARZON)');
    expect(latestValue!.provincePsgc).toBeNull();
    expect(latestValue!.cityMunicipalityPsgc).toBeNull();
    expect(latestValue!.barangayPsgc).toBeNull();
    expect(capturedFields.get('Province').editable).toBe(true);
    expect(capturedFields.get('City / Municipality').editable).toBe(false);
    expect(capturedFields.get('Barangay').editable).toBe(false);
  });
});
