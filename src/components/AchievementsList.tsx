import { AchievementStatus } from "../types/achievements";

interface AchievementsListProps {
  achievements: AchievementStatus[];
}

/** Section 37: cosmetic-only achievements, no pressure mechanics — just a
 *  list of what's unlocked and what isn't yet. */
export function AchievementsList({ achievements }: AchievementsListProps) {
  if (achievements.length === 0) {
    return <p style={{ fontSize: 12, color: "#9c7a84" }}>Loading achievements…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {achievements.map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 10,
            background: a.unlocked ? "#fbe4e9" : "#f7f0f1",
            opacity: a.unlocked ? 1 : 0.6,
          }}
        >
          <span style={{ fontSize: 20 }}>{a.unlocked ? "🏆" : "🔒"}</span>
          <div>
            <div style={{ fontSize: 13, color: "#5c3a44", fontWeight: 600 }}>{a.title}</div>
            <div style={{ fontSize: 11, color: "#9c7a84" }}>{a.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
