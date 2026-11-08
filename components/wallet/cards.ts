export type CardId = "buy" | "money" | "friends" | "huddles" | "household";
export type CardRoute = "/buy" | "/dashboard" | "/friends" | "/huddles" | "/household";

export const CARDS: Record<CardId, { title: string; to: CardRoute; face: string; hint: string }> = {
  buy: { title: "Can I Buy?", to: "/buy", face: "face-buy", hint: "Check a purchase" },
  money: { title: "My Money", to: "/dashboard", face: "face-money", hint: "Health score & accounts" },
  friends: { title: "Friends", to: "/friends", face: "face-friends", hint: "Add by username" },
  huddles: { title: "Huddles", to: "/huddles", face: "face-huddles", hint: "Plan a group purchase" },
  household: { title: "Household", to: "/household", face: "face-household", hint: "Shared, by consent" },
};

/** Slot order in the right interior, top to bottom. */
export const SLOT_ORDER: CardId[] = ["money", "friends", "huddles", "household"];

export function cardForPath(pathname: string): CardId | null {
  const hit = (Object.keys(CARDS) as CardId[]).find((id) => CARDS[id].to === pathname || (id === "huddles" && pathname.startsWith("/huddles/")));
  return hit ?? null;
}
