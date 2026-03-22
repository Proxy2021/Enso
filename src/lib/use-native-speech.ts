import { useState, useRef, useCallback, useEffect } from "react";
import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { isNative } from "./platform";

interface SpeechPlugin {
  available(): Promise<{ available: boolean }>;
  start(options?: { language?: string }): Promise<void>;
  stop(): Promise<void>;
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
 * On non-native platforms or devices without speech recognition,
 * returns isSupported=false so callers can fall back gracefully.
 */
export function useNativeSpeech(onTranscript: (text: string) => void) {
  const [isSupported, setIsSupported] = useState(availabilityChecked ? nativeAvailable : false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const listenersRef = useRef<PluginListenerHandle[]>([]);

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
    if (!isSupported || isListening) return;

    // Clean up any stale listeners
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
        setIsListening(false);
        setInterimTranscript("");
        if (data.transcript) {
          onTranscriptRef.current(data.transcript);
        }
      });

      const errorHandle = await Speech.addListener("error", (data) => {
        setIsListening(false);
        setInterimTranscript("");
        console.warn("[native-speech] error:", data.error, "code:", data.code);
      });

      listenersRef.current = [partialHandle, finalHandle, errorHandle];

      await Speech.start({ language: navigator.language || "en-US" });
      setIsListening(true);
    } catch (err) {
      console.warn("[native-speech] start failed:", err);
      setIsListening(false);
      setInterimTranscript("");
    }
  }, [isSupported, isListening]);

  const stopListening = useCallback(async () => {
    if (!isListening) return;
    try {
      await Speech.stop();
    } catch {
      setIsListening(false);
      setInterimTranscript("");
    }
  }, [isListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return { isSupported, isListening, interimTranscript, toggleListening } as const;
}
