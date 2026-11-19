package com.jirex.vpn;

import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

final class JirexApi {
    private final String origin;

    JirexApi(String address) throws Exception {
        URL url = new URL(address.trim());
        if (!"https".equals(url.getProtocol()) || url.getHost().isEmpty()
                || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null
                || !(url.getPath().isEmpty() || "/".equals(url.getPath()))) {
            throw new IOException("Enter the HTTPS address of your JIREX website.");
        }
        origin = "https://" + url.getAuthority();
    }

    String origin() {
        return origin;
    }

    JSONObject request(String method, String path, JSONObject body) throws Exception {
        HttpsURLConnection connection = open(method, "/api" + path);
        try {
            connection.setRequestProperty("Accept", "application/json");
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (var stream = connection.getOutputStream()) {
                    stream.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new RequestFailure(status);
            if ("/auth/login".equals(path)) {
                String cookie = connection.getHeaderField("Set-Cookie");
                if (cookie == null || !cookie.startsWith("session=")) {
                    throw new IOException("JIREX did not return a session.");
                }
                saveCookie(cookie);
            }
            if ("/auth/logout".equals(path) || "/auth/logout-all".equals(path)) clearSession();
            try (var stream = connection.getInputStream()) {
                var data = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                for (int count; (count = stream.read(buffer)) != -1;) {
                    if (data.size() + count > 1024 * 1024) throw new IOException("JIREX response is too large.");
                    data.write(buffer, 0, count);
                }
                return new JSONObject(new String(data.toByteArray(), StandardCharsets.UTF_8));
            }
        } finally {
            connection.disconnect();
        }
    }

    private HttpsURLConnection open(String method, String path) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(origin + path).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(20000);
        connection.setRequestMethod(method);
        String cookie = CookieManager.getInstance().getCookie(origin);
        if (cookie != null) connection.setRequestProperty("Cookie", cookie);
        return connection;
    }

    private void saveCookie(String cookie) {
        CookieManager.getInstance().setCookie(origin, cookie);
        CookieManager.getInstance().flush();
    }

    void clearSession() {
        saveCookie("session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax");
    }

    boolean hasSession() {
        String cookies = CookieManager.getInstance().getCookie(origin);
        if (cookies == null) return false;
        for (String cookie : cookies.split(";")) {
            if (cookie.trim().startsWith("session=")) return true;
        }
        return false;
    }

    void downloadConfig(String path, OutputStream destination) throws IOException {
        HttpsURLConnection connection = open("GET", path);
        try {
            int status = connection.getResponseCode();
            if (status != 200) throw new RequestFailure(status);
            if (connection.getContentType() == null || !connection.getContentType().startsWith("text/plain")) {
                throw new IOException("JIREX returned an unexpected download.");
            }
            try (var stream = connection.getInputStream()) {
                var bytes = new ByteArrayOutputStream();
                var buffer = new byte[1024];
                for (int count; (count = stream.read(buffer)) != -1;) {
                    if (bytes.size() + count > 16 * 1024) throw new IOException("JIREX configuration is too large.");
                    bytes.write(buffer, 0, count);
                }
                bytes.writeTo(destination);
            }
        } finally {
            connection.disconnect();
        }
    }

    static final class RequestFailure extends IOException {
        final int status;

        RequestFailure(int status) {
            super("JIREX request failed (" + status + ").");
            this.status = status;
        }
    }
}
