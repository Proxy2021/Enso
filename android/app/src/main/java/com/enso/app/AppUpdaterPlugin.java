package com.enso.app;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Capacitor plugin for self-updating the Android app.
 *
 * Provides two methods:
 * - getVersionInfo(): returns the installed app's versionCode and versionName
 * - installApk(url, token): downloads an APK from the given URL and triggers the system installer
 *
 * The download runs on a background thread and emits "downloadProgress" events to JavaScript.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    @PluginMethod()
    public void getVersionInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("versionCode", BuildConfig.VERSION_CODE);
        ret.put("versionName", BuildConfig.VERSION_NAME);
        call.resolve(ret);
    }

    @PluginMethod()
    public void installApk(PluginCall call) {
        String apkUrl = call.getString("url");
        String token = call.getString("token", "");

        if (apkUrl == null || apkUrl.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        new Thread(() -> {
            try {
                // Download APK from server
                URL url = new URL(apkUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                if (token != null && !token.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + token);
                }
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                conn.connect();

                int responseCode = conn.getResponseCode();
                if (responseCode != 200) {
                    call.reject("Download failed: HTTP " + responseCode);
                    return;
                }

                int totalSize = conn.getContentLength();

                // Save to cache directory (covered by FileProvider's file_paths.xml)
                File apkFile = new File(getContext().getCacheDir(), "enso-update.apk");
                InputStream input = conn.getInputStream();
                FileOutputStream output = new FileOutputStream(apkFile);
                byte[] buffer = new byte[8192];
                int bytesRead;
                long downloaded = 0;

                while ((bytesRead = input.read(buffer)) != -1) {
                    output.write(buffer, 0, bytesRead);
                    downloaded += bytesRead;

                    // Emit progress event to JavaScript
                    JSObject progress = new JSObject();
                    progress.put("downloaded", downloaded);
                    progress.put("total", totalSize);
                    notifyListeners("downloadProgress", progress);
                }

                output.close();
                input.close();
                conn.disconnect();

                // Trigger system package installer via FileProvider
                Uri apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apkFile
                );

                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(installIntent);

                call.resolve();
            } catch (Exception e) {
                call.reject("Install failed: " + e.getMessage());
            }
        }).start();
    }
}
