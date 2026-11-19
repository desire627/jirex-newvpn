package com.jirex.vpn;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

final class JirexApi {
    private final String origin;
    private String session;

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
        HttpsURLConnection connection = (HttpsURLConnection) new URL(origin + "/api" + path).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(20000);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            if (session != null) connection.setRequestProperty("Cookie", session);
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
                session = cookie.split(";", 2)[0];
            }
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

    static final class RequestFailure extends IOException {
        final int status;

        RequestFailure(int status) {
            super("JIREX request failed (" + status + ").");
            this.status = status;
        }
    }
}
