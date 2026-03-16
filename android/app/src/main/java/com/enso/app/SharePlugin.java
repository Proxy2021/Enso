package com.enso.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Capacitor plugin for Android's standard share sheet.
 *
 * Supports both text sharing (Intent.ACTION_SEND with text/plain)
 * and image sharing (base64 PNG → temp file → FileProvider URI).
 */
@CapacitorPlugin(name = "Share")
public class SharePlugin extends Plugin {

    @PluginMethod()
    public void share(PluginCall call) {
        String title = call.getString("title", "");
        String text = call.getString("text", "");
        String url = call.getString("url", "");

        // Build the share body: description + URL on separate lines
        StringBuilder body = new StringBuilder();
        if (text != null && !text.isEmpty()) {
            body.append(text);
        }
        if (url != null && !url.isEmpty()) {
            if (body.length() > 0) body.append("\n\n");
            body.append(url);
        }

        if (body.length() == 0) {
            call.reject("Nothing to share — provide text or url");
            return;
        }

        Intent sendIntent = new Intent(Intent.ACTION_SEND);
        sendIntent.setType("text/plain");
        sendIntent.putExtra(Intent.EXTRA_TEXT, body.toString());
        if (title != null && !title.isEmpty()) {
            sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);
        }

        Intent chooser = Intent.createChooser(sendIntent, null);
        getActivity().startActivity(chooser);

        call.resolve();
    }

    /**
     * Share an image via the Android share sheet.
     * Accepts a base64-encoded PNG (data URL or raw base64) and an optional title.
     */
    @PluginMethod()
    public void shareImage(PluginCall call) {
        String dataUrl = call.getString("dataUrl", "");
        String title = call.getString("title", "");
        String filename = call.getString("filename", "enso-share.png");

        if (dataUrl == null || dataUrl.isEmpty()) {
            call.reject("No image data provided");
            return;
        }

        // Strip data URL prefix if present
        String base64Data = dataUrl;
        if (base64Data.contains(",")) {
            base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
        }

        try {
            byte[] imageBytes = Base64.decode(base64Data, Base64.DEFAULT);

            // Write to cache dir (no permissions needed)
            File cacheDir = new File(getContext().getCacheDir(), "shared_images");
            if (!cacheDir.exists()) cacheDir.mkdirs();
            File imageFile = new File(cacheDir, filename);
            FileOutputStream fos = new FileOutputStream(imageFile);
            fos.write(imageBytes);
            fos.close();

            // Get content URI via FileProvider
            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                imageFile
            );

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("image/png");
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            if (title != null && !title.isEmpty()) {
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            }
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, null);
            getActivity().startActivity(chooser);

            call.resolve();
        } catch (IOException e) {
            call.reject("Failed to save image: " + e.getMessage());
        } catch (IllegalArgumentException e) {
            call.reject("Invalid base64 data: " + e.getMessage());
        }
    }
}
