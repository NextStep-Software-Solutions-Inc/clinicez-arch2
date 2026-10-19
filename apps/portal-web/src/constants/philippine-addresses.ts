export interface PhilippineRegion {
  code: string;
  name: string;
  provinces: PhilippineProvince[];
}

export interface PhilippineProvince {
  name: string;
  cities: PhilippineCity[];
}

export interface PhilippineCity {
  name: string;
  zipCode: string;
  barangays: string[];
}

export const PHILIPPINE_REGIONS: PhilippineRegion[] = [
  {
    code: "NCR",
    name: "National Capital Region (NCR - Metro Manila)",
    provinces: [
      {
        name: "Metro Manila",
        cities: [
          {
            name: "Makati City",
            zipCode: "1200",
            barangays: ["Bel-Air", "Poblacion", "San Lorenzo", "Forbes Park", "Dasmariñas", "San Antonio", "Palanan", "Bangkal", "Pio del Pilar", "Guadalupe Nuevo", "Magallanes", "Urdaneta"],
          },
          {
            name: "Taguig City",
            zipCode: "1630",
            barangays: ["Fort Bonifacio (BGC)", "Western Bicutan", "Pinagsama", "Ususan", "Bambang", "Hagonoy", "Tanyag", "Upper Bicutan", "Signal Village"],
          },
          {
            name: "Quezon City",
            zipCode: "1100",
            barangays: ["Diliman", "Cubao (Kaunlaran)", "Batasan Hills", "Commonwealth", "Loyola Heights", "New Manila (Mariana)", "Kamuning", "Tandang Sora", "Fairview", "Novaliches Proper", "South Triangle", "Holy Spirit"],
          },
          {
            name: "City of Manila",
            zipCode: "1000",
            barangays: ["Ermita", "Malate", "Binondo", "Quiapo", "Sampaloc", "Santa Cruz", "Santa Ana", "San Miguel", "Paco", "Pandacan", "Port Area", "San Andres Bukid", "Tondo"],
          },
          {
            name: "Pasig City",
            zipCode: "1600",
            barangays: ["San Antonio (Ortigas)", "Ugong", "Kapasigan", "Rosario", "Maybunga", "Manggahan", "Caniogan", "Bambang", "Pinagbuhatan", "San Nicolas"],
          },
          {
            name: "Mandaluyong City",
            zipCode: "1550",
            barangays: ["Wack-Wack Greenhills", "Highway Hills", "Plainview", "Barangka Ilaya", "Barangka Drive", "Malamig", "Pleasant Hills", "Hulo"],
          },
          {
            name: "San Juan City",
            zipCode: "1500",
            barangays: ["Greenhills", "West Crame", "Little Baguio", "Addition Hills", "Kabayanan", "Corazon de Jesus", "Progreso"],
          },
          {
            name: "Parañaque City",
            zipCode: "1700",
            barangays: ["BF Homes", "Moonwalk", "San Dionisio", "Don Bosco", "Sun Valley", "San Antonio", "Baclaran", "Tambo", "Marcelo Green"],
          },
          {
            name: "Pasay City",
            zipCode: "1300",
            barangays: ["Barangay 76 (MOA Complex)", "Malibay", "Maricaban", "San Jose", "San Isidro", "Santo Niño", "Villamor Air Base"],
          },
          {
            name: "Muntinlupa City",
            zipCode: "1770",
            barangays: ["Alabang", "Ayala Alabang", "Putatan", "Poblacion", "Tunasan", "Cupang", "Bayanan", "Buli", "Sucat"],
          },
          {
            name: "Las Piñas City",
            zipCode: "1740",
            barangays: ["Almanza Uno", "Almanza Dos", "Pamplona Tres", "Pulang Lupa Dos", "BF International/CAA", "Talon Uno", "Zapote"],
          },
          {
            name: "Marikina City",
            zipCode: "1800",
            barangays: ["Concepcion Uno", "Marikina Heights", "Santo Niño", "Barangka", "San Roque", "Parang", "Nangka"],
          },
          {
            name: "Caloocan City",
            zipCode: "1400",
            barangays: ["Grace Park Commercial", "Monumento", "Bagong Barrio", "Camarin", "Bagumbong", "Tala"],
          },
          {
            name: "Valenzuela City",
            zipCode: "1440",
            barangays: ["Karuhatan", "Malinta", "Gen. T. de Leon", "Marulas", "Poblacion"],
          },
        ],
      },
    ],
  },
  {
    code: "REGION-IVA",
    name: "Region IV-A (CALABARZON)",
    provinces: [
      {
        name: "Cavite",
        cities: [
          {
            name: "Imus City",
            zipCode: "4103",
            barangays: ["Bucandala", "Buhay na Tubig", "Carsadang Bago", "Malagasang", "Poblacion", "Tanzang Luma"],
          },
          {
            name: "Bacoor City",
            zipCode: "4102",
            barangays: ["Molino III", "Molino IV", "Mambog", "Panapaan", "Habay", "Niog", "Talaba"],
          },
          {
            name: "Dasmariñas City",
            zipCode: "4114",
            barangays: ["Salitran", "Burol", "Sampaloc", "Paliparan", "San Agustin", "Zone I (Poblacion)"],
          },
          {
            name: "Tagaytay City",
            zipCode: "4120",
            barangays: ["Kaybagal", "Maharlika", "Mendez Crossing", "Sungay", "Iruhin", "Tolentino"],
          },
          {
            name: "General Trias City",
            zipCode: "4107",
            barangays: ["Manggahan", "San Francisco", "Buenavista", "Tejero", "Pasong Camachile"],
          },
          {
            name: "Silang",
            zipCode: "4118",
            barangays: ["Biga", "Lalaan", "Puting Kahoy", "Sabutan", "Tibig"],
          },
        ],
      },
      {
        name: "Laguna",
        cities: [
          {
            name: "Santa Rosa City",
            zipCode: "4026",
            barangays: ["Balibago", "Don Jose", "Dita", "Tagapo", "Malitlit", "Macabling", "Poblacion"],
          },
          {
            name: "Calamba City",
            zipCode: "4027",
            barangays: ["Canlubang", "Halang", "Pansol", "Real", "Turbina", "Bucal", "Parian"],
          },
          {
            name: "Biñan City",
            zipCode: "4024",
            barangays: ["San Antonio", "Platero", "Santo Tomas", "Canlalay", "San Vicente"],
          },
          {
            name: "San Pedro City",
            zipCode: "4023",
            barangays: ["San Vicente", "Pacita Complex", "Landayan", "Calendola", "Nueva"],
          },
          {
            name: "Los Baños",
            zipCode: "4030",
            barangays: ["Batong Malake", "College (UPLB)", "Mayondon", "Baybayin", "San Antonio"],
          },
        ],
      },
      {
        name: "Batangas",
        cities: [
          {
            name: "Batangas City",
            zipCode: "4200",
            barangays: ["Poblacion", "Alangilan", "Kumintang Ibaba", "Kumintang Ilaya", "Bolbok", "Balagtas"],
          },
          {
            name: "Lipa City",
            zipCode: "4217",
            barangays: ["Marawoy", "Sabang", "Tambong", "Banay-banay", "Inosluban", "Mataas na Lupa"],
          },
          {
            name: "Tanauan City",
            zipCode: "4232",
            barangays: ["Darasa", "Sambat", "Natatas", "Poblacion", "Trapiche"],
          },
        ],
      },
      {
        name: "Rizal",
        cities: [
          {
            name: "Antipolo City",
            zipCode: "1870",
            barangays: ["Mayamot", "San Roque", "Dela Paz", "Cupang", "Mambugan", "Beverly Hills"],
          },
          {
            name: "Cainta",
            zipCode: "1900",
            barangays: ["San Andres", "San Isidro", "San Juan", "San Roque", "Santa Rosa"],
          },
          {
            name: "Taytay",
            zipCode: "1920",
            barangays: ["San Juan", "Dolores", "San Isidro", "Muzon", "Santa Ana"],
          },
        ],
      },
    ],
  },
  {
    code: "REGION-III",
    name: "Region III (Central Luzon)",
    provinces: [
      {
        name: "Pampanga",
        cities: [
          {
            name: "City of San Fernando",
            zipCode: "2000",
            barangays: ["Dolores", "San Agustin", "Sindalan", "Telebastagan", "San Jose", "Poblacion"],
          },
          {
            name: "Angeles City",
            zipCode: "2009",
            barangays: ["Balibago", "Malabanias", "Cutcut", "Anunas", "Pandan", "Sto. Rosario"],
          },
          {
            name: "Mabalacat City (Clark)",
            zipCode: "2010",
            barangays: ["Clark Freeport Zone", "Dau", "Mamatitang", "Camachiles", "San Francisco"],
          },
        ],
      },
      {
        name: "Bulacan",
        cities: [
          {
            name: "Malolos City",
            zipCode: "3000",
            barangays: ["Guinhawa", "Tikay", "Dakila", "Bulihan", "Cofradia", "Catmon"],
          },
          {
            name: "Meycauayan City",
            zipCode: "3020",
            barangays: ["Bancal", "Calvario", "Camalig", "Malhacan", "Perez", "Saluysoy"],
          },
          {
            name: "City of San Jose del Monte",
            zipCode: "3023",
            barangays: ["Tungkong Mangga", "Muzon", "Sapang Palay", "Graceville", "Kaypian"],
          },
        ],
      },
      {
        name: "Bataan",
        cities: [
          {
            name: "City of Balanga",
            zipCode: "2100",
            barangays: ["Poblacion", "Camacho", "Doña Francisca", "Puerto Rivas", "Tuyo"],
          },
          {
            name: "Mariveles",
            zipCode: "2105",
            barangays: ["Alas-asin", "Baseco Country", "Batangas II", "Lucanin", "Malaya"],
          },
        ],
      },
    ],
  },
  {
    code: "REGION-VII",
    name: "Region VII (Central Visayas)",
    provinces: [
      {
        name: "Cebu",
        cities: [
          {
            name: "Cebu City",
            zipCode: "6000",
            barangays: ["Lahug (IT Park)", "Banilad", "Mabolo", "Guadalupe", "Capitol Site", "Kasambagan", "Zapatera", "Apas", "Kamputhaw"],
          },
          {
            name: "Mandaue City",
            zipCode: "6014",
            barangays: ["Subangdaku", "Tipolo", "Banilad", "Cabancalan", "Centro", "Guizo", "Bakilid"],
          },
          {
            name: "Lapu-Lapu City",
            zipCode: "6015",
            barangays: ["Mactan", "Punta Engaño", "Basak", "Maribago", "Pajac", "Gun-ob", "Poblacion"],
          },
        ],
      },
      {
        name: "Bohol",
        cities: [
          {
            name: "Tagbilaran City",
            zipCode: "6300",
            barangays: ["Cogon", "Dao", "Poblacion I", "Poblacion II", "Taloto", "Mansasa", "Bool"],
          },
        ],
      },
    ],
  },
  {
    code: "REGION-XI",
    name: "Region XI (Davao Region)",
    provinces: [
      {
        name: "Davao del Sur",
        cities: [
          {
            name: "Davao City",
            zipCode: "8000",
            barangays: ["Poblacion District", "Buhangin", "Matina Crossing", "Lanang", "Bajada (J.P. Laurel)", "Toril", "Talomo", "Agdao", "Sasa"],
          },
        ],
      },
    ],
  },
  {
    code: "REGION-VI",
    name: "Region VI (Western Visayas)",
    provinces: [
      {
        name: "Iloilo",
        cities: [
          {
            name: "Iloilo City",
            zipCode: "5000",
            barangays: ["Mandurriao (Megaworld)", "City Proper", "Jaro", "Molo", "La Paz", "Lapuz", "Arevalo"],
          },
        ],
      },
      {
        name: "Negros Occidental",
        cities: [
          {
            name: "Bacolod City",
            zipCode: "6100",
            barangays: ["Mandalagan", "Villamonte", "Bata", "Mansilingan", "Singcang", "Taculing", "Tangub"],
          },
        ],
      },
    ],
  },
];

