import { useEffect, useRef, useState } from "react";

interface MiniGameProps {
  onComplete: (score: number) => void;
  onCancel: () => void;
}

interface Star {
  id: number;
  x: number;
  y: number;
  speed: number;
}

const GAME_SECONDS = 15;
const WIDTH = 260;
const HEIGHT = 160;

/**
 * Section 25's "Catch the Star" micro-break activity: click falling stars
 * before they reach the bottom. Deliberately tiny (15 seconds, one game) —
 * these are meant to be a 30-second breather, not a real game session.
 */
export function MiniGame({ onComplete, onCancel }: MiniGameProps) {
  const [stars, setStars] = useState<Star[]>([]);
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(GAME_SECONDS);
  const nextId = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    const spawnInterval = window.setInterval(() => {
      setStars((s) => [
        ...s,
        { id: nextId.current++, x: 10 + Math.random() * (WIDTH - 30), y: -10, speed: 40 + Math.random() * 40 },
      ]);
    }, 700);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setStars((s) => s.map((st) => ({ ...st, y: st.y + st.speed * dt })).filter((st) => st.y < HEIGHT + 20));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const countdown = window.setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);

    return () => {
      window.clearInterval(spawnInterval);
      window.clearInterval(countdown);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0 && !finishedRef.current) {
      finishedRef.current = true;
      onComplete(score);
    }
  }, [secondsLeft, score, onComplete]);

  const catchStar = (id: number) => {
    setStars((s) => s.filter((st) => st.id !== id));
    setScore((sc) => sc + 1);
  };

  return (
    <div
      style={{
        width: WIDTH,
        background: "#fff",
        borderRadius: 14,
        padding: 10,
        boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#7a5a63", marginBottom: 6 }}>
        <span>⭐ Catch the Star</span>
        <span>{secondsLeft}s</span>
      </div>
      <div
        style={{
          position: "relative",
          width: WIDTH - 20,
          height: HEIGHT,
          background: "linear-gradient(180deg,#2b2456,#4a3f7a)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {stars.map((s) => (
          <button
            key={s.id}
            onClick={() => catchStar(s.id)}
            style={{
              position: "absolute",
              left: s.x,
              top: s.y,
              width: 22,
              height: 22,
              fontSize: 18,
              background: "none",
              border: "none",
              cursor: "pointer",
              lineHeight: "22px",
            }}
            aria-label="Catch star"
          >
            ⭐
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 12, color: "#7a5a63" }}>Score: {score}</span>
        <button
          onClick={onCancel}
          style={{ fontSize: 11, color: "#9c7a84", background: "none", border: "none", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
