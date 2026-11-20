package com.jirex.vpn;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
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
import android.os.SystemClock;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.webkit.WebView;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.amnezia.awg.backend.Tunnel.State;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int MINT = 0xff5af5bf;
    private static final int MUTED = 0xff9baabd;
    private static final int VPN_PERMISSION = 10;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private VpnConnection vpn;
    private LinearLayout screen;
    private TextView badge, status, detail, connectedDevices, remainingDays, location;
    private TextView startupStatus;
    private ProgressBar startupProgress;
    private Integer onlineDevices;
    private Instant accessUntil;
    private boolean expiryLoaded;
    private LinearLayout bottomBar;
    private String selectedTab = "/";
    private boolean loginFlow;
    private String renderedNavigation;
    private View power;
    private boolean busy;
    private boolean visible;
    private boolean polling;
    private boolean accountCheckRequested;
    private boolean permissionPending;
    private String approval;
    private String automaticAttempt;
    private long automaticAttemptAt;
    private JirexApi portalApi;
    private CustomerPortal portal;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        vpn = VpnConnection.get(this);
        getWindow().setStatusBarColor(0xff0d1420);
        getWindow().setNavigationBarColor(0xff0a0f17);
        String address = settings().getString("origin", BuildConfig.JIREX_URL);
        if (!address.isEmpty()) {
            try {
                portalApi = new JirexApi(address);
            } catch (Exception ignored) {}
        }
        if (portalApi == null) showServiceSetup();
        else showStartup();
    }

    @Override protected void onStart() {
        super.onStart();
        visible = true;
        handler.post(checkAccount);
        handler.post(refresh);
    }

    @Override protected void onStop() {
        visible = false;
        handler.removeCallbacks(refresh);
        handler.removeCallbacks(checkAccount);
        super.onStop();
    }

    @Override protected void onDestroy() {
        if (portal != null) portal.destroy();
        super.onDestroy();
    }

    private void showStartup() {
        LinearLayout page = column();
        page.setGravity(Gravity.CENTER);
        page.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xff101e29, 0xff0a0f17}));
        LinearLayout content = column();
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(dp(24), dp(24), dp(24), dp(24));
        page.addView(content, new LinearLayout.LayoutParams(-1, -2));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.jirex_mark);
        logo.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        logo.setPadding(dp(23), dp(23), dp(23), dp(23));
        GradientDrawable logoBackground = card(30);
        logoBackground.setColor(0xff142a30);
        logoBackground.setStroke(dp(1), 0xff26504c);
        logo.setBackground(logoBackground);
        content.addView(logo, new LinearLayout.LayoutParams(dp(108), dp(108)));

        TextView welcome = center("Welcome to JIREX", 28, Color.WHITE, true);
        if (Build.VERSION.SDK_INT >= 28) welcome.setAccessibilityHeading(true);
        LinearLayout.LayoutParams titleLayout = new LinearLayout.LayoutParams(-2, -2);
        titleLayout.topMargin = dp(24);
        content.addView(welcome, titleLayout);

        startupStatus = center("Getting things ready…", 14, MUTED, false);
        startupStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        LinearLayout.LayoutParams statusLayout = new LinearLayout.LayoutParams(-2, -2);
        statusLayout.topMargin = dp(8);
        content.addView(startupStatus, statusLayout);
        startupProgress = new ProgressBar(this);
        startupProgress.setIndeterminateTintList(ColorStateList.valueOf(MINT));
        startupProgress.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        LinearLayout.LayoutParams progressLayout = new LinearLayout.LayoutParams(dp(26), dp(26));
        progressLayout.topMargin = dp(24);
        content.addView(startupProgress, progressLayout);
        setContentView(page);
        applyInsets(page);
    }

    private void showServiceSetup() {
        LinearLayout page = column();
        page.setGravity(Gravity.CENTER);
        page.setBackgroundColor(0xff0d1420);
        page.addView(center("Enter your JIREX website address", 16, Color.WHITE, true));
        EditText address = new EditText(this);
        address.setHint("https://your-jirex-site");
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        page.addView(address, new LinearLayout.LayoutParams(dp(280), -2));
        Button continueButton = new Button(this);
        continueButton.setText("Continue");
        page.addView(continueButton);
        continueButton.setOnClickListener(v -> {
            try {
                portalApi = new JirexApi(address.getText().toString());
                settings().edit().putString("origin", portalApi.origin()).apply();
                showStartup();
                scheduleAccountCheck();
            } catch (Exception error) {
                address.setError(error.getMessage());
            }
        });
        setContentView(page);
        applyInsets(page);
    }

    private void buildHome() {
        startupStatus = null;
        startupProgress = null;
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xff0d1420, 0xff0a0f17}));
        screen = column();
        screen.setPadding(dp(24), dp(20), dp(24), dp(28));
        scroll.addView(screen);
        showPage(scroll);

        LinearLayout header = row();
        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.jirex_mark);
        header.addView(mark, new LinearLayout.LayoutParams(dp(30), dp(30)));
        TextView brand = label("JIREX", 17, Color.WHITE, true);
        brand.setPadding(dp(8), 0, 0, 0);
        header.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        badge = label("●  Offline", 11, MUTED, true);
        badge.setBackground(card(24));
        badge.setPadding(dp(12), dp(7), dp(12), dp(7));
        header.addView(badge);
        add(header, 0);

        power = new PowerButton();
        power.setContentDescription("Connect VPN");
        power.setOnClickListener(v -> toggleConnection());
        screen.addView(power, new LinearLayout.LayoutParams(-1, dp(250)));
        status = center("Disconnected", 21, Color.WHITE, true);
        detail = center("Tap to connect", 13, MUTED, false);
        add(status, 0);
        add(detail, 6);

        location = label("⌖   Choose location    ›", 14, Color.WHITE, true);
        location.setBackground(card(14));
        location.setPadding(dp(16), dp(16), dp(16), dp(16));
        location.setOnClickListener(v -> chooseLocation());
        add(location, 28);

        LinearLayout stats = row();
        connectedDevices = stat(stats, "Connected devices", 0);
        remainingDays = stat(stats, "Days until expiry", 10);
        add(stats, 10);
        updateLocation();
        updateSummary();
    }

    private void showPage(View content) {
        LinearLayout frame = column();
        frame.setBackgroundColor(0xff0a0f17);
        frame.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        View divider = new View(this);
        divider.setBackgroundColor(0xff242e3b);
        frame.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));
        bottomBar = row();
        bottomBar.setBackgroundColor(0xff101824);
        bottomBar.setPadding(dp(5), dp(4), dp(5), dp(5));
        frame.addView(bottomBar, new LinearLayout.LayoutParams(-1, -2));
        renderedNavigation = null;
        updateNavigation();
        setContentView(frame);
        applyInsets(frame);
    }

    private void applyInsets(View root) {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            root.requestApplyInsets();
        }
    }

    private SharedPreferences settings() {
        return getSharedPreferences("devices", MODE_PRIVATE);
    }

    private void updateNavigation() {
        if (bottomBar == null) return;
        bottomBar.setVisibility(loginFlow || "/login".equals(selectedTab) || "/signup".equals(selectedTab)
                ? View.GONE : View.VISIBLE);
        boolean signedIn = vpn.api != null;
        String state = selectedTab + ":" + signedIn;
        if (state.equals(renderedNavigation)) return;
        renderedNavigation = state;
        bottomBar.removeAllViews();
        addNavigation("VPN", R.drawable.nav_vpn, "/", this::closePortal);
        addNavigation("Devices", R.drawable.nav_devices, "/dashboard", () -> openPortal("/dashboard"));
        addNavigation("Payments", R.drawable.nav_payments, "/billing", () -> openPortal("/billing"));
        addNavigation("Account", R.drawable.nav_account, "/account", () -> openPortal("/account"));
        addNavigation(signedIn ? "Sign out" : "Sign in",
                signedIn ? R.drawable.nav_signout : R.drawable.nav_signin, null, this::accountAction);
    }

    private void addNavigation(String title, int icon, String path, Runnable action) {
        boolean selected = selectedTab.equals(path);
        int color = selected ? MINT : MUTED;
        LinearLayout button = column();
        button.setGravity(Gravity.CENTER);
        button.setPadding(0, dp(5), 0, dp(5));
        button.setMinimumHeight(dp(56));
        button.setFocusable(true);
        button.setSelected(selected);
        button.setContentDescription(title);
        ImageView image = new ImageView(this);
        image.setImageResource(icon);
        image.setColorFilter(color);
        image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        button.addView(image, new LinearLayout.LayoutParams(dp(22), dp(22)));
        TextView caption = center(title, 11, color, selected);
        caption.setPadding(0, dp(4), 0, 0);
        caption.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        button.addView(caption);
        button.setOnClickListener(v -> {
            if (!busy && !permissionPending) action.run();
        });
        bottomBar.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
    }

    private void accountAction() {
        JirexApi client = vpn.api;
        if (client == null) {
            showLogin();
            return;
        }
        new AlertDialog.Builder(this).setTitle(R.string.sign_out_title)
                .setMessage(R.string.sign_out_key_reminder)
                .setNegativeButton("Cancel", null)
                .setNeutralButton(R.string.view_access_key, (dialog, which) -> openPortal("/account"))
                .setPositiveButton("Sign out", (dialog, which) -> work("Signing out…", () -> {
                    vpn.stop();
                    client.request("POST", "/auth/logout", null);
                }, () -> {
                    showLogin();
                })).show();
    }

    private void openPortal(String path) {
        if (portalApi == null) {
            showServiceSetup();
            return;
        }
        if (portal == null) {
            selectedTab = "";
            portal = new CustomerPortal(this, portalApi, this::onPortalRouteChanged);
            showPage(portal.view);
        } else updateNavigation();
        portal.open(path);
    }

    private void onPortalRouteChanged(WebView view, String path) {
        if (portal == null || portal.view != view) return;
        selectedTab = switch (path == null ? "" : path.replaceFirst("/$", "")) {
            case "/dashboard" -> "/dashboard";
            case "/billing" -> "/billing";
            case "/account" -> "/account";
            case "/login" -> "/login";
            case "/signup" -> "/signup";
            default -> "";
        };
        updateNavigation();
        scheduleAccountCheck();
    }

    private void showLogin() {
        vpn.api = null;
        vpn.servers = null;
        approval = null;
        onlineDevices = null;
        accessUntil = null;
        expiryLoaded = false;
        startupStatus = null;
        startupProgress = null;
        if (!loginFlow) {
            loginFlow = true;
            if ("/signup".equals(selectedTab)) updateNavigation();
            else openPortal("/login");
        }
    }

    private void closePortal() {
        if (portal == null) return;
        CustomerPortal oldPortal = portal;
        portal = null;
        loginFlow = false;
        selectedTab = "/";
        buildHome();
        oldPortal.destroy();
        scheduleAccountCheck();
    }

    @Override public void onBackPressed() {
        if (portal != null && portal.view.canGoBack()) {
            portal.view.goBack();
        } else if (portal != null && !loginFlow) {
            closePortal();
        } else {
            super.onBackPressed();
        }
    }

    private TextView stat(LinearLayout row, String title, int margin) {
        LinearLayout tile = column();
        tile.setBackground(card(12));
        tile.setPadding(dp(14), dp(14), dp(14), dp(14));
        TextView value = label("—", 15, Color.WHITE, true);
        tile.addView(value);
        tile.addView(label(title, 12, MUTED, false));
        var params = new LinearLayout.LayoutParams(0, -2, 1);
        params.leftMargin = dp(margin);
        row.addView(tile, params);
        return value;
    }

    private void chooseLocation() {
        if (busy) return;
        if (vpn.api == null) {
            showLogin();
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
                    long server = vpn.servers.optJSONObject(which).optLong("id");
                    settings().edit().putLong(accountSlot(vpn.api, vpn.accountId) + "/location", server).apply();
                    updateLocation();
                    dialog.dismiss();
                }).setNegativeButton("Cancel", null).show();
    }

    private String serverName(JSONObject server) {
        return server.optString("name") + " · " + server.optString("country");
    }

    private void updateLocation() {
        if (location != null) {
            JSONObject server = vpn.servers == null ? null : vpn.servers.optJSONObject(vpn.selected);
            location.setText("⌖   " + (server == null ? "Choose location" : serverName(server)) + "    ›");
        }
        updateNavigation();
    }

    private void updateSummary() {
        if (connectedDevices == null) return;
        connectedDevices.setText(onlineDevices == null ? "—" : String.valueOf(onlineDevices));
        long remainingMillis = accessUntil == null ? 0 : accessUntil.toEpochMilli() - System.currentTimeMillis();
        long days = Math.max(0, (long) Math.ceil(remainingMillis / 86_400_000.0));
        remainingDays.setText(expiryLoaded ? String.valueOf(days) : "—");
    }

    private void toggleConnection() {
        if (busy || permissionPending) return;
        if (vpn.state == State.UP) {
            work("Disconnecting…", vpn::stop);
        } else if (vpn.api == null) {
            showLogin();
        } else if (vpn.servers.length() == 0) {
            showError("No VPN locations are available.");
        } else {
            requestConnection();
        }
    }

    private void requestConnection() {
        Intent permission = VpnService.prepare(this);
        if (permission == null) {
            connect();
        } else {
            permissionPending = true;
            startActivityForResult(permission, VPN_PERMISSION);
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == VPN_PERMISSION) {
            permissionPending = false;
            if (result == RESULT_OK && vpn.api != null) connect();
        } else if (portal != null && request == CustomerPortal.PICK_RECEIPT) {
            portal.finishReceipt(result == RESULT_OK && data != null ? data.getData() : null);
        } else if (portal != null && request == CustomerPortal.SAVE_CONFIG) {
            String path = portal.takeConfigPath();
            if (result != RESULT_OK || data == null || data.getData() == null || path == null) return;
            var uri = data.getData();
            JirexApi client = portalApi;
            work("Saving configuration…", () -> {
                try (var output = getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new java.io.IOException("Could not open the selected file.");
                    client.downloadConfig(path, output);
                }
            }, () -> Toast.makeText(this, "Configuration saved.", Toast.LENGTH_SHORT).show());
        }
    }

    private void connect() {
        final JirexApi client = vpn.api;
        final long accountId = vpn.accountId;
        final long server = vpn.servers.optJSONObject(vpn.selected).optLong("id");
        final String currentApproval = approval;
        work("Connecting…", () -> {
            vpn.start(registerPhone(client, accountId, server).getString("config"));
        }, () -> {
            if (currentApproval != null) recordApproval(client, accountId, currentApproval);
            if (portal != null) portal.refreshAccount();
        });
    }

    private JSONObject registerPhone(JirexApi client, long accountId, long server) throws Exception {
        JSONObject user = client.request("GET", "/auth/me", null).getJSONObject("user");
        if (user.getLong("id") != accountId) throw new JirexApi.RequestFailure(401);
        if (!user.getBoolean("active")) throw new JirexApi.RequestFailure(402);
        SharedPreferences preferences = settings();
        String slot = accountSlot(client, accountId) + "/" + server;
        long device = preferences.getLong(slot, 0);
        if (device != 0) {
            try {
                return client.request("GET", "/devices/" + device + "/config", null);
            } catch (JirexApi.RequestFailure error) {
                if (error.status != 404) throw error;
            }
        }
        String installation = preferences.getString("installationId", null);
        if (installation == null) {
            installation = UUID.randomUUID().toString();
            preferences.edit().putString("installationId", installation).apply();
        }
        JSONObject config = client.request("POST", "/devices", new JSONObject().put("installationId", installation)
                .put("name", Build.MODEL).put("kind", "phone").put("serverId", server));
        preferences.edit().putLong(slot, config.getLong("id")).apply();
        return config;
    }

    private String accountSlot(JirexApi client, long accountId) {
        return client.origin() + "/" + accountId;
    }

    private int savedSelection(JirexApi client, long accountId, JSONArray servers) {
        long saved = settings().getLong(accountSlot(client, accountId) + "/location", 0);
        for (int i = 0; i < servers.length(); i++) {
            if (servers.optJSONObject(i).optLong("id") == saved) return i;
        }
        return 0;
    }

    private void recordApproval(JirexApi client, long accountId, String approval) {
        settings().edit().putString(accountSlot(client, accountId) + "/approval", approval).apply();
    }

    private void scheduleAccountCheck() {
        if (polling) {
            accountCheckRequested = true;
            return;
        }
        handler.removeCallbacks(checkAccount);
        if (visible) handler.post(checkAccount);
    }

    private final Runnable checkAccount = new Runnable() {
        @Override public void run() {
            if (!visible) return;
            handler.postDelayed(this, 15_000);
            if (busy || polling || permissionPending || portalApi == null) return;
            JirexApi client = portalApi;
            long previousAccount = vpn.accountId;
            boolean signedIn = vpn.api != null;
            boolean needsLocations = vpn.servers == null;
            String previousApproval = approval;
            polling = true;
            vpn.worker.execute(() -> {
                try {
                    if (!client.hasSession()) {
                        clearAccountFromPortal(client);
                        return;
                    }
                    JSONObject state = client.request("GET", "/billing/activation", null);
                    long accountId = state.getLong("userId");
                    String latest = state.isNull("approval") ? null : state.getString("approval");
                    boolean active = state.getBoolean("active");
                    boolean accountChanged = !signedIn || previousAccount != accountId;
                    boolean approvalChanged = !java.util.Objects.equals(previousApproval, latest);
                    JSONArray locations = needsLocations || accountChanged || approvalChanged
                            ? client.request("GET", "/servers", null).getJSONArray("servers") : null;
                    if (vpn.state == State.UP && (accountChanged || !active)) vpn.stop();
                    handler.post(() -> {
                        if (isDestroyed() || portalApi != client) return;
                        long selected = !accountChanged && vpn.servers != null
                                && vpn.servers.optJSONObject(vpn.selected) != null
                                ? vpn.servers.optJSONObject(vpn.selected).optLong("id") : 0;
                        vpn.api = client;
                        vpn.accountId = accountId;
                        if (locations != null) {
                            vpn.servers = locations;
                            vpn.selected = savedSelection(client, accountId, locations);
                            for (int i = 0; selected != 0 && i < locations.length(); i++) {
                                if (locations.optJSONObject(i).optLong("id") == selected) {
                                    vpn.selected = i;
                                    break;
                                }
                            }
                        }
                        approval = latest;
                        if (accountChanged) {
                            onlineDevices = null;
                            expiryLoaded = false;
                        }
                        if (loginFlow) closePortal();
                        else if (startupStatus != null) buildHome();
                        else updateLocation();
                        if (approvalChanged && portal != null) portal.refreshAccount();
                        if (visible && active && latest != null) registerApprovedPhone(client, accountId, latest);
                    });
                    refreshSummary(client, accountId);
                } catch (JirexApi.RequestFailure error) {
                    if (error.status == 401 || error.status == 403) {
                        clearAccountFromPortal(client);
                    } else showStartupRetry();
                } catch (Exception ignored) {
                    showStartupRetry();
                } finally {
                    handler.post(() -> {
                        polling = false;
                        if (accountCheckRequested) {
                            accountCheckRequested = false;
                            scheduleAccountCheck();
                        }
                    });
                }
            });
        }
    };

    private void refreshSummary(JirexApi client, long accountId) throws Exception {
        JSONObject user = client.request("GET", "/auth/me", null).getJSONObject("user");
        if (user.getLong("id") != accountId) return;
        Instant expiry = user.isNull("accessUntil") ? null : Instant.parse(user.getString("accessUntil"));
        handler.post(() -> {
            if (isDestroyed() || vpn.api != client || vpn.accountId != accountId) return;
            accessUntil = expiry;
            expiryLoaded = true;
            updateSummary();
        });
        JSONArray devices = client.request("GET", "/devices", null).getJSONArray("devices");
        long cutoff = Instant.now().getEpochSecond() - 180;
        int connected = 0;
        for (int i = 0; i < devices.length(); i++) {
            if (devices.getJSONObject(i).optLong("lastSeen") > cutoff) connected++;
        }
        int count = connected;
        handler.post(() -> {
            if (isDestroyed() || vpn.api != client || vpn.accountId != accountId) return;
            onlineDevices = count;
            updateSummary();
        });
    }

    private void showStartupRetry() {
        handler.post(() -> {
            if (!isDestroyed() && startupStatus != null) {
                startupStatus.setText("Could not check your session. Tap to retry.");
                startupProgress.setVisibility(View.INVISIBLE);
                startupStatus.setOnClickListener(v -> {
                    startupStatus.setOnClickListener(null);
                    startupStatus.setClickable(false);
                    startupStatus.setText("Getting things ready…");
                    startupProgress.setVisibility(View.VISIBLE);
                    scheduleAccountCheck();
                });
            }
        });
    }

    private void clearAccountFromPortal(JirexApi client) {
        try {
            if (vpn.state == State.UP) vpn.stop();
        } catch (Exception ignored) {}
        handler.post(() -> {
            if (!isDestroyed() && portalApi == client) showLogin();
        });
    }

    private void registerApprovedPhone(JirexApi client, long accountId, String latest) {
        String acknowledged = settings().getString(accountSlot(client, accountId) + "/approval", null);
        if (latest.equals(acknowledged)) return;
        if (vpn.servers == null || vpn.servers.length() == 0) return;
        String attemptKey = accountSlot(client, accountId) + "/" + latest;
        long now = SystemClock.elapsedRealtime();
        if (attemptKey.equals(automaticAttempt) && now - automaticAttemptAt < 60_000) return;
        automaticAttempt = attemptKey;
        automaticAttemptAt = now;
        long server = vpn.servers.optJSONObject(vpn.selected).optLong("id");
        vpn.worker.execute(() -> {
            try {
                registerPhone(client, accountId, server);
                recordApproval(client, accountId, latest);
                handler.post(() -> {
                    if (!isDestroyed() && portal != null) portal.refreshAccount();
                });
            } catch (Exception ignored) {
                // Keep the approval pending locally so a later check can retry registration.
            }
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
            boolean sessionExpired = false;
            try {
                operation.run();
            } catch (JirexApi.RequestFailure error) {
                sessionExpired = error.status == 401;
                failure = switch (error.status) {
                    case 402 -> "You need an active plan. Open Payments to choose or renew a plan.";
                    case 409 -> "Your device limit may have been reached. Open Devices to manage your registered devices.";
                    default -> error.getMessage();
                };
            } catch (Exception error) {
                failure = "Could not complete the request. Check your JIREX address and connection.";
            }
            String result = failure;
            boolean requiresLogin = sessionExpired;
            handler.post(() -> {
                if (isDestroyed()) return;
                busy = false;
                if (requiresLogin) {
                    showLogin();
                    scheduleAccountCheck();
                    return;
                }
                updateLocation();
                if (result == null) success.run();
                else showError(result);
            });
        });
    }

    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            if (power != null && !busy && !polling) vpn.worker.execute(() -> {
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