export const FACILITY_CLASSIFICATIONS: Record<string, { value: string; label: string; description: string }[]> = {
  Clinic: [
    {
      value: "Ambulatory Clinic",
      label: "Ambulatory / Outpatient Clinic",
      description: "Primary care, family medicine, specialist consultation, and outpatient treatment.",
    },
    {
      value: "Dental Clinic",
      label: "Dental Clinic / Oral Health Center",
      description: "Comprehensive oral health, dental surgery, restorative dentistry, and orthodontics.",
    },
    {
      value: "Multi-Specialty Center",
      label: "Multi-Specialty Medical Center",
      description: "Integrated multispecialty clinical practice with multi-doctor consultation suites.",
    },
    {
      value: "Hemodialysis Center",
      label: "Free-standing Hemodialysis Center",
      description: "Specialized ambulatory dialysis clinic accredited with PhilHealth and DOH HFSRB.",
    },
    {
      value: "Surgical Outpatient Center",
      label: "Ambulatory Surgical Center",
      description: "Same-day minor and elective surgical procedures under local or MAC anesthesia.",
    },
  ],
  Laboratory: [
    {
      value: "Primary Clinical Laboratory",
      label: "Primary Clinical Laboratory",
      description: "Routine hematology (CBC), urinalysis, fecalysis, and rapid test kits.",
    },
    {
      value: "Secondary Clinical Laboratory",
      label: "Secondary Clinical Laboratory",
      description: "Primary tests plus routine clinical chemistry, blood typing, and quantitative tests.",
    },
    {
      value: "Tertiary Clinical Laboratory",
      label: "Tertiary Clinical Laboratory",
      description: "Secondary tests plus specialized chemistry, microbiology, immunology, and histopathology.",
    },
    {
      value: "Diagnostic & Imaging Center",
      label: "Diagnostic Center with Medical Imaging",
      description: "Clinical pathology combined with Digital X-Ray, Ultrasound, 2D Echo, and ECG.",
    },
  ],
  Pharmacy: [
    {
      value: "Community Pharmacy",
      label: "Retail / Community Pharmacy",
      description: "Independent or chain retail dispensary providing OTC and prescription medications.",
    },
    {
      value: "Hospital / Clinical Pharmacy",
      label: "Hospital / Outpatient Dispensary",
      description: "Institution-based pharmacy managing inpatient orders, compounding, and discharge Rx.",
    },
    {
      value: "Specialty Pharmacy",
      label: "Specialty / Compounding Pharmacy",
      description: "Specialized cold-chain biologics, oncology infusions, and compounding services.",
    },
  ],
  Organization: [
    {
      value: "Healthcare Network",
      label: "Hospital & Clinic Enterprise Network",
      description: "Integrated health enterprise governing multi-branch clinic, lab, and pharmacy clusters.",
    },
  ],
};
