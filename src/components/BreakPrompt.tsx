interface BreakPromptProps {
  onPlay: () => void;
  onSkip: () => void;
}

/**
 * Section 24: a gentle, non-aggressive break nudge — never a modal, never
 * blocking, no red badge or sound. Rendered by the overlay next to the pet
 * when the break timer elapses.
 */
export function BreakPrompt({ onPlay, onSkip }: BreakPromptProps) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        padding: "10px 12px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
        fontFamily: "sans-serif",
        fontSize: 13,
        color: "#5c3a44",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: 190,
      }}
    >
      <span>🐾 Play with me for 30 seconds?</span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={onPlay}
          style={{
            flex: 1,
            padding: "6px 0",
            borderRadius: 8,
            border: "none",
            background: "#f6b8c4",
            color: "#5c3a44",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Play
        </button>
        <button
          onClick={onSkip}
          style={{
            flex: 1,
            padding: "6px 0",
            borderRadius: 8,
            border: "1px solid #f0d5da",
            background: "#fff",
            color: "#7a5a63",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
