package com.enso.app;

import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Capacitor plugin for Android's native SpeechRecognizer.
 *
 * Provides real-time streaming speech-to-text with partial results,
 * replacing the server round-trip through Gemini for voice input.
 *
 * Methods: available(), start(options), stop()
 * Events: partialResults, finalResult, error
 */
@CapacitorPlugin(
    name = "Speech",
    permissions = {
        @Permission(strings = { android.Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class SpeechPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private boolean isListening = false;

    @PluginMethod()
    public void available(PluginCall call) {
        boolean available = SpeechRecognizer.isRecognitionAvailable(getContext());
        JSObject ret = new JSObject();
        ret.put("available", available);
        call.resolve(ret);
    }

    @PluginMethod()
    public void start(PluginCall call) {
        if (isListening) {
            call.resolve();
            return;
        }

        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognition not available on this device");
            return;
        }

        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "handleMicPermissionResult");
            return;
        }

        startRecognizer(call);
    }

    @PluginMethod()
    public void requestPermissions(PluginCall call) {
        requestPermissionForAlias("microphone", call, "handleMicPermissionResult");
    }

    @SuppressWarnings("unused")
    private void handleMicPermissionResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            startRecognizer(call);
        } else {
            call.reject("Microphone permission denied");
        }
    }

    private void startRecognizer(PluginCall call) {
        String language = call.getString("language", Locale.getDefault().toLanguageTag());

        getActivity().runOnUiThread(() -> {
            try {
                if (recognizer != null) {
                    recognizer.destroy();
                }
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(new SpeechListener());

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

                recognizer.startListening(intent);
                isListening = true;
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to start speech recognition: " + e.getMessage());
            }
        });
    }

    @PluginMethod()
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null && isListening) {
                recognizer.stopListening();
            }
            isListening = false;
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        isListening = false;
    }

    private class SpeechListener implements RecognitionListener {

        @Override
        public void onReadyForSpeech(Bundle params) {
            JSObject event = new JSObject();
            event.put("state", "ready");
            notifyListeners("listeningState", event);
        }

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {
            JSObject event = new JSObject();
            event.put("state", "ended");
            notifyListeners("listeningState", event);
        }

        @Override
        public void onError(int error) {
            isListening = false;
            String message;
            switch (error) {
                case SpeechRecognizer.ERROR_AUDIO:
                    message = "Audio recording error";
                    break;
                case SpeechRecognizer.ERROR_CLIENT:
                    message = "Client side error";
                    break;
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                    message = "Insufficient permissions";
                    break;
                case SpeechRecognizer.ERROR_NETWORK:
                    message = "Network error";
                    break;
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                    message = "Network timeout";
                    break;
                case SpeechRecognizer.ERROR_NO_MATCH:
                    JSObject noMatch = new JSObject();
                    noMatch.put("transcript", "");
                    notifyListeners("finalResult", noMatch);
                    return;
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                    message = "Recognition service busy";
                    break;
                case SpeechRecognizer.ERROR_SERVER:
                    message = "Server error";
                    break;
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    JSObject timeout = new JSObject();
                    timeout.put("transcript", "");
                    notifyListeners("finalResult", timeout);
                    return;
                default:
                    message = "Unknown error: " + error;
                    break;
            }
            JSObject event = new JSObject();
            event.put("error", message);
            event.put("code", error);
            notifyListeners("error", event);
        }

        @Override
        public void onResults(Bundle results) {
            isListening = false;
            ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            JSObject event = new JSObject();
            if (matches != null && !matches.isEmpty()) {
                event.put("transcript", matches.get(0));
            } else {
                event.put("transcript", "");
            }
            notifyListeners("finalResult", event);
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (matches != null && !matches.isEmpty()) {
                String partial = matches.get(0);
                if (partial != null && !partial.isEmpty()) {
                    JSObject event = new JSObject();
                    event.put("transcript", partial);
                    notifyListeners("partialResults", event);
                }
            }
        }

        @Override
        public void onEvent(int eventType, Bundle params) {}
    }
}
