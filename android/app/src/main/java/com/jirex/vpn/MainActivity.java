package com.jirex.vpn;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.VpnService;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.format.Formatter;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.Locale;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int MINT = 0xff5af5bf;
    private static final int MUTED = 0xff9baabd;
    private static final int VPN_PERMISSION = 10;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private VpnConnection vpn;
    private LinearLayout screen;
    private TextView badge, status, detail, downloaded, uploaded, location, account;
    private View power;
    private boolean busy;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        vpn = VpnConnection.get(this);
        getWindow().setStatusBarColor(0xff0d1420);
        getWindow().setNavigationBarColor(0xff0a0f17);
        buildHome();
    }

    @Override protected void onStart() {
        super.onStart();
        handler.post(refresh);
    }

    @Override protected void onStop() {
        handler.removeCallbacks(refresh);
        super.onStop();
    }

    private void buildHome() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xff0d1420, 0xff0a0f17}));
        screen = column();
        screen.setPadding(dp(24), dp(20), dp(24), dp(28));
        scroll.addView(screen);
        setContentView(scroll);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            scroll.setOnApplyWindowInsetsListener((view, insets) -> {
                var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            scroll.requestApplyInsets();
        }

        LinearLayout header = row();
        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.jirex_mark);
        header.addView(mark, new LinearLayout.LayoutParams(dp(30), dp(30)));
        TextView brand = label("JIREX", 20, Color.WHITE, true);
        brand.setPadding(dp(8), 0, 0, 0);
        header.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        badge = label("●  Offline", 12, MUTED, true);
        badge.setBackground(card(24));
        badge.setPadding(dp(12), dp(7), dp(12), dp(7));
        header.addView(badge);
        add(header, 0);

        power = new PowerButton();
        power.setContentDescription("Connect VPN");
        power.setOnClickListener(v -> toggleConnection());
        screen.addView(power, new LinearLayout.LayoutParams(-1, dp(250)));
        status = center("Disconnected", 26, Color.WHITE, true);
        detail = center("Tap to connect", 14, MUTED, false);
        add(status, 0);
        add(detail, 6);

        location = label("⌖   Choose location    ›", 16, Color.WHITE, true);
        location.setBackground(card(14));
        location.setPadding(dp(16), dp(16), dp(16), dp(16));
        location.setOnClickListener(v -> chooseLocation());
        add(location, 28);

        LinearLayout stats = row();
        downloaded = stat(stats, "↓  Downloaded", 0);
        uploaded = stat(stats, "↑  Uploaded", 10);
        add(stats, 10);
        account = center("Sign in", 14, MINT, true);
        account.setPadding(0, dp(12), 0, dp(12));
        account.setOnClickListener(v -> {
            if (busy) return;
            if (vpn.api == null) showSignIn(false);
            else new AlertDialog.Builder(this).setMessage("Sign out of JIREX VPN?")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Sign out", (dialog, which) -> work("Signing out…", () -> {
                        vpn.stop();
                        try {
                            vpn.api.request("POST", "/auth/logout", null);
                        } finally {
                            vpn.api = null;
                            vpn.servers = null;
                        }
                    })).show();
        });
        add(account, 14);
        updateLocation();
    }

    private TextView stat(LinearLayout row, String title, int margin) {
        LinearLayout tile = column();
        tile.setBackground(card(12));
        tile.setPadding(dp(14), dp(14), dp(14), dp(14));
        TextView value = label("—", 18, Color.WHITE, true);
        tile.addView(value);
        tile.addView(label(title, 13, MUTED, false));
        var params = new LinearLayout.LayoutParams(0, -2, 1);
        params.leftMargin = dp(margin);
        row.addView(tile, params);
        return value;
    }

    private void showSignIn(boolean connectAfter) {
        LinearLayout form = column();
        form.setPadding(dp(24), 0, dp(24), 0);
        EditText address = new EditText(this);
        address.setHint("https://your-jirex-site");
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(BuildConfig.JIREX_URL);
        if (BuildConfig.JIREX_URL.isEmpty()) form.addView(address);
        EditText key = new EditText(this);
        key.setHint("JIREX access key");
        key.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        form.addView(key);
        new AlertDialog.Builder(this).setTitle("Sign in to JIREX")
                .setView(form).setNegativeButton("Cancel", null)
                .setPositiveButton("Sign in", (dialog, which) -> {
                    String url = address.getText().toString();
                    String accessKey = key.getText().toString().trim();
                    key.getText().clear();
                    work("Signing in…", () -> {
                        JirexApi client = new JirexApi(url);
                        var user = client.request("POST", "/auth/login",
                                new JSONObject().put("key", accessKey)).getJSONObject("user");
                        vpn.servers = client.request("GET", "/servers", null).getJSONArray("servers");
                        vpn.accountId = user.getLong("id");
                        vpn.selected = 0;
                        vpn.api = client;
                    }, () -> { if (connectAfter) toggleConnection(); });
                }).show();
    }

    private void chooseLocation() {
        if (busy) return;
        if (vpn.api == null) {
            showSignIn(false);
            return;
        }
        if (vpn.state == org.amnezia.awg.backend.Tunnel.State.UP) {
            showError("Disconnect to change location.");
            return;
        }
        String[] names = new String[vpn.servers.length()];
        for (int i = 0; i < names.length; i++) names[i] = serverName(vpn.servers.optJSONObject(i));
        if (names.length == 0) {
            showError("No VPN locations are available.");
            return;
        }
        new AlertDialog.Builder(this).setTitle("VPN location")
                .setSingleChoiceItems(names, vpn.selected, (dialog, which) -> {
                    vpn.selected = which;
                    updateLocation();
                    dialog.dismiss();
                }).setNegativeButton("Cancel", null).show();
    }

    private String serverName(JSONObject server) {
        return server.optString("name") + " · " + server.optString("country");
    }

    private void updateLocation() {
        JSONObject server = vpn.servers == null ? null : vpn.servers.optJSONObject(vpn.selected);
        location.setText("⌖   " + (server == null ? "Choose location" : serverName(server)) + "    ›");
        account.setText(vpn.api == null ? "Sign in" : "Sign out");
    }

    private void toggleConnection() {
        if (busy) return;
        if (vpn.state == org.amnezia.awg.backend.Tunnel.State.UP) {
            work("Disconnecting…", vpn::stop);
        } else if (vpn.api == null) {
            showSignIn(true);
        } else if (vpn.servers.length() == 0) {
            showError("No VPN locations are available.");
        } else {
            Intent permission = VpnService.prepare(this);
            if (permission == null) connect();
            else startActivityForResult(permission, VPN_PERMISSION);
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == VPN_PERMISSION && result == RESULT_OK && vpn.api != null) connect();
    }

    private void connect() {
        work("Connecting…", () -> {
            if (!vpn.api.request("GET", "/auth/me", null).getJSONObject("user").getBoolean("active")) {
                throw new JirexApi.RequestFailure(402);
            }
            long server = vpn.servers.getJSONObject(vpn.selected).getLong("id");
            var preferences = getSharedPreferences("devices", MODE_PRIVATE);
            String slot = vpn.api.origin() + "/" + vpn.accountId + "/" + server;
            long device = preferences.getLong(slot, 0);
            JSONObject config = null;
            if (device != 0) {
                try {
                    config = vpn.api.request("GET", "/devices/" + device + "/config", null);
                } catch (JirexApi.RequestFailure error) {
                    if (error.status != 404) throw error;
                }
            }
            if (config == null) {
                config = vpn.api.request("POST", "/devices", new JSONObject()
                        .put("name", android.os.Build.MODEL).put("kind", "phone").put("serverId", server));
                preferences.edit().putLong(slot, config.getLong("id")).apply();
            }
            vpn.start(config.getString("config"));
        });
    }

    private interface Operation { void run() throws Exception; }

    private void work(String message, Operation operation) {
        work(message, operation, () -> {});
    }

    private void work(String message, Operation operation, Runnable success) {
        busy = true;
        detail.setText(message);
        vpn.worker.execute(() -> {
            String failure = null;
            try {
                operation.run();
            } catch (JirexApi.RequestFailure error) {
                failure = switch (error.status) {
                    case 401 -> vpn.api == null ? "Check your access key and try again." : "Your session expired. Sign in again.";
                    case 402 -> "You need an active plan. Renew on the JIREX website.";
                    case 409 -> "Your device limit may have been reached. Check your devices on the JIREX website.";
                    default -> error.getMessage();
                };
                if (error.status == 401) vpn.api = null;
            } catch (Exception error) {
                failure = "Could not complete the request. Check your JIREX address and connection.";
            }
            String result = failure;
            handler.post(() -> {
                if (isDestroyed()) return;
                busy = false;
                updateLocation();
                if (result == null) success.run();
                else showError(result);
            });
        });
    }

    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            if (!busy) vpn.worker.execute(() -> {
                try {
                    var snapshot = vpn.snapshot();
                    handler.post(() -> { if (!busy && !isDestroyed()) showSnapshot(snapshot); });
                } catch (Exception ignored) {
                    handler.post(() -> {
                        if (!busy && !isDestroyed()) {
                            showSnapshot(new VpnConnection.Snapshot(
                                    vpn.state == org.amnezia.awg.backend.Tunnel.State.UP, false, 0, 0, 0));
                        }
                    });
                }
            });
            handler.postDelayed(this, 1000);
        }
    };

    private void showSnapshot(VpnConnection.Snapshot snapshot) {
        badge.setText(snapshot.verified() ? "●  Secure" : snapshot.up() ? "●  Checking" : "●  Offline");
        badge.setTextColor(snapshot.verified() ? MINT : MUTED);
        status.setText(snapshot.verified() ? "You're protected" : snapshot.up() ? "Waiting for VPN traffic" : "Disconnected");
        long seconds = snapshot.seconds();
        detail.setText(snapshot.verified()
                ? String.format(Locale.getDefault(), "Connected for %02d:%02d", seconds / 60, seconds % 60)
                : snapshot.up() ? "Open a webpage to check the connection" : "Tap to connect");
        downloaded.setText(snapshot.up() ? Formatter.formatFileSize(this, snapshot.rx()) : "—");
        uploaded.setText(snapshot.up() ? Formatter.formatFileSize(this, snapshot.tx()) : "—");
        power.setContentDescription(snapshot.up() ? "Disconnect VPN" : "Connect VPN");
    }

    private void showError(String message) {
        new AlertDialog.Builder(this).setMessage(message).setPositiveButton("OK", null).show();
    }

    private LinearLayout column() {
        LinearLayout view = new LinearLayout(this);
        view.setOrientation(LinearLayout.VERTICAL);
        return view;
    }

    private LinearLayout row() {
        LinearLayout view = new LinearLayout(this);
        view.setGravity(Gravity.CENTER_VERTICAL);
        return view;
    }

    private TextView label(String text, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private TextView center(String text, int size, int color, boolean bold) {
        TextView view = label(text, size, color, bold);
        view.setGravity(Gravity.CENTER);
        return view;
    }

    private GradientDrawable card(int radius) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(0xff161e2a);
        background.setCornerRadius(dp(radius));
        background.setStroke(dp(1), 0xff242e3b);
        return background;
    }

    private void add(View view, int margin) {
        var layout = new LinearLayout.LayoutParams(-1, -2);
        layout.topMargin = dp(margin);
        screen.addView(view, layout);
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class PowerButton extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        PowerButton() {
            super(MainActivity.this);
            setFocusable(true);
        }

        @Override protected void onDraw(Canvas canvas) {
            float x = getWidth() / 2f;
            float y = getHeight() / 2f;
            paint.setStyle(Paint.Style.FILL);
            paint.setShader(new RadialGradient(x, y, dp(118), 0x6634e3a4, 0x0034e3a4, Shader.TileMode.CLAMP));
            canvas.drawCircle(x, y, dp(118), paint);
            paint.setShader(null);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(1));
            paint.setColor(0x4834e3a4);
            for (int radius = 72; radius <= 108; radius += 18) canvas.drawCircle(x, y, dp(radius), paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setShader(new RadialGradient(x - dp(20), y - dp(22), dp(100), MINT, 0xff17b77d, Shader.TileMode.CLAMP));
            canvas.drawCircle(x, y, dp(62), paint);
            paint.setShader(null);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(4));
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setColor(0xff07352a);
            int r = dp(17);
            canvas.drawArc(x - r, y - r, x + r, y + r, -48, 276, false, paint);
            canvas.drawLine(x, y - dp(21), x, y - dp(3), paint);
        }
    }
}
