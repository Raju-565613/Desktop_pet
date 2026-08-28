import { FOOD_EMOJI, FoodCatalogEntry } from "../types/food";

interface FoodInventoryProps {
  catalog: FoodCatalogEntry[];
  inventory: Record<string, number>;
  disabled: boolean;
  onSelect: (foodId: string) => void;
}

/** Section 15's food types, shown as a small grid the user picks from
 *  before feeding — rather than a single generic "feed" bowl button. */
export function FoodInventory({ catalog, inventory, disabled, onSelect }: FoodInventoryProps) {
  const owned = catalog.filter((f) => (inventory[f.id] ?? 0) > 0);

  if (owned.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "#9c7a84", margin: "6px 0" }}>
        No food yet — pet or play with {""}Mochi outside to earn some.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
      {owned.map((food) => (
        <button
          key={food.id}
          onClick={() => onSelect(food.id)}
          disabled={disabled}
          title={food.label}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            width: 52,
            padding: "6px 4px",
            borderRadius: 10,
            border: "1px solid #f0d5da",
            background: "#fff",
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <span style={{ fontSize: 20 }}>{FOOD_EMOJI[food.id] ?? "🍽️"}</span>
          <span style={{ fontSize: 10, color: "#7a5a63" }}>x{inventory[food.id]}</span>
        </button>
      ))}
    </div>
  );
}
