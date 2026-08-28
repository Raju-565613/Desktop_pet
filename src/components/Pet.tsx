import { useCallback, useEffect, useRef } from "react";
import { PetState } from "../engine/types";
import { Appearance } from "../types/petStatus";

interface PetProps {
  state: PetState;
  appearance?: Appearance;
  /** Section 40 accessibility: freezes most animation to a gentle static bob. */
  reduceMotion?: boolean;
  onClick: () => void;
  onDragStart: (screenX: number, screenY: number) => void;
  onDrag: (screenX: number, screenY: number) => void;
  onDragEnd: (screenX: number, screenY: number) => void;
  /** Called with true when the pointer enters the pet's hit area, false when it leaves.
   *  Consumed by App to toggle OS-level click-through on the overlay window. */
  onHoverChange: (hovering: boolean) => void;
}

export const PET_CANVAS_SIZE = 96; // canvas is a fixed square; the pet is drawn centered within it
const SIZE = PET_CANVAS_SIZE;

export const DEFAULT_APPEARANCE: Appearance = {
  body_color: "#f6b8c4",
  ear_color: "#f191a5",
  ear_style: "cat",
  tail_style: "cat",
  accessory: "none",
  outfit: "none",
  outfit_color: "#e0577a",
};

function drawEars(
  ctx: CanvasRenderingContext2D,
  style: Appearance["ear_style"],
  earColor: string,
  bodyH: number,
  earWiggle: number
) {
  ctx.fillStyle = earColor;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 11, -bodyH - 6);
    ctx.rotate(side * (0.5 + earWiggle));
    ctx.beginPath();
    switch (style) {
      case "bunny":
        // Long, tall rounded ears.
        ctx.ellipse(0, -10, 4, 16, 0, 0, Math.PI * 2);
        break;
      case "bear":
        // Small round ears, closer to the head.
        ctx.arc(0, -2, 6, 0, Math.PI * 2);
        break;
      case "fox":
        // Larger, sharper triangle than the default cat ear.
        ctx.moveTo(-8, 9);
        ctx.lineTo(0, -13);
        ctx.lineTo(8, 9);
        ctx.closePath();
        break;
      case "cat":
      default:
        ctx.moveTo(-6, 8);
        ctx.lineTo(0, -8);
        ctx.lineTo(6, 8);
        ctx.closePath();
        break;
    }
    ctx.fill();
    ctx.restore();
  }
}

