// Default essential / non-essential tagging. Users can override any tag later
// (buildObligations applies ObligationTag overrides on top of this).

const ESSENTIAL_WORDS = [
  'rent', 'housing', 'mortgage', 'landlord',
  'utilit', 'electric', 'water', 'internet',
  'phone', 'mobile', 'wireless', 't-mobile', 'verizon', 'at&t',
  'insurance',
  'loan',
];

export function isEssential(category: string | undefined, name: string): boolean {
  const text = `${category ?? ''} ${name}`.toLowerCase();
  return ESSENTIAL_WORDS.some((word) => text.includes(word));
}
