import { useState, useRef, useCallback, useEffect } from "react";
import { getBackendBaseUrl, authHeaders } from "./connection";

const isSupported =
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;

/**
 * Try getUserMedia, retrying once after a delay if the first call fails.
 * On Android WebView, the first call triggers the OS permission dialog and
 * rejects immediately. The retry succeeds after the user grants permission.
 */
async function getAudioStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    // Permission dialog may have just been shown — wait and retry
    await new Promise((r) => setTimeout(r, 500));
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

/** Convert a Blob to a base64 data string. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:audio/webm;base64,")
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
      const stream = await getAudioStream();
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
          setIsListening(false);
          return;
        }

        setIsListening(false);
        setIsTranscribing(true);
        try {
          // Send as base64 JSON — Capacitor's CapacitorHttp plugin can't serialize Blob bodies,
          // so we encode the audio data as base64 and send it as JSON.
          const base64 = await blobToBase64(blob);
          const contentType = mimeType.split(";")[0];
          const res = await fetch(`${getBackendBaseUrl()}/transcribe`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ audio: base64, mimeType: contentType }),
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
