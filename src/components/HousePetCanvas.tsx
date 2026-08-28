import { useEffect, useRef } from "react";
import { DEFAULT_APPEARANCE, drawPet, PET_CANVAS_SIZE } from "./Pet";
import { PetState } from "../engine/types";
import { Appearance } from "../types/petStatus";

export type HouseActivity = "idle" | "eating" | "happy" | "excited" | "sleep";

interface HousePetCanvasProps {
  activity: HouseActivity;
  appearance?: Appearance;
  reduceMotion?: boolean;
}

// The Pet House doesn't need the overlay's roaming/idle state machine — the
// pet just waits near the bed until fed/played with. This maps the house's
// small activity set onto the same PetState shape drawPet() already knows
// how to render, so the art (Pet.tsx) never has to know it's being reused
// here.
function toPetState(activity: HouseActivity): PetState {
  return {
    x: 0,
    y: 0,
    facing: "right",
    activity: activity === "eating" ? "sit" : activity,
    activityTimeLeft: 0,
    walkSpeed: 0,
    isDragging: false,
  };
}

export function HousePetCanvas({
  activity,
  appearance = DEFAULT_APPEARANCE,
  reduceMotion = false,
}: HousePetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const start = performance.now();
    const loop = (now: number) => {
      drawPet(ctx, toPetState(activity), (now - start) / 1000, appearance, reduceMotion);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [activity, appearance, reduceMotion]);

  return <canvas ref={canvasRef} width={PET_CANVAS_SIZE} height={PET_CANVAS_SIZE} />;
}
