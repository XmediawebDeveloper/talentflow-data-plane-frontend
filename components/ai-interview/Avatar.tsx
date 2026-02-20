"use client";

import { useEffect, useState, useRef } from "react";

export type AvatarState = "idle" | "listening" | "thinking" | "speaking" | "hand_raised" | "waving" | "nodding";

interface AvatarProps {
  state: AvatarState;
  className?: string;
  mouthOpenness?: number;
}

import React from "react";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function useSmoothValue(value: number, speed = 0.18) {
  const ref = React.useRef(value);
  // Smooth every render (works fine if your component re-renders frequently while speaking)
  ref.current = lerp(ref.current, value, speed);
  return ref.current;
}

export function Avatar({ state, className = "", mouthOpenness = 0 }: AvatarProps) {
  const [headTilt, setHeadTilt] = useState(0);
  const [eyeBlink, setEyeBlink] = useState(false);
  const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
  const [handPosition, setHandPosition] = useState(0); // 0 = down, 1 = raised
  const [waveRotation, setWaveRotation] = useState(0); // For waving animation
  const animationRef = useRef<number | null>(null);
  const waveAnimationRef = useRef<number | null>(null);

  // Head movement when speaking
  useEffect(() => {
    if (state !== "speaking") {
      setHeadTilt(0);
      return;
    }
    const interval = setInterval(() => {
      setHeadTilt((Math.random() - 0.5) * 4);
    }, 400);
    return () => clearInterval(interval);
  }, [state]);

  // Nodding animation
  useEffect(() => {
    if (state !== "nodding") return;

    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      setHeadTilt(frame % 4 < 2 ? 3 : -1);
    }, 150);
    return () => {
      clearInterval(interval);
      setHeadTilt(0);
    };
  }, [state]);

  // Eye blinking
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setEyeBlink(true);
      setTimeout(() => setEyeBlink(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(blinkInterval);
  }, []);

  // Eye movement - natural looking around
  useEffect(() => {
    if (state === "listening") {
      // Look around when listening
      const interval = setInterval(() => {
        setEyePosition({
          x: (Math.random() - 0.5) * 6,
          y: (Math.random() - 0.5) * 3,
        });
      }, 1200);
      return () => clearInterval(interval);
    } else if (state === "hand_raised" || state === "waving") {
      // Look at the hand (to the left) in a friendly way
      const interval = setInterval(() => {
        setEyePosition({
          x: -3 + (Math.random() - 0.5) * 2, // Look slightly left with subtle movement
          y: -1 + (Math.random() - 0.5) * 1,
        });
      }, 800);
      return () => clearInterval(interval);
    } else {
      // Reset to center
      setEyePosition({ x: 0, y: 0 });
      return;
    }
  }, [state]);

  // Smooth hand raise animation
  useEffect(() => {
    const targetPosition = (state === "hand_raised" || state === "waving") ? 1 : 0;
    const speed = 0.2; // Even faster for responsive animation

    const animate = () => {
      setHandPosition(prev => {
        const diff = targetPosition - prev;
        if (Math.abs(diff) < 0.01) return targetPosition;
        return prev + diff * speed;
      });
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state]);

  // Waving animation (side-to-side)
  useEffect(() => {
    if (state !== "waving") {
      setWaveRotation(0);
      return;
    }

    let frame = 0;
    const animate = () => {
      frame++;
      // Smooth sine wave motion: -25° to +25°
      const rotation = Math.sin(frame * 0.3) * 25;
      setWaveRotation(rotation);
      waveAnimationRef.current = requestAnimationFrame(animate);
    };

    waveAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (waveAnimationRef.current) {
        cancelAnimationFrame(waveAnimationRef.current);
      }
      setWaveRotation(0);
    };
  }, [state]);

  const getStatusColor = () => {
    switch (state) {
      case "speaking": return "#22c55e";
      case "thinking": return "#eab308";
      case "listening": return "#3b82f6";
      case "waving": return "#ec4899";
      case "hand_raised": return "#f97316";
      case "nodding": return "#8b5cf6";
      default: return "#6b7280";
    }
  };

  const getStatusText = () => {
    switch (state) {
      case "speaking": return "Speaking";
      case "thinking": return "Thinking";
      case "listening": return "Listening";
      case "waving": return "Waving 👋";
      case "hand_raised": return "Hand Raised";
      case "nodding": return "Nodding";
      default: return "Ready";
    }
  };

  // Mouth animation - more natural and varied
  const mouthHeight = 2 + mouthOpenness * 20; // Larger variation
  const mouthWidth = 12 + mouthOpenness * 18; // Wider range - increased from 10 to 18
  // Add natural variation to avoid robotic look
  const mouthVariation = Math.sin(Date.now() * 0.003) * 2 * mouthOpenness;

  // Smooth mouth values (hooks must be called unconditionally)
  const smoothMouthOpenness = useSmoothValue(clamp(mouthOpenness ?? 0, 0, 1), 0.22);
  const smoothMouthWidth = useSmoothValue(clamp(mouthWidth ?? 18, 10, 35), 0.18); // Increased max from 28 to 35
  const smoothMouthVariation = clamp(mouthVariation ?? 0, -6, 6);

  // EXACT match to reference image - natural hand raise greeting
  const shoulderX = 70;
  const shoulderY = 340;

  // Elbow - STAYS DOWN when hand raises (natural position)
  const elbowDownX = 50;
  const elbowDownY = 380;
  const elbowUpX = 45; // Elbow LEFT and OUT
  const elbowUpY = 360; // Elbow STAYS DOWN (below shoulder)

  const elbowX = elbowDownX + (elbowUpX - elbowDownX) * handPosition;
  const elbowY = elbowDownY + (elbowUpY - elbowDownY) * handPosition;

  // Hand - LOWER, at cheek/jaw level, clearly visible
  const handDownX = 40;
  const handDownY = 400;
  const handUpX = 35; // To the side, separated from head
  const handUpY = 250; // LOWER DOWN - below cheek level

  const handX = handDownX + (handUpX - handDownX) * handPosition;
  const handY = handDownY + (handUpY - handDownY) * handPosition;

  // Palm stays STRAIGHT/UPRIGHT - NO rotation (fingers point UP)
  const palmRotation = 0; // Keep palm straight, not rotated!

  return (
    <div className={`relative ${className}`}>
      <div
        className="relative w-full h-full rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
        }}
      >
        <svg
          viewBox="0 0 300 400"
          className="w-full h-full"
          style={{
            transform: `rotate(${headTilt}deg)`,
            transition: "transform 0.3s ease-out",
          }}
        >
          {/* Background glow when speaking */}
          {state === "speaking" && (
            <circle cx="150" cy="180" r="140" fill="rgba(34, 197, 94, 0.15)">
              <animate attributeName="r" values="135;145;135" dur="1.5s" repeatCount="indefinite" />
            </circle>
          )}

          {/* Hand raised glow - BIGGER */}
          {state === "hand_raised" && (
            <circle cx="150" cy="180" r="140" fill="rgba(249, 115, 22, 0.25)">
              <animate attributeName="r" values="130;150;130" dur="0.8s" repeatCount="indefinite" />
            </circle>
          )}

          {/* Waving glow - PINK */}
          {state === "waving" && (
            <circle cx="150" cy="180" r="140" fill="rgba(236, 72, 153, 0.25)">
              <animate attributeName="r" values="135;155;135" dur="0.6s" repeatCount="indefinite" />
            </circle>
          )}

          {/* Neck & Shoulders */}
          <ellipse cx="150" cy="380" rx="100" ry="60" fill="#d4a574" />
          <rect x="120" y="280" width="60" height="80" fill="#d4a574" rx="10" />

          {/* Shirt/Collar */}
          <path
            d="M50 400 Q80 340 150 330 Q220 340 250 400 L250 420 L50 420 Z"
            fill="#1e40af"
          />
          <path
            d="M120 330 L150 360 L180 330"
            stroke="#1e3a8a"
            strokeWidth="3"
            fill="none"
          />

          {/* Right Arm (static) */}
          <ellipse cx="260" cy="360" rx="25" ry="40" fill="#1e40af" />

          {/* Head Shape */}
          <ellipse cx="150" cy="170" rx="85" ry="100" fill="#e8c4a0" />

          {/* Jaw line */}
          <path
            d="M65 180 Q70 260 150 280 Q230 260 235 180"
            fill="#e0b090"
          />

          {/* Hair */}
          <ellipse cx="150" cy="100" rx="80" ry="50" fill="#2d1f14" />
          <path
            d="M70 120 Q75 70 150 60 Q225 70 230 120 Q220 100 150 95 Q80 100 70 120"
            fill="#3d2a1a"
          />
          <ellipse cx="68" cy="150" rx="15" ry="40" fill="#2d1f14" />
          <ellipse cx="232" cy="150" rx="15" ry="40" fill="#2d1f14" />

          {/* Ears */}
          <ellipse cx="62" cy="175" rx="12" ry="20" fill="#d4a574" />
          <ellipse cx="238" cy="175" rx="12" ry="20" fill="#d4a574" />

          {/* Eyebrows - friendly expression when hand raised */}
          <path
            d="M95 130 Q115 122 135 128"
            stroke="#2d1f14"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            style={{
              transform: state === "thinking" ? "translateY(-3px)" : state === "hand_raised" ? "translateY(-2px)" : "none",
              transition: "transform 0.3s ease-out",
            }}
          />
          <path
            d="M165 128 Q185 122 205 130"
            stroke="#2d1f14"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            style={{
              transform: state === "thinking" ? "translateY(-3px)" : state === "hand_raised" ? "translateY(-2px)" : "none",
              transition: "transform 0.3s ease-out",
            }}
          />

          {/* Eyes */}
          <g transform={`translate(${eyePosition.x}, ${eyePosition.y})`}>
            <ellipse
              cx="115"
              cy="155"
              rx="18"
              ry={eyeBlink ? 2 : 12}
              fill="white"
              style={{ transition: "ry 0.1s" }}
            />
            {!eyeBlink && (
              <>
                <circle cx="115" cy="155" r="8" fill="#4a3728" />
                <circle cx="112" cy="152" r="3" fill="white" />
              </>
            )}

            <ellipse
              cx="185"
              cy="155"
              rx="18"
              ry={eyeBlink ? 2 : 12}
              fill="white"
              style={{ transition: "ry 0.1s" }}
            />
            {!eyeBlink && (
              <>
                <circle cx="185" cy="155" r="8" fill="#4a3728" />
                <circle cx="182" cy="152" r="3" fill="white" />
              </>
            )}
          </g>

          {/* Nose */}
          <path
            d="M150 160 L145 195 Q150 205 155 195 L150 160"
            fill="#d4a080"
            stroke="#c99070"
            strokeWidth="1"
          />
          <ellipse cx="142" cy="198" rx="6" ry="4" fill="#d4a080" />
          <ellipse cx="158" cy="198" rx="6" ry="4" fill="#d4a080" />

          {/* Mouth */}
          {state === "speaking" ? (
            (() => {
              // Use pre-calculated smooth values
              const o = smoothMouthOpenness;
              const w = smoothMouthWidth;
              const vRaw = smoothMouthVariation;

              // Use variation to gently shift between "wide" and "round" mouth
              // (If you later compute a real "roundness" from audio, replace this)
              const roundness = clamp(0.5 + vRaw * 0.06, 0, 1); // 0=wide, 1=round

              // Viseme-like blending:
              // - "EE" (wide) when roundness is low
              // - "OO" (round) when roundness is high
              // - "AA" (open) when openness is high
              const ee = clamp(1 - roundness, 0, 1);
              const oo = clamp(roundness, 0, 1);
              const aa = clamp(o, 0, 1);

              // Base geometry
              const cx = 150;
              const cy = 238;

              // Jaw drop (more natural than only changing ellipse ry)
              const jaw = 2 + aa * 10;

              // Mouth width changes by viseme:
              const wideBoost = 1 + ee * 0.35;
              const roundShrink = 1 - oo * 0.18;
              const rx = w * wideBoost * roundShrink;

              // Mouth opening height: AA opens more, OO opens less
              const openBase = 1.5 + aa * 9;
              const openOO = 1 - oo * 0.35;
              const ry = openBase * openOO;

              // Subtle asymmetry (humans are not perfectly symmetric)
              const asym = vRaw * 0.35; // small
              const leftLift = -1.2 + ee * -0.6 + asym * 0.15;
              const rightLift = -1.0 + ee * -0.4 - asym * 0.15;

              // Corner "smile tension" when EE happens
              const cornerUp = ee * 2.2;

              // Teeth/tongue opacity (fade instead of hard toggle)
              const teethAlpha = clamp((aa - 0.28) * 2.2, 0, 1);
              const tongueAlpha = clamp((aa - 0.18) * 1.8, 0, 1);

              // Lip thickness changes slightly with OO (pucker)
              const lipThick = 2.8 + oo * 1.2;

              // Mouth outline (inner opening) path — more “organic” than ellipse
              const topY = cy + leftLift - cornerUp;
              const botY = cy + jaw;

              const dInner = `
                M ${cx - rx} ${cy}
                C ${cx - rx * 0.55} ${topY} ${cx - rx * 0.2} ${topY - ry * 0.35} ${cx} ${topY}
                C ${cx + rx * 0.2} ${topY - ry * 0.35} ${cx + rx * 0.55} ${cy + rightLift - cornerUp} ${cx + rx} ${cy}
                C ${cx + rx * 0.55} ${botY} ${cx + rx * 0.2} ${botY + ry * 0.25} ${cx} ${botY}
                C ${cx - rx * 0.2} ${botY + ry * 0.25} ${cx - rx * 0.55} ${botY} ${cx - rx} ${cy}
                Z
              `;

              // Upper lip highlight line (subtle)
              const dUpper = `
                M ${cx - rx} ${cy}
                C ${cx - rx * 0.55} ${topY - 1} ${cx - rx * 0.15} ${topY - 2} ${cx} ${topY - 1}
                C ${cx + rx * 0.15} ${topY - 2} ${cx + rx * 0.55} ${cy + rightLift - cornerUp - 0.5} ${cx + rx} ${cy}
              `;

              return (
                <g>
                  {/* Dark mouth interior */}
                  <path d={dInner} fill="#2b1414" opacity={0.85} />

                  {/* Teeth (fade in) */}
                  <g opacity={teethAlpha}>
                    <path
                      d={`
                        M ${cx - rx * 0.72} ${cy - 0.5}
                        Q ${cx} ${cy + 1.5} ${cx + rx * 0.72} ${cy - 0.5}
                        Q ${cx} ${cy + 4.5} ${cx - rx * 0.72} ${cy - 0.5}
                        Z
                      `}
                      fill="#ffffff"
                      opacity={0.92}
                    />
                    {/* tiny separators (very subtle) */}
                    <line x1={cx - 6} y1={cy} x2={cx - 6} y2={cy + 3} stroke="#e6e6e6" strokeWidth="0.6" opacity="0.6" />
                    <line x1={cx} y1={cy} x2={cx} y2={cy + 3} stroke="#e6e6e6" strokeWidth="0.6" opacity="0.6" />
                    <line x1={cx + 6} y1={cy} x2={cx + 6} y2={cy + 3} stroke="#e6e6e6" strokeWidth="0.6" opacity="0.6" />
                  </g>

                  {/* Tongue (fade in, not always visible) */}
                  <g opacity={tongueAlpha}>
                    <path
                      d={`
                        M ${cx - rx * 0.55} ${cy + jaw * 0.55}
                        C ${cx - rx * 0.25} ${cy + jaw * 0.95} ${cx + rx * 0.25} ${cy + jaw * 0.95} ${cx + rx * 0.55} ${cy + jaw * 0.55}
                        C ${cx + rx * 0.25} ${cy + jaw * 1.25} ${cx - rx * 0.25} ${cy + jaw * 1.25} ${cx - rx * 0.55} ${cy + jaw * 0.55}
                        Z
                      `}
                      fill="#d85a5a"
                      opacity={0.85}
                    />
                  </g>

                  {/* Upper lip line */}
                  <path d={dUpper} fill="none" stroke="#a85a54" strokeWidth={lipThick} strokeLinecap="round" opacity={0.9} />

                  {/* Lip fill (soft) */}
                  <path
                    d={dUpper}
                    fill="none"
                    stroke="#c4726c"
                    strokeWidth={lipThick + 1.2}
                    strokeLinecap="round"
                    opacity={0.35}
                  />

                  {/* Lower lip shadow */}
                  <ellipse
                    cx={cx}
                    cy={cy + jaw + 2}
                    rx={rx * 0.78}
                    ry={2.4}
                    fill="#a85a54"
                    opacity={0.28}
                  />
                </g>
              );
            })()
          ) : state === "thinking" ? (
            // Gentle smile when thinking
            <path
              d="M125 235 Q150 245 175 235"
              stroke="#c4726c"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
          ) : state === "hand_raised" ? (
            // Warm smile when hand raised
            <path
              d="M125 235 Q150 248 175 235"
              stroke="#c4726c"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            // Default friendly smile (idle, listening, etc.)
            <path
              d="M125 235 Q150 245 175 235"
              stroke="#c4726c"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* Facial lines */}
          <path d="M100 180 Q95 200 100 220" stroke="#d4a080" strokeWidth="1" fill="none" opacity="0.5" />
          <path d="M200 180 Q205 200 200 220" stroke="#d4a080" strokeWidth="1" fill="none" opacity="0.5" />

          {/* LEFT ARM - Natural human-like with elbow bend */}
          <g>
            {/* Arm segments - fade out when hand raises so only hand visible */}
            <g opacity={1 - handPosition * 0.7}>
              {/* Upper arm - shoulder to elbow */}
              <line
                x1={shoulderX}
                y1={shoulderY}
                x2={elbowX}
                y2={elbowY}
                stroke="#1e40af"
                strokeWidth="32"
                strokeLinecap="round"
              />

              {/* Forearm - elbow to wrist */}
              <line
                x1={elbowX}
                y1={elbowY}
                x2={handX}
                y2={handY + 20}
                stroke="#1e40af"
                strokeWidth="28"
                strokeLinecap="round"
              />
            </g>

            {/* Hand/Palm - stays visible */}
            <g transform={`translate(${handX}, ${handY}) rotate(${palmRotation})`}>
              {/* Palm - prominent and visible like in photo */}
              <ellipse
                cx="0"
                cy="5"
                rx="26"
                ry="32"
                fill="#d4a574"
              />

              {/* Fingers - clearly visible and spread (like in photo) */}
              {handPosition > 0.3 && (
                <g>
                  {/* Thumb - on the side */}
                  <ellipse
                    cx="22"
                    cy="14"
                    rx="9"
                    ry="20"
                    fill="#d4a574"
                    transform="rotate(40 22 14)"
                  />
                  {/* Index finger */}
                  <ellipse
                    cx="12"
                    cy="-22"
                    rx="7"
                    ry="26"
                    fill="#d4a574"
                    transform="rotate(-8 12 -22)"
                  />
                  {/* Middle finger - longest */}
                  <ellipse
                    cx="3"
                    cy="-26"
                    rx="7"
                    ry="28"
                    fill="#d4a574"
                  />
                  {/* Ring finger */}
                  <ellipse
                    cx="-6"
                    cy="-24"
                    rx="7"
                    ry="26"
                    fill="#d4a574"
                    transform="rotate(8 -6 -24)"
                  />
                  {/* Pinky - shortest */}
                  <ellipse
                    cx="-15"
                    cy="-20"
                    rx="6"
                    ry="22"
                    fill="#d4a574"
                    transform="rotate(12 -15 -20)"
                  />
                </g>
              )}

              {/* Waving motion */}
              {state === "waving" && (
                <g transform={`rotate(${waveRotation})`}>
                  <ellipse cx="0" cy="-5" rx="3" ry="8" fill="rgba(255,255,255,0.3)" />
                </g>
              )}
            </g>
          </g>
        </svg>

        {/* Status Badge */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className="px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-lg">
            <span className="text-sm font-semibold text-white">Linda</span>
          </div>
          <div
            className="px-3 py-1.5 rounded-lg backdrop-blur-sm flex items-center gap-2"
            style={{ backgroundColor: `${getStatusColor()}dd` }}
          >
            <span
              className={`w-2 h-2 rounded-full bg-white ${state !== "idle" ? "animate-pulse" : ""}`}
            />
            <span className="text-xs font-medium text-white">{getStatusText()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
