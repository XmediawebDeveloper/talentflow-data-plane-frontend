"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// Avatar states
export type AvatarState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "hand_raised"
  | "waving"
  | "nodding";

// State priorities (higher = more important)
const STATE_PRIORITY: Record<AvatarState, number> = {
  speaking: 100,     // Highest - AI speaking
  waving: 90,        // Wave gesture
  hand_raised: 80,   // User gesture
  listening: 60,     // User speaking
  thinking: 40,      // Processing
  nodding: 30,       // Brief acknowledgment
  idle: 0,           // Lowest - default
};

interface UseAvatarStateConfig {
  onStateChange?: (state: AvatarState) => void;
}

export function useAvatarState(config?: UseAvatarStateConfig) {
  const [currentState, setCurrentState] = useState<AvatarState>("idle");
  const [handRaised, setHandRaised] = useState(false);
  const stateStack = useRef<AvatarState[]>([]);
  const noddingTimeout = useRef<NodeJS.Timeout | null>(null);
  const wavingTimeout = useRef<NodeJS.Timeout | null>(null);

  // Check if can switch to new state
  const canSwitchTo = useCallback((newState: AvatarState): boolean => {
    if (newState === "idle") return true;

    const currentPriority = STATE_PRIORITY[currentState];
    const newPriority = STATE_PRIORITY[newState];

    return newPriority >= currentPriority;
  }, [currentState]);

  // Set state with priority check
  const setState = useCallback((newState: AvatarState, force: boolean = false) => {
    if (force || canSwitchTo(newState)) {
      setCurrentState(newState);
      config?.onStateChange?.(newState);
    }
  }, [canSwitchTo, config]);

  // =====================
  // PUBLIC EVENT HANDLERS
  // =====================

  // User raises hand
  const raiseHand = useCallback(() => {
    setHandRaised(true);

    if (currentState !== "speaking") {
      setState("hand_raised");
    } else {
      // Queue for after AI stops speaking
      stateStack.current.push("hand_raised");
    }
  }, [currentState, setState]);

  // User lowers hand
  const lowerHand = useCallback(() => {
    setHandRaised(false);

    if (currentState === "hand_raised") {
      setState("idle");
    }
  }, [currentState, setState]);

  // Toggle hand raise
  const toggleHand = useCallback(() => {
    if (handRaised) {
      lowerHand();
    } else {
      raiseHand();
    }
  }, [handRaised, raiseHand, lowerHand]);

  // AI starts speaking
  const onAiStartSpeaking = useCallback(() => {
    setState("speaking", true);
  }, [setState]);

  // AI stops speaking
  const onAiStopSpeaking = useCallback(() => {
    if (handRaised) {
      setState("hand_raised");
    } else if (stateStack.current.length > 0) {
      const nextState = stateStack.current.pop()!;
      setState(nextState);
    } else {
      setState("idle");
    }
  }, [handRaised, setState]);

  // User starts speaking
  const onUserStartSpeaking = useCallback(() => {
    if (currentState !== "speaking" && currentState !== "hand_raised") {
      setState("listening");
    }
  }, [currentState, setState]);

  // User stops speaking
  const onUserStopSpeaking = useCallback(() => {
    if (currentState === "listening") {
      setState("thinking");
    }
  }, [currentState, setState]);

  // Processing/thinking
  const onProcessing = useCallback(() => {
    if (currentState !== "speaking" && currentState !== "hand_raised") {
      setState("thinking");
    }
  }, [currentState, setState]);

  // Brief nod (auto-returns to previous state)
  const nod = useCallback(() => {
    const previousState = currentState;

    if (currentState !== "speaking") {
      setState("nodding");

      // Clear existing timeout
      if (noddingTimeout.current) {
        clearTimeout(noddingTimeout.current);
      }

      // Return to previous state after 1 second
      noddingTimeout.current = setTimeout(() => {
        setState(previousState);
      }, 1000);
    }
  }, [currentState, setState]);

  // Wave back (auto-returns to previous state after animation)
  const wave = useCallback(() => {
    const previousState = currentState;

    if (currentState !== "speaking") {
      console.log("👋 Avatar waving back!");
      setState("waving");

      // Clear existing timeout
      if (wavingTimeout.current) {
        clearTimeout(wavingTimeout.current);
      }

      // Return to previous state after 2 seconds (wave animation duration)
      wavingTimeout.current = setTimeout(() => {
        setState(previousState === "waving" ? "idle" : previousState);
      }, 2000);
    }
  }, [currentState, setState]);

  // Reset to idle
  const reset = useCallback(() => {
    setHandRaised(false);
    stateStack.current = [];
    setState("idle", true);
  }, [setState]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (noddingTimeout.current) {
        clearTimeout(noddingTimeout.current);
      }
      if (wavingTimeout.current) {
        clearTimeout(wavingTimeout.current);
      }
    };
  }, []);

  return {
    // State
    currentState,
    handRaised,

    // Hand actions
    raiseHand,
    lowerHand,
    toggleHand,
    wave,

    // AI events
    onAiStartSpeaking,
    onAiStopSpeaking,

    // User events
    onUserStartSpeaking,
    onUserStopSpeaking,

    // Other
    onProcessing,
    nod,
    reset,

    // Direct state control (use with caution)
    setState,
  };
}
