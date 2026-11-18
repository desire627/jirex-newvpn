#!/usr/bin/env bash
# Turns a fresh Ubuntu 22.04/24.04 server into a JIREX VPN node running AmneziaWG
# (WireGuard with traffic camouflage, so it isn't recognised and blocked by DPI).
#
# Usage (as root, from the project folder copied to the server):
#   sudo bash deploy/install-vpn-node.sh <API_SERVER_IP>
#
# <API_SERVER_IP> is the public IP of the machine running the website/API; only it may
# talk to the agent. If the API runs on THIS same machine (in Docker), pass 172.16.0.0/12.
set -euo pipefail

API_IP="${1:?Usage: sudo bash deploy/install-vpn-node.sh <API_SERVER_IP>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VPN_PORT=51820
AGENT_PORT=8443
CONF_DIR=/etc/amnezia/amneziawg
CONF="$CONF_DIR/awg0.conf"

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (sudo)"; exit 1; fi

echo "==> Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y software-properties-common python3-launchpadlib gnupg2 \
  "linux-headers-$(uname -r)" ufw curl openssl ca-certificates

# The AmneziaWG PPA builds its kernel module from source, which needs deb-src enabled.
if [ -f /etc/apt/sources.list.d/ubuntu.sources ] && ! grep -q 'deb-src' /etc/apt/sources.list.d/ubuntu.sources; then
  sed -i 's/^Types: deb$/Types: deb deb-src/' /etc/apt/sources.list.d/ubuntu.sources   # Ubuntu 24.04
fi
if [ -f /etc/apt/sources.list ] && ! grep -q '^deb-src' /etc/apt/sources.list; then
  sed -i 's/^# *deb-src/deb-src/' /etc/apt/sources.list                                  # Ubuntu 22.04
fi

echo "==> Installing AmneziaWG"
add-apt-repository -y ppa:amnezia/ppa
apt-get update -y
apt-get install -y amneziawg

if ! command -v awg >/dev/null || ! command -v awg-quick >/dev/null; then
  echo "✖ AmneziaWG tools (awg, awg-quick) were not installed. See https://github.com/amnezia-vpn/amneziawg-linux-kernel-module"
  exit 1
fi
if ! modprobe amneziawg 2>/dev/null; then
  echo "✖ The AmneziaWG kernel module didn't load. This usually means the kernel was just updated."
  echo "  Run:  apt-get full-upgrade -y && reboot   then run this script again."
  exit 1
fi

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

PUBLIC_IP="$(curl -4 -fsS https://api.ipify.org)"
IFACE="$(ip -4 route show default | awk '{print $5; exit}')"
echo "==> Public IP: $PUBLIC_IP, internet interface: $IFACE"

echo "==> Configuring AmneziaWG"
umask 077
mkdir -p "$CONF_DIR" /etc/vpn-agent /opt/vpn-agent
[ -f "$CONF_DIR/server.key" ] || awg genkey > "$CONF_DIR/server.key"
SERVER_PRIV="$(cat "$CONF_DIR/server.key")"
SERVER_PUB="$(echo "$SERVER_PRIV" | awg pubkey)"

# Camouflage values, generated once per server and kept on re-runs (existing customer
# configs must keep matching). Limits from the AmneziaWG documentation.
OBF="$CONF_DIR/obfuscation.env"
if [ ! -f "$OBF" ]; then
  rand() { echo $(( $(od -An -N4 -tu4 /dev/urandom) % ($2 - $1 + 1) + $1 )); }
  JC=$(rand 4 12); JMIN=8; JMAX=80
  S1=$(rand 15 150); S2=$(rand 15 150)
  while [ $((S1 + 56)) -eq "$S2" ]; do S2=$(rand 15 150); done
  H1=$(rand 5 2147483647); H2=$H1; H3=$H1; H4=$H1
  while [ "$H2" -eq "$H1" ]; do H2=$(rand 5 2147483647); done
  while [ "$H3" -eq "$H1" ] || [ "$H3" -eq "$H2" ]; do H3=$(rand 5 2147483647); done
  while [ "$H4" -eq "$H1" ] || [ "$H4" -eq "$H2" ] || [ "$H4" -eq "$H3" ]; do H4=$(rand 5 2147483647); done
  printf 'JC=%s\nJMIN=%s\nJMAX=%s\nS1=%s\nS2=%s\nH1=%s\nH2=%s\nH3=%s\nH4=%s\n' \
    "$JC" "$JMIN" "$JMAX" "$S1" "$S2" "$H1" "$H2" "$H3" "$H4" > "$OBF"
