import { useState, useRef, useCallback, useEffect } from "react";
import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { isNative } from "./platform";

interface SpeechPlugin {
  available(): Promise<{ available: boolean }>;
  start(options?: { language?: string }): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  addListener(
    event: "partialResults",
    handler: (data: { transcript: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "finalResult",
    handler: (data: { transcript: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "error",
    handler: (data: { error: string; code: number }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const Speech = registerPlugin<SpeechPlugin>("Speech");

let availabilityChecked = false;
let nativeAvailable = false;

/**
 * Native speech recognition via Android's SpeechRecognizer.
 * Provides real-time streaming partial results (word-by-word preview)
 * with zero server round-trips.
 *
 * Exposes granular startListening/stopListening/cancelListening for
 * push-to-talk, plus toggleListening for simple toggle UIs.
 */
export function useNativeSpeech(onTranscript: (text: string) => void) {
  const [isSupported, setIsSupported] = useState(availabilityChecked ? nativeAvailable : false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const listenersRef = useRef<PluginListenerHandle[]>([]);
  // Ref mirror of isListening — prevents stale-closure guard in startListening
  // when user rapidly re-presses before React re-renders with updated state.
  const isListeningRef = useRef(false);

  useEffect(() => {
    if (!isNative) return;

    if (availabilityChecked) {
      setIsSupported(nativeAvailable);
      return;
    }

    Speech.available()
      .then(({ available }) => {
        availabilityChecked = true;
        nativeAvailable = available;
        setIsSupported(available);
      })
      .catch(() => {
        availabilityChecked = true;
        nativeAvailable = false;
        setIsSupported(false);
      });
  }, []);

  useEffect(() => {
    return () => {
      for (const handle of listenersRef.current) {
        handle.remove().catch(() => {});
      }
      listenersRef.current = [];
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!isSupported || isListeningRef.current) return;

    for (const handle of listenersRef.current) {
      handle.remove().catch(() => {});
    }
    listenersRef.current = [];

    try {
      const partialHandle = await Speech.addListener("partialResults", (data) => {
        if (data.transcript) {
          setInterimTranscript(data.transcript);
        }
      });

      const finalHandle = await Speech.addListener("finalResult", (data) => {
        isListeningRef.current = false;
        setIsListening(false);
        setInterimTranscript("");
        if (data.transcript) {
          onTranscriptRef.current(data.transcript);
        }
      });

      const errorHandle = await Speech.addListener("error", (data) => {
        isListeningRef.current = false;
        setIsListening(false);
        setInterimTranscript("");
        console.warn("[native-speech] error:", data.error, "code:", data.code);
      });

      listenersRef.current = [partialHandle, finalHandle, errorHandle];

      await Speech.start({ language: navigator.language || "en-US" });
      isListeningRef.current = true;
      setIsListening(true);
    } catch (err) {
      console.warn("[native-speech] start failed:", err);
      isListeningRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
    }
  }, [isSupported]);

  const stopListening = useCallback(async () => {
    if (!isListeningRef.current) return;
    try {
      await Speech.stop();
      // Android should deliver onResults → finalResult event resets state.
      // Safety: if finalResult doesn't arrive within 3s, force-reset to
      // prevent isListening from being stuck true indefinitely.
      setTimeout(() => {
        if (isListeningRef.current) {
          isListeningRef.current = false;
          setIsListening(false);
          setInterimTranscript("");
        }
      }, 3000);
    } catch {
      isListeningRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
    }
  }, []);

  const cancelListening = useCallback(async () => {
    if (!isListeningRef.current) return;
    try {
      await Speech.cancel();
    } catch {
      // fall through
    }
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript("");
    for (const handle of listenersRef.current) {
      handle.remove().catch(() => {});
    }
    listenersRef.current = [];
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isSupported, isListening, interimTranscript,
    startListening, stopListening, cancelListening, toggleListening,
  } as const;
}