function drawTail(
  ctx: CanvasRenderingContext2D,
  style: Appearance["tail_style"],
  bodyColor: string,
  bodyH: number,
  tailWag: number
) {
  if (style === "none") return;
  ctx.save();
  ctx.translate(-16, -bodyH + 8);
  ctx.rotate(tailWag - 0.4);
  ctx.strokeStyle = bodyColor;
  ctx.lineCap = "round";

  if (style === "bunny") {
    // Bunny tails are short and round, not a wagging curve.
    ctx.restore();
    ctx.save();
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(-18, -bodyH + 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.lineWidth = style === "fox" ? 10 : 7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-14, -6, -12, -20);
  ctx.stroke();

  if (style === "fox") {
    // A fluffier tip for the fox tail — a soft circle at the end of the curve.
    ctx.beginPath();
    ctx.fillStyle = bodyColor;
    ctx.arc(-12, -20, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAccessory(
  ctx: CanvasRenderingContext2D,
  accessory: Appearance["accessory"],
  bodyH: number
) {
  if (accessory === "bow") {
    ctx.save();
    ctx.translate(9, -bodyH - 10);
    ctx.fillStyle = "#e0577a";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-6, -4);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(6, -4);
    ctx.lineTo(6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#c23f61";
    ctx.fill();
    ctx.restore();
  } else if (accessory === "glasses") {
    ctx.save();
    ctx.strokeStyle = "#3a2a30";
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 8, -bodyH / 2 - 2, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-3.5, -bodyH / 2 - 2);
    ctx.lineTo(3.5, -bodyH / 2 - 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawOutfit(
  ctx: CanvasRenderingContext2D,
  outfit: Appearance["outfit"],
  color: string,
  bodyH: number
) {
  if (outfit === "none") return;
  ctx.save();
  if (outfit === "bow_tie") {
    ctx.translate(0, -bodyH + 6);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-7, -5);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(7, -5);
    ctx.lineTo(7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#5c3a44";
    ctx.fill();
  } else if (outfit === "hoodie") {
    // A simple band around the lower body, like a hoodie hem.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.35, 21, bodyH * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (outfit === "scarf") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -bodyH + 4, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // A little dangling tail of fabric.
    ctx.beginPath();
    ctx.moveTo(6, -bodyH + 6);
    ctx.lineTo(10, -bodyH + 18);
    ctx.lineTo(4, -bodyH + 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws a small procedural pet. This stands in for a full modular
 * sprite/skeletal system — the shapes here are deliberately simple so
 * swapping in a real asset pipeline later doesn't require touching the
 * animation *logic*, only the draw calls. What Phase 5 *does* add is real
 * parameterization: ear/tail style, two colors, and an accessory are all
 * read from `appearance` rather than hardcoded, so this is already a
 * (small) modular character system, not a single fixed design.
 *
 * Exported (not just used internally) so the Pet House window can render
 * the exact same character rather than maintaining a second copy of the art.
 */
export function drawPet(
  ctx: CanvasRenderingContext2D,
  state: PetState,
  t: number,
  appearance: Appearance = DEFAULT_APPEARANCE,
  reduceMotion = false
) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.translate(SIZE / 2, SIZE - 10);

  const facingScale = state.facing === "left" ? -1 : 1;
  ctx.scale(facingScale, 1);

  // Vertical bob: idle breathes slowly, walk bobs faster, sleep/sit are still.
  let bob = 0;
  let squash = 1;
  let earWiggle = 0;
  let tilt = 0; // head/body tilt, used by "curious" and the "dance" sway
  let stretchX = 1; // horizontal stretch, used by "stretch"

  if (reduceMotion) {
    // Section 40: keep just a very small breathing motion, skip everything
    // energetic (bounce, squash, tilt, stretch) regardless of activity.
    bob = Math.sin(t * 1.5) * 0.6;
  } else {
    switch (state.activity) {
      case "idle":
        bob = Math.sin(t * 2) * 1.5;
        break;
      case "walk":
        bob = Math.abs(Math.sin(t * 10)) * 3;
        earWiggle = Math.sin(t * 10) * 0.08;
        break;
      case "sit":
        bob = 0;
        break;
      case "sleep":
        bob = Math.sin(t * 1.2) * 0.8;
        break;
      case "happy":
        bob = Math.abs(Math.sin(t * 14)) * 5;
        squash = 1 + Math.sin(t * 14) * 0.06;
        break;
      case "jump":
        bob = Math.abs(Math.sin(t * 8)) * 14;
        squash = 1 - Math.abs(Math.sin(t * 8)) * 0.15;
        break;
      case "drag":
        squash = 1.05;
        break;
      case "curious":
        bob = Math.sin(t * 3) * 1;
        tilt = Math.sin(t * 2.2) * 0.18;
        earWiggle = 0.15;
        break;
      case "stretch":
        bob = -2;
        stretchX = 1.22 + Math.sin(t * 3) * 0.04;
        squash = 0.82;
        break;
      case "excited":
        bob = Math.abs(Math.sin(t * 16)) * 8;
        squash = 1 + Math.sin(t * 16) * 0.1;
        earWiggle = Math.sin(t * 16) * 0.2;
        break;
      case "dance":
        bob = Math.abs(Math.sin(t * 8)) * 4;
        tilt = Math.sin(t * 6) * 0.35;
        break;
    }
  }

  ctx.translate(0, -bob);
  ctx.rotate(tilt);
  ctx.scale(stretchX, squash);

  const bodyColor = appearance.body_color;
  const earColor = appearance.ear_color;
  const outline = "#7a4a55";

  // Sitting/sleeping squashes the body flatter and shorter.
  const bodyH = state.activity === "sit" || state.activity === "sleep" ? 22 : 28;

  const tailWag =
    !reduceMotion &&
    (state.activity === "happy" || state.activity === "excited" || state.activity === "dance")
      ? Math.sin(t * 16) * 0.6
      : Math.sin(t * 2) * 0.15;
  drawTail(ctx, appearance.tail_style, bodyColor, bodyH, tailWag);

  // Body
  ctx.beginPath();
  ctx.ellipse(0, -bodyH / 2, 20, bodyH, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();

  drawOutfit(ctx, appearance.outfit, appearance.outfit_color, bodyH);
  drawEars(ctx, appearance.ear_style, earColor, bodyH, earWiggle);

  // Eyes
  const eyesClosed = state.activity === "sleep";
  ctx.fillStyle = outline;
  for (const side of [-1, 1]) {
    if (eyesClosed) {
      ctx.beginPath();
      ctx.moveTo(side * 8 - 4, -bodyH / 2 - 2);
      ctx.lineTo(side * 8 + 4, -bodyH / 2 - 2);
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(side * 8, -bodyH / 2 - 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sleep "Zzz"
  if (eyesClosed) {
    ctx.fillStyle = "#7a4a55";
    ctx.font = "10px sans-serif";
    ctx.fillText("z", 16, -bodyH - 4);
  }

  drawAccessory(ctx, appearance.accessory, bodyH);

  ctx.restore();
}

export function Pet({
  state,
  appearance = DEFAULT_APPEARANCE,
  reduceMotion = false,
  onClick,
  onDragStart,
  onDrag,
  onDragEnd,
  onHoverChange,
}: PetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const start = performance.now();
    const loop = (now: number) => {
      drawPet(ctx, state, (now - start) / 1000, appearance, reduceMotion);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // Re-subscribe whenever activity/facing/appearance/reduceMotion change so
    // the closure sees fresh values; position (x) is handled by the parent
    // repositioning the DOM node, not the canvas.
  }, [state.activity, state.facing, appearance, reduceMotion]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      draggingRef.current = true;
      onDragStart(e.clientX, e.clientY);
    },
    [onDragStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (draggingRef.current) {
        onDrag(e.clientX, e.clientY);
      }
    },
    [onDrag]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (draggingRef.current) {
        draggingRef.current = false;
        onDragEnd(e.clientX, e.clientY);
      } else {
        onClick();
      }
    },
    [onClick, onDragEnd]
  );

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{ cursor: "pointer", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
    />
  );
}
