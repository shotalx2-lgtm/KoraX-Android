package com.korax.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String NOTIFICATION_CHANNEL = "korax_match_events";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 701;
    private WebView webView;
    private ExecutorService rssExecutor;
    private WebViewAssetLoader assetLoader;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF050505);
        getWindow().setNavigationBarColor(0xFF050505);
        rssExecutor = Executors.newSingleThreadExecutor();
        createNotificationChannel();
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF050505);
        // Android 15+ enforces edge-to-edge for modern target SDKs. Keep the
        // existing web UI inside the safe system-bar/cutout area without
        // changing its own layout or styling.
        if (Build.VERSION.SDK_INT >= 35) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(
                        android.view.WindowInsets.Type.systemBars()
                                | android.view.WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
        }
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.getSettings().setSupportMultipleWindows(false);
        if (Build.VERSION.SDK_INT >= 26) webView.getSettings().setSafeBrowsingEnabled(true);
        webView.addJavascriptInterface(new NativeBridge(), "KXNative");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_HOST.equals(uri.getHost())) return false;
                if ("https".equalsIgnoreCase(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) { }
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("window.KX_ANDROID=true;", null);
            }
        });
        setContentView(webView);
        webView.loadUrl("https://" + APP_HOST + "/assets/public/index.html");
    }

    private final class NativeBridge {
        @JavascriptInterface
        public void fetchRss(String feedKind, String requestId) {
            if (feedKind == null || requestId == null || !requestId.matches("rss_[A-Za-z0-9_]+")) return;
            final String query;
            if ("transfers".equals(feedKind)) {
                query = "(انتقالات كرة القدم OR سوق الانتقالات OR صفقة انتقال OR تجديد عقد لاعب OR إعارة لاعب) when:7d";
            } else if ("main".equals(feedKind)) {
                query = "(أخبار كرة القدم العالمية OR كرة القدم OR الدوري الإنجليزي OR دوري أبطال أوروبا OR الدوري الإسباني OR الدوري الإيطالي OR الدوري الألماني OR الدوري الفرنسي OR الدوري المصري OR دوري روشن OR كأس العالم OR كأس أمم أفريقيا OR كوبا ليبرتادوريس) when:7d";
            } else {
                return;
            }
            rssExecutor.execute(() -> {
                String xml = downloadArabicRss(query);
                final String safeId = JSONObject.quote(requestId);
                final String safeXml = JSONObject.quote(xml == null ? "" : xml);
                runOnUiThread(() -> {
                    if (webView != null) {
                        webView.evaluateJavascript("window.__kxRssResult(" + safeId + "," + safeXml + ");", null);
                    }
                });
            });
        }

        @JavascriptInterface
        public void requestNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
                }
            });
        }

        @JavascriptInterface
        public void showNotification(String title, String body) {
            if (title == null || body == null) return;
            final String safeTitle = title.length() > 80 ? title.substring(0, 80) : title;
            final String safeBody = body.length() > 240 ? body.substring(0, 240) : body;
            runOnUiThread(() -> postNotification(safeTitle, safeBody));
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(NOTIFICATION_CHANNEL, "أحداث المباريات", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("إشعارات الأهداف وأحداث المباريات المفضلة");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void postNotification(String title, String body) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, NOTIFICATION_CHANNEL)
                : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true);
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }

    private String downloadArabicRss(String query) {
        HttpURLConnection connection = null;
        try {
            String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8.name());
            URL url = new URL("https://news.google.com/rss/search?q=" + encoded + "&hl=ar&gl=EG&ceid=EG:ar");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(9000);
            connection.setReadTimeout(12000);
            connection.setRequestProperty("Accept", "application/rss+xml, application/xml, text/xml");
            connection.setRequestProperty("User-Agent", "KoraX-Android/1.0 (RSS reader)");
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) return null;
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    if (out.size() + read > 1_000_000) break;
                    out.write(buffer, 0, read);
                }
                return out.toString(StandardCharsets.UTF_8.name());
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("(function(){var b=document.querySelector('#ov.on .oh [data-x]');if(b){b.click();return 'overlay';}return 'home';})()", value -> {
                if ("\"home\"".equals(value)) finish();
            });
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (rssExecutor != null) rssExecutor.shutdownNow();
        if (webView != null) {
            webView.removeJavascriptInterface("KXNative");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
