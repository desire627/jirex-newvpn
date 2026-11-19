package com.jirex.vpn;

import android.content.Context;
import android.os.SystemClock;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import org.amnezia.awg.backend.GoBackend;
import org.amnezia.awg.backend.Tunnel;
import org.amnezia.awg.backend.TunnelActionHandler;
import org.amnezia.awg.config.Config;

final class VpnConnection implements Tunnel {
    private static VpnConnection instance;
    final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final GoBackend backend;
    volatile State state = State.DOWN;
    volatile long startedAt;
    JirexApi api;
    long accountId;
    org.json.JSONArray servers;
    int selected;

    static VpnConnection get(Context context) {
        if (instance == null) instance = new VpnConnection(context.getApplicationContext());
        return instance;
    }

    private VpnConnection(Context context) {
        backend = new GoBackend(context, new TunnelActionHandler() {
            @Override public void runPreUp(Collection<String> commands) {}
            @Override public void runPostUp(Collection<String> commands) {}
            @Override public void runPreDown(Collection<String> commands) {}
            @Override public void runPostDown(Collection<String> commands) {}
        });
    }

    void start(String configuration) throws Exception {
        var data = new ByteArrayInputStream(configuration.getBytes(StandardCharsets.UTF_8));
        backend.setState(this, State.UP, Config.parse(data));
    }

    void stop() throws Exception {
        backend.setState(this, State.DOWN, null);
    }

    Snapshot snapshot() throws Exception {
        if (state != State.UP) return new Snapshot(false, false, 0, 0, 0);
        var stats = backend.getStatistics(this);
        boolean verified = false;
        long now = System.currentTimeMillis();
        for (var peer : stats.peers()) {
            var details = stats.peer(peer);
            if (details != null && details.latestHandshakeEpochMillis() > now - 180_000) {
                verified = true;
            }
        }
        return new Snapshot(true, verified, stats.totalRx(), stats.totalTx(),
                (SystemClock.elapsedRealtime() - startedAt) / 1000);
    }

    record Snapshot(boolean up, boolean verified, long rx, long tx, long seconds) {}

    @Override public String getName() { return "JIREX"; }
    @Override public Boolean isIpv4ResolutionPreferred() { return false; }
    @Override public Boolean isMetered() { return false; }

    @Override public void onStateChange(State newState) {
        if (newState == State.UP && state != State.UP) startedAt = SystemClock.elapsedRealtime();
        state = newState;
    }
}