fi
# shellcheck disable=SC1090
. "$OBF"

cat > "$CONF" <<EOF
[Interface]
Address = 10.8.0.1/16
ListenPort = $VPN_PORT
PrivateKey = $SERVER_PRIV
Jc = $JC
Jmin = $JMIN
Jmax = $JMAX
S1 = $S1
S2 = $S2
H1 = $H1
H2 = $H2
H3 = $H3
H4 = $H4
# Customers are added by the vpn-agent; the website re-adds them after a reboot.
PostUp = iptables -t nat -A POSTROUTING -s 10.8.0.0/16 -o $IFACE -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -s 10.8.0.0/16 -o $IFACE -j MASQUERADE
EOF

cat > /etc/sysctl.d/99-vpn.conf <<EOF
net.ipv4.ip_forward = 1
EOF
sysctl --system >/dev/null

# Our own service with an explicit config path, so it doesn't depend on packaging defaults.
AWG_QUICK="$(command -v awg-quick)"
cat > /etc/systemd/system/jirex-vpn.service <<EOF
[Unit]
Description=JIREX AmneziaWG interface (awg0)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$AWG_QUICK up $CONF
ExecStop=$AWG_QUICK down $CONF

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl stop jirex-vpn 2>/dev/null || true
"$AWG_QUICK" down "$CONF" 2>/dev/null || true
systemctl enable --now jirex-vpn

echo "==> Configuring firewall"
ufw allow OpenSSH
ufw allow $VPN_PORT/udp
ufw allow from "$API_IP" to any port $AGENT_PORT proto tcp
# Let VPN clients reach the internet, but not each other.
ufw route allow in on awg0 out on "$IFACE"
ufw --force enable

echo "==> Installing agent"
[ -f /etc/vpn-agent/token ] || openssl rand -hex 32 > /etc/vpn-agent/token
if [ ! -f /etc/vpn-agent/cert.pem ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
    -subj "/CN=vpn-agent" -addext "subjectAltName=IP:$PUBLIC_IP" \
    -keyout /etc/vpn-agent/key.pem -out /etc/vpn-agent/cert.pem 2>/dev/null
fi
install -m 755 "$SCRIPT_DIR/../agent/agent.mjs" /opt/vpn-agent/agent.mjs

cat > /etc/systemd/system/vpn-agent.service <<EOF
[Unit]
Description=JIREX VPN node agent
After=network-online.target jirex-vpn.service
Requires=jirex-vpn.service

[Service]
Environment=WG_BIN=awg
Environment=WG_INTERFACE=awg0
ExecStart=$(command -v node) /opt/vpn-agent/agent.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now vpn-agent
systemctl restart vpn-agent

echo
echo "=================================================================="
echo " VPN node ready. On the website go to Admin > Servers > Add server"
echo " and paste the block below (then set a name and country)."
echo " Keep it secret: it contains the agent password."
echo "=================================================================="
OBF="$OBF" node -e '
const fs = require("fs");
const [ip, port, pub, agentPort] = process.argv.slice(1);
const env = Object.fromEntries(fs.readFileSync(process.env.OBF, "utf8").trim().split("\n").map((l) => l.split("=")));
console.log(JSON.stringify({
  endpoint: ip + ":" + port,
  publicKey: pub,
  agentUrl: "https://" + ip + ":" + agentPort,
  agentToken: fs.readFileSync("/etc/vpn-agent/token", "utf8").trim(),
  agentCert: fs.readFileSync("/etc/vpn-agent/cert.pem", "utf8"),
  obfuscation: {
    Jc: +env.JC, Jmin: +env.JMIN, Jmax: +env.JMAX, S1: +env.S1, S2: +env.S2,
    H1: +env.H1, H2: +env.H2, H3: +env.H3, H4: +env.H4,
  },
}, null, 2));
' "$PUBLIC_IP" "$VPN_PORT" "$SERVER_PUB" "$AGENT_PORT"
