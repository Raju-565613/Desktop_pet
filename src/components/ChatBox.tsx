import { useState } from "react";
import { chatWithPet } from "../lib/api";

interface ChatLine {
  from: "user" | "pet";
  text: string;
  usedAi?: boolean;
}

/**
 * Section 44/45: talk to the pet, get a short in-character reply. Uses the
 * local rule-based dialogue unless the user has explicitly enabled AI and
 * saved a key in Settings — in which case a real (short) reply comes back
 * from the backend's optional Anthropic call. Real speech input (Section
 * 44's voice control) isn't implemented here — see README.
 */
export function ChatBox() {
  const [lines, setLines] = useState<ChatLine[]>([
    { from: "pet", text: "Mrow?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const message = input.trim();
    if (!message || sending) return;
    setInput("");
    setLines((l) => [...l, { from: "user", text: message }]);
    setSending(true);
    try {
      const { reply, used_ai } = await chatWithPet(message);
      setLines((l) => [...l, { from: "pet", text: reply, usedAi: used_ai }]);
    } catch {
      setLines((l) => [...l, { from: "pet", text: "..." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#fdf3f0",
          borderRadius: 10,
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 8,
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              alignSelf: line.from === "user" ? "flex-end" : "flex-start",
              background: line.from === "user" ? "#f6b8c4" : "#fff",
              borderRadius: 10,
              padding: "6px 10px",
              fontSize: 13,
              color: "#5c3a44",
              maxWidth: "80%",
            }}
          >
            {line.text}
            {line.usedAi && (
              <span style={{ fontSize: 9, color: "#b78a94", marginLeft: 6 }}>AI</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Talk to Mochi..."
          style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #f0d5da",
            fontSize: 13,
          }}
        />
        <button
          onClick={send}
          disabled={sending}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "#f6b8c4",
            color: "#5c3a44",
            fontSize: 13,
            cursor: sending ? "default" : "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
