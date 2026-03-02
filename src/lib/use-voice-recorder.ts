import { useState, useRef, useCallback, useEffect } from "react";
import { getBackendBaseUrl, authHeaders } from "./connection";

const isSupported =
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;

/**
 * Voice input via MediaRecorder + server-side transcription.
 * Used on native platforms (Android WebView) where Web Speech API doesn't work.
 */
export function useVoiceRecorder(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (isListening || isTranscribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick a supported mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType.split(";")[0] });
        chunksRef.current = [];

        if (blob.size < 100) {
          // Too short / empty recording
          setIsListening(false);
          return;
        }

        setIsListening(false);
        setIsTranscribing(true);
        try {
          const res = await fetch(`${getBackendBaseUrl()}/transcribe`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": mimeType.split(";")[0] }),
            body: blob,
          });
          if (res.ok) {
            const data = await res.json();
            if (data.transcript) {
              onTranscriptRef.current(data.transcript);
            }
          }
        } catch (err) {
          console.warn("[voice-recorder] transcription failed:", err);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch (err) {
      console.warn("[voice-recorder] getUserMedia failed:", err);
    }
  }, [isListening, isTranscribing]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) stopRecording();
    else startRecording();
  }, [isListening, stopRecording, startRecording]);

  return { isSupported, isListening, isTranscribing, toggleListening } as const;
}
