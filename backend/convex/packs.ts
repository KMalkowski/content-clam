export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  amountCents: number;
  currency: "usd";
  stripePriceEnv: string;
}

export const PACKS: readonly CreditPack[] = [
  { id: "starter", name: "Starter", credits: 500, amountCents: 100, currency: "usd", stripePriceEnv: "STRIPE_PRICE_STARTER" },
  { id: "regular", name: "Regular", credits: 3000, amountCents: 500, currency: "usd", stripePriceEnv: "STRIPE_PRICE_REGULAR" },
  { id: "heavy", name: "Heavy", credits: 8000, amountCents: 1000, currency: "usd", stripePriceEnv: "STRIPE_PRICE_HEAVY" },
];

export const TRIAL_BUDGET_TOTAL = 200_000;

export function findPack(id: string): CreditPack | undefined {
  return PACKS.find((p) => p.id === id);
}
