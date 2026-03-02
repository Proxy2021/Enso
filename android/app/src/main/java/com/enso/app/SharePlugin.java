package com.enso.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin for Android's standard share sheet.
 *
 * Invokes Intent.ACTION_SEND so the user can choose any app
 * (WhatsApp, Telegram, email, etc.) to share a link + description.
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
}
