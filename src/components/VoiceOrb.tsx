"use client";

export type OrbState = "idle" | "speaking" | "listening" | "thinking";

export function VoiceOrb({
  state,
  amplitude = 0,
  size = 260,
}: {
  state: OrbState;
  amplitude?: number;
  size?: number;
}) {
  const amp = Math.max(0, Math.min(1, amplitude));
  return (
    <div
      className="voice-orb"
      data-state={state}
      style={
        {
          width: size,
          height: size,
          ["--amp" as string]: amp.toFixed(3),
        } as React.CSSProperties
      }
      aria-hidden
    >
      <div className="voice-orb__halo" />
      <div className="voice-orb__ring" />
      <div className="voice-orb__body">
        <div className="voice-orb__surface" />
        <div className="voice-orb__surface voice-orb__surface--2" />
        <div className="voice-orb__core" />
        <div className="voice-orb__highlight" />
      </div>
    </div>
  );
}
