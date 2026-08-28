import { HousePetCanvas } from "./HousePetCanvas";
import { Accessory, Appearance, EarStyle, Outfit, TailStyle } from "../types/petStatus";

interface AppearanceEditorProps {
  appearance: Appearance;
  onChange: (appearance: Appearance) => void;
}

const EAR_STYLES: { id: EarStyle; label: string }[] = [
  { id: "cat", label: "Cat" },
  { id: "bunny", label: "Bunny" },
  { id: "bear", label: "Bear" },
  { id: "fox", label: "Fox" },
];

const TAIL_STYLES: { id: TailStyle; label: string }[] = [
  { id: "cat", label: "Cat" },
  { id: "fox", label: "Fox" },
  { id: "bunny", label: "Bunny" },
  { id: "none", label: "None" },
];

const ACCESSORIES: { id: Accessory; label: string }[] = [
  { id: "none", label: "None" },
  { id: "bow", label: "Bow" },
  { id: "glasses", label: "Glasses" },
];

const OUTFITS: { id: Outfit; label: string }[] = [
  { id: "none", label: "None" },
  { id: "bow_tie", label: "Bow Tie" },
  { id: "hoodie", label: "Hoodie" },
  { id: "scarf", label: "Scarf" },
];

function OptionRow<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 12, color: "#7a5a63", margin: "0 0 4px" }}>{label}</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            style={{
              padding: "5px 10px",
              borderRadius: 8,
              border: opt.id === value ? "2px solid #e0577a" : "1px solid #f0d5da",
              background: opt.id === value ? "#fbe4e9" : "#fff",
              fontSize: 12,
              color: "#5c3a44",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A deliberately small slice of Section 5-9's full Pet Creator: ear/tail
 * style, two colors, one accessory, with a live preview using the exact
 * same renderer as the overlay. Full body-shape choice and clothing/hair
 * layering aren't here — see the README for why that's a scoped-down
 * subset rather than a missing feature nobody thought about.
 */
export function AppearanceEditor({ appearance, onChange }: AppearanceEditorProps) {
  const update = (patch: Partial<Appearance>) => onChange({ ...appearance, ...patch });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: 12,
          background: "#fdf3f0",
          borderRadius: 12,
          marginBottom: 12,
        }}
      >
        <HousePetCanvas activity="idle" appearance={appearance} />
      </div>

      <OptionRow label="Ears" options={EAR_STYLES} value={appearance.ear_style} onSelect={(id) => update({ ear_style: id })} />
      <OptionRow label="Tail" options={TAIL_STYLES} value={appearance.tail_style} onSelect={(id) => update({ tail_style: id })} />
      <OptionRow label="Accessory" options={ACCESSORIES} value={appearance.accessory} onSelect={(id) => update({ accessory: id })} />
      <OptionRow label="Outfit" options={OUTFITS} value={appearance.outfit} onSelect={(id) => update({ outfit: id })} />

      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
        <label style={{ fontSize: 12, color: "#7a5a63", display: "flex", flexDirection: "column", gap: 4 }}>
          Body color
          <input
            type="color"
            value={appearance.body_color}
            onChange={(e) => update({ body_color: e.target.value })}
            style={{ width: 40, height: 28, border: "none", borderRadius: 6, cursor: "pointer" }}
          />
        </label>
        <label style={{ fontSize: 12, color: "#7a5a63", display: "flex", flexDirection: "column", gap: 4 }}>
          Ear color
          <input
            type="color"
            value={appearance.ear_color}
            onChange={(e) => update({ ear_color: e.target.value })}
            style={{ width: 40, height: 28, border: "none", borderRadius: 6, cursor: "pointer" }}
          />
        </label>
        {appearance.outfit !== "none" && (
          <label style={{ fontSize: 12, color: "#7a5a63", display: "flex", flexDirection: "column", gap: 4 }}>
            Outfit color
            <input
              type="color"
              value={appearance.outfit_color}
              onChange={(e) => update({ outfit_color: e.target.value })}
              style={{ width: 40, height: 28, border: "none", borderRadius: 6, cursor: "pointer" }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
