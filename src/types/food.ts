export interface FoodCatalogEntry {
  id: string;
  label: string;
  hunger: number;
  happiness: number;
  bond: number;
  rarity_weight: number;
}

// Display-only — mirrors src-tauri/src/food.rs::CATALOG's ids. Kept separate
// from the backend-sourced catalog (fetched via get_food_catalog) so an
// emoji is always available immediately, even before that fetch resolves.
export const FOOD_EMOJI: Record<string, string> = {
  basic: "🥫",
  apple: "🍎",
  cookie: "🍪",
  treat: "🍬",
  cake: "🎂",
  golden_treat: "🌟",
};

export const MOCK_FOOD_CATALOG: FoodCatalogEntry[] = [
  { id: "basic", label: "Basic Food", hunger: 10, happiness: 2, bond: 0, rarity_weight: 50 },
  { id: "apple", label: "Apple", hunger: 15, happiness: 5, bond: 1, rarity_weight: 25 },
  { id: "cookie", label: "Cookie", hunger: 10, happiness: 10, bond: 1, rarity_weight: 15 },
  { id: "treat", label: "Treat", hunger: 5, happiness: 8, bond: 3, rarity_weight: 7 },
  { id: "cake", label: "Cake", hunger: 25, happiness: 20, bond: 5, rarity_weight: 2.5 },
  { id: "golden_treat", label: "Golden Treat", hunger: 30, happiness: 30, bond: 10, rarity_weight: 0.5 },
];
