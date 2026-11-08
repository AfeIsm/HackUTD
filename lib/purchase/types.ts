// Shared shapes for the huddle purchase search. All money is integer cents.
import type { AgentStep } from '../types';

export type PurchaseCategory = 'product' | 'rental' | 'trip';
export type ChoiceMode = 'exact' | 'flexible';

// Only what the group explicitly allowed. Nothing here is ever assumed.
export interface Flexibility {
  alternativeBrands: boolean;
  refurbished: boolean;
  differentDates: boolean;
  nearbyLocations: boolean;
}

export interface PurchaseBrief {
  category: PurchaseCategory;
  description: string;
  url: string | null; // shown as a reference; the server never fetches it
  mode: ChoiceMode;
  flexibility: Flexibility;
  quantity: number;
  exactModel: string | null; // exact product model or property name
  condition: 'new' | 'any';
  deliverBy: string | null;
  location: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
  bedrooms: number | null;
  amenities: string[];
  assumedDates?: boolean; // nobody gave stay dates, so these are example dates
}

// One search result, normalized. Every field comes from the source; missing means unknown.
export interface Offer {
  key: string; // stable identity, used to avoid re-proposing a rejected offer
  kind: 'product' | 'rental';
  title: string;
  seller: string;
  link: string | null;
  linkIsSearch?: boolean; // the source gave no listing link, so this is a web search for it
  retrievedAt: string;
  demo: boolean;
  unitPrice?: number;
  oldPrice?: number;
  deliveryText?: string | null;
  condition?: string | null; // second-hand label, e.g. "refurbished"
  nights?: number;
  stayBeforeFees?: number | null;
  stayTotal?: number | null;
  amenities?: string[];
  essentialInfo?: string[];
  rating?: number | null;
  reviews?: number | null;
}

export interface PriceLine { label: string; amount: number | null } // null = unknown

export interface Priced {
  lines: PriceLine[];
  total: number; // everything known so far; unknownCosts are NOT in it
  basis: 'advertised' | 'estimated';
  unknownCosts: string[];
  tradeoffs: string[];
  underBudgetBy: number;
  belowListPriceBy: number | null;
}

export interface Proposal extends Priced {
  id: string;
  offerKey: string;
  kind: Offer['kind'];
  title: string;
  seller: string;
  link: string | null;
  linkIsSearch: boolean;
  retrievedAt: string;
  demo: boolean;
  deliveryText: string | null;
  why: string; // Nemotron's words, filtered before the group sees them
  planTotal: number; // what the huddle's total becomes if accepted (a trip keeps room for flights)
}

export type SearchTrigger = 'requested' | 'underfunded' | 'rejected';

export interface PurchaseSearch {
  runId: string;
  status: 'running' | 'done' | 'failed';
  trigger: SearchTrigger;
  startedAt: string;
  fundingKey: string; // total + committed when this run started, so one shortfall triggers one run
  steps: AgentStep[];
  proposals: Proposal[];
  noSolution: string | null;
  summary: string | null;
  usedDemo: boolean;
}

// Everyone with a login must accept before the plan is accepted.
export interface ProposalReview {
  proposal: Proposal;
  acceptedBy: string[]; // memberIds
}
