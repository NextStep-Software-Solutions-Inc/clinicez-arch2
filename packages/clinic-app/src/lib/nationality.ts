import nationalityData from "@json/nationalities.json";

export interface Nationality {
  name: string;
}

const rawNationalities = nationalityData as string[];

const normalizedNationalities: Nationality[] = rawNationalities
  .map((name) => ({ name }))
  .sort((a, b) => a.name.localeCompare(b.name));

const nationalityLookup = normalizedNationalities.reduce<Map<string, Nationality>>((acc, nationality) => {
  acc.set(nationality.name.toLowerCase(), nationality);
  return acc;
}, new Map());

export const getNationalities = (): Nationality[] => normalizedNationalities;

export const getNationalityByName = (name: string): Nationality | undefined => {
  if (!name) {
    return undefined;
  }

  return nationalityLookup.get(name.trim().toLowerCase());
};

const POPULAR_NATIONALITY_NAMES = [
  "Filipino",
  "American",
  "Canadian",
  "British",
  "Australian",
  "Japanese",
  "Korean",
  "Chinese",
  "Singaporean",
  "Indian",
  "Malaysian",
  "Indonesian",
];

export const popularNationalities: string[] = Array.from(
  new Set(
    POPULAR_NATIONALITY_NAMES.filter((name) => nationalityLookup.has(name.toLowerCase()))
  )
);