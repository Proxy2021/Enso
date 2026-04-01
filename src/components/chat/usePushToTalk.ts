import { useState, useRef, useCallback, useEffect } from "react";
import { useSpeechRecognition } from "../../lib/use-speech-recognition";
import { useVoiceRecorder } from "../../lib/use-voice-recorder";
import { useNativeSpeech } from "../../lib/use-native-speech";
import { isNative } from "../../lib/platform";
import { haptic } from "./chat-utils";

const CANCEL_THRESHOLD_PX = 100;

interface UsePushToTalkParams {
  disabled: boolean;
  sendMessage: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function usePushToTalk({ disabled, sendMessage, textareaRef }: UsePushToTalkParams) {
  // Doubao-style input mode toggle (mobile only)
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");

  // Push-to-talk state
  const [pttActive, setPttActive] = useState(false);
  const [pttCancelZone, setPttCancelZone] = useState(false);
  const [pttStartTime, setPttStartTime] = useState(0);
  const pttAccumulatedRef = useRef("");
  // State mirror of pttAccumulatedRef for render-safe display text.
  // The ref remains the source of truth for the send-on-release path,
  // but this state ensures pttDisplayText re-renders correctly.
  const [pttAccumulatedText, setPttAccumulatedText] = useState("");
  const pttStartYRef = useRef(0);
  const pttActiveRef = useRef(false);
  const pttCancelRef = useRef(false);

  // Speech-to-text hooks — PTT transcript accumulates in ref, not textarea
  const handlePttTranscript = useCallback((transcript: string) => {
    const sep = pttAccumulatedRef.current.length > 0 && !pttAccumulatedRef.current.endsWith(" ") ? " " : "";
    pttAccumulatedRef.current += sep + transcript;
    setPttAccumulatedText(pttAccumulatedRef.current);
  }, []);
  const speech = useSpeechRecognition(handlePttTranscript);
  const recorder = useVoiceRecorder(handlePttTranscript);
  const nativeSpeech = useNativeSpeech(handlePttTranscript);

  const isFallbackRecorder = isNative && !nativeSpeech.isSupported;
  const voice = isNative
    ? (nativeSpeech.isSupported ? nativeSpeech : recorder)
    : speech;
  const speechSupported = voice.isSupported !== undefined ? voice.isSupported : false;

  // Display text derived from state (not ref) — re-renders correctly when transcript updates.
  // pttAccumulatedRef.current remains the authoritative value for the send path.
  const pttDisplayText = pttActive
    ? ((pttAccumulatedText || "") + (voice.interimTranscript ? (pttAccumulatedText ? " " : "") + voice.interimTranscript : ""))
    : "";

  // Long-press detection for Doubao-style unified input (mobile only)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [textareaPttFlash, setTextareaPttFlash] = useState(false);

  const handleTextareaTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || !speechSupported) return;
    const touch = e.touches[0];
    longPressTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    pttStartYRef.current = touch.clientY;

    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      textareaRef.current?.blur();
      // Clear any text selection the browser may have started during the hold
      window.getSelection()?.removeAllRanges();
      pttAccumulatedRef.current = "";
      setPttAccumulatedText("");
      pttActiveRef.current = true;
      pttCancelRef.current = false;
      setPttActive(true);
      setPttCancelZone(false);
      setPttStartTime(Date.now());
      setTextareaPttFlash(true);
      haptic(30);
      voice.startListening();
      setTimeout(() => setTextareaPttFlash(false), 400);
    }, 300);
  }, [disabled, speechSupported, voice, textareaRef]);

  const handleTextareaTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const start = longPressTouchStartRef.current;
    if (start && longPressTimerRef.current) {
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
    if (pttActiveRef.current) {
      const dy = pttStartYRef.current - touch.clientY;
      const inCancel = dy > CANCEL_THRESHOLD_PX;
      if (inCancel !== pttCancelRef.current) {
        pttCancelRef.current = inCancel;
        setPttCancelZone(inCancel);
        haptic(10);
      }
    }
  }, []);

  const handleTextareaTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (!pttActiveRef.current) return;
    pttActiveRef.current = false;
    const wasCancelled = pttCancelRef.current;
    // Capture transcript BEFORE any stop/cancel clears it asynchronously
    const capturedInterim = voice.interimTranscript || "";
    const capturedAccum = pttAccumulatedRef.current || "";
    setPttActive(false);
    setPttCancelZone(false);
    if (wasCancelled) {
      voice.cancelListening();
      haptic([30, 50, 30]);
    } else {
      // stopListening (not cancel) lets the recognizer finalize cleanly,
      // resetting isListening via the finalResult/onend event.
      voice.stopListening();
      haptic(15);
      const sep = capturedAccum && capturedInterim ? " " : "";
      const finalText = (capturedAccum + sep + capturedInterim).trim();
      if (finalText) {
        sendMessage(finalText);
      }
    }
    pttAccumulatedRef.current = "";
    setPttAccumulatedText("");
  }, [voice, sendMessage]);

  // touchcancel fires when the OS steals the touch (e.g. native context
  // menu / copy modal on long press). Treat it as a cancel so PTT doesn't
  // get stuck with the timer counting indefinitely.
  const handleTextareaTouchCancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (!pttActiveRef.current) return;
    pttActiveRef.current = false;
    setPttActive(false);
    setPttCancelZone(false);
    voice.cancelListening();
    pttAccumulatedRef.current = "";
    setPttAccumulatedText("");
  }, [voice]);

  // Suppress the native context menu on the textarea while PTT is active.
  // Without this, holding the textarea for ~600ms triggers the OS copy/paste
  // popup which steals touch events and leaves PTT stuck.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const suppress = (e: Event) => {
      if (pttActiveRef.current) e.preventDefault();
    };
    el.addEventListener("contextmenu", suppress);
    return () => el.removeEventListener("contextmenu", suppress);
  }, [textareaRef]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Cancel any active PTT session (used by handleSend in ChatInput)
  const cancelPtt = useCallback(() => {
    if (!pttActiveRef.current) return;
    voice.cancelListening();
    pttActiveRef.current = false;
    setPttActive(false);
    setPttCancelZone(false);
    pttAccumulatedRef.current = "";
    setPttAccumulatedText("");
  }, [voice]);

  // Desktop pointer-based PTT handlers (for mic button in SendControls)
  const desktopPttHandlers: DesktopPttHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      pttAccumulatedRef.current = "";
      setPttAccumulatedText("");
      pttStartYRef.current = e.clientY;
      pttActiveRef.current = true;
      pttCancelRef.current = false;
      setPttActive(true);
      setPttCancelZone(false);
      setPttStartTime(Date.now());
      haptic(30);
      voice.startListening();
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!pttActiveRef.current) return;
      const dy = pttStartYRef.current - e.clientY;
      const inCancel = dy > CANCEL_THRESHOLD_PX;
      if (inCancel !== pttCancelRef.current) {
        pttCancelRef.current = inCancel;
        setPttCancelZone(inCancel);
      }
    },
    onPointerUp: () => {
      if (!pttActiveRef.current) return;
      pttActiveRef.current = false;
      const wasCancelled = pttCancelRef.current;
      setPttActive(false);
      setPttCancelZone(false);
      if (wasCancelled) {
        voice.cancelListening();
        haptic([30, 50, 30]);
      } else {
        voice.cancelListening();
        haptic(15);
        const finalText = (pttAccumulatedRef.current + (voice.interimTranscript ? (pttAccumulatedRef.current ? " " : "") + voice.interimTranscript : "")).trim();
        if (finalText) {
          sendMessage(finalText);
        }
      }
      pttAccumulatedRef.current = "";
      setPttAccumulatedText("");
    },
    onPointerCancel: () => {
      if (!pttActiveRef.current) return;
      pttActiveRef.current = false;
      setPttActive(false);
      setPttCancelZone(false);
      voice.cancelListening();
      pttAccumulatedRef.current = "";
      setPttAccumulatedText("");
    },
  };

  return {
    // State
    pttActive,
    pttCancelZone,
    pttStartTime,
    pttDisplayText,
    textareaPttFlash,
    inputMode,
    setInputMode,

    // Voice engine
    voice,
    speechSupported,
    isFallbackRecorder,
    recorder,

    // Desktop PTT pointer handlers
    desktopPttHandlers,
    cancelPtt,

    // Touch handlers
    handleTextareaTouchStart,
    handleTextareaTouchMove,
    handleTextareaTouchEnd,
    handleTextareaTouchCancel,
  };
}

export interface DesktopPttHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}
