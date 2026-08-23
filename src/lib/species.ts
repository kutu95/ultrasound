export const SPECIES_OPTIONS = ['dog', 'cat', 'other'] as const;
export type SpeciesOption = (typeof SPECIES_OPTIONS)[number];

export function parseSpecies(stored: string): { kind: SpeciesOption; other: string } {
  const lower = stored.trim().toLowerCase();
  if (lower === 'dog' || lower === 'canine') return { kind: 'dog', other: '' };
  if (lower === 'cat' || lower === 'feline') return { kind: 'cat', other: '' };
  if (stored.trim()) return { kind: 'other', other: stored.trim() };
  return { kind: 'dog', other: '' };
}

export function formatSpecies(kind: SpeciesOption, other: string): string {
  if (kind === 'other') return other.trim();
  return kind;
}

export function displaySpecies(species: string): string {
  const { kind, other } = parseSpecies(species);
  if (kind === 'other') return other || 'other';
  return kind;
}
