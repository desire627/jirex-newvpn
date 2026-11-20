package com.jirex.vpn;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

final class CustomerPortal {
    static final int PICK_RECEIPT = 11;
    static final int SAVE_CONFIG = 12;
    private static final String[] RECEIPT_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"};
    final WebView view;
    private final Activity activity;
    private final JirexApi api;
    private ValueCallback<Uri[]> receiptPicker;
    private String configPath;

    CustomerPortal(Activity activity, JirexApi api, Runnable accountCheck) {
        this.activity = activity;
        this.api = api;
        view = new WebView(activity);
        var settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " JirexAndroid/0.2");
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);
        view.setWebViewClient(new WebViewClient() {
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                if (isPortalUrl(Uri.parse(url))) accountCheck.run();
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (isPortalUrl(request.getUrl())) return false;
                if (request.isForMainFrame()) openExternal(request.getUrl());
                return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (view.getUrl() == null || !isPortalUrl(Uri.parse(view.getUrl()))
                        || params.getMode() != FileChooserParams.MODE_OPEN) {
                    callback.onReceiveValue(null);
                    return true;
                }
                if (receiptPicker != null) receiptPicker.onReceiveValue(null);
                receiptPicker = callback;
                var picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, RECEIPT_TYPES);
                if (!launch(picker, PICK_RECEIPT)) finishReceipt(null);
                return true;
            }
        });
        view.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            Uri uri = Uri.parse(url);
            String path = uri.getEncodedPath();
            if (!isPortalUrl(uri) || path == null || !path.matches("/api/devices/\\d+/config")
                    || !"1".equals(uri.getQueryParameter("download"))) return;
            String name = uri.getQueryParameter("name");
            if (name == null || !name.matches("[a-zA-Z0-9_=+.-]{1,15}\\.conf")) name = "jirex.conf";
            configPath = path + "?" + uri.getEncodedQuery();
            if (!launch(new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/octet-stream")
                    .putExtra(Intent.EXTRA_TITLE, name), SAVE_CONFIG)) {
                configPath = null;
            }
        });
    }

    private boolean isPortalUrl(Uri uri) {
        return api.origin().equals(uri.getScheme() + "://" + uri.getEncodedAuthority());
    }

    void open(String path) {
        String url = api.origin() + path;
        if (!url.equals(view.getUrl())) view.loadUrl(url);
    }

    void refreshAccount() {
        if (view.getUrl() != null && isPortalUrl(Uri.parse(view.getUrl()))) {
            view.evaluateJavascript("window.dispatchEvent(new Event('jirex:android-account-updated'))", null);
        }
    }

    void finishReceipt(Uri uri) {
        if (receiptPicker == null) return;
        var callback = receiptPicker;
        receiptPicker = null;
        callback.onReceiveValue(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
    }

    String takeConfigPath() {
        String path = configPath;
        configPath = null;
        return path;
    }

    void destroy() {
        finishReceipt(null);
        view.destroy();
    }

    private boolean launch(Intent intent, int requestCode) {
        try {
            activity.startActivityForResult(intent, requestCode);
            return true;
        } catch (ActivityNotFoundException error) {
            Toast.makeText(activity, "No app is available to open this file picker.", Toast.LENGTH_LONG).show();
            return false;
        }
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"mailto".equals(scheme) && !"tel".equals(scheme)) return;
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(activity, "No app is available to open this link.", Toast.LENGTH_LONG).show();
        }
    }
}
