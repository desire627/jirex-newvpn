# JIREX: paid VPN service (AmneziaWG)

Customers sign up on your website, choose a weekly, monthly or yearly plan, **pay you by bank transfer and
upload the receipt**. You approve the receipt in the admin panel, and they download a config file for the free
**AmneziaWG** app. Access turns off automatically when their time runs out. The whole site is available in
**English and Russian**.

AmneziaWG is WireGuard with traffic camouflage: it adds junk packets and changes packet headers, so DPI systems
can't easily recognise the connection as a VPN and block it.

```
 Customer's phone/laptop ──AmneziaWG (encrypted, disguised)──► VPN server(s) ──► Internet
        │                                                          ▲
        │ sign up / upload receipt / download config               │ add/remove customers (HTTPS, pinned cert)
        ▼                                                          │
 Website + API + Database (one small server) ──────────────────────┘
        ▲
        │ approve / reject receipts
      You (admin panel)
```

| Folder | What it is |
| --- | --- |
| `server/` | Node.js API: accounts, receipts, devices, admin. PostgreSQL database. |
| `web/` | React website (EN/RU): home/pricing, sign-up, customer dashboard, admin panel. |
| `agent/` | Small program on each VPN server that adds/removes customers in AmneziaWG. |
| `deploy/` | `install-vpn-node.sh` turns a fresh Ubuntu server into an AmneziaWG VPN server. |
| `local/` | Runs everything on your PC for testing (`npm start`). |
| `brand/` | Logo files (PNG + SVG). |

**Where to change things**
- Prices: [server/src/plans.js](server/src/plans.js) (rubles)
- Brand name and support email: [web/src/brand.js](web/src/brand.js)
- All website texts: [web/src/i18n/en.js](web/src/i18n/en.js) (English) and [web/src/i18n/ru.js](web/src/i18n/ru.js) (Russian)
- Device limit: `MAX_DEVICES` in `server/.env`
- Your bank details: on the website, **Admin → Settings**

**Language:** visitors whose browser is set to Russian see the site in Russian; everyone else sees English.
Anyone can switch with the **EN / RU** button in the header, and the choice is remembered.

**VPN apps:** the home page links to the signed Android APK on GitHub. Set `VITE_JIREX_ANDROID_URL` at
web build time to override that link.
The home page includes a post-payment setup guide for Android, iPhone and iPad, Windows, and macOS.

**Render Static Site:** keep `/api/*` → your API URL as **Rewrite**, followed by `/*` → `/index.html`
as **Rewrite** (not Redirect). The fallback must preserve the requested URL so refreshing a page such as
`/dashboard` does not send visitors to Home.

---

## Launch checklist

### 1. Rent two servers (about $10/month total)

Any VPS provider works (Hetzner, DigitalOcean, Vultr, Aeza, etc.). Choose **Ubuntu 24.04** (or 22.04).

- **Web server:** the cheapest plan (1 GB RAM) is enough. It runs the website, API and database.
- **VPN server:** 1–2 GB RAM, in a country your customers want to connect through. Watch the
  **bandwidth allowance**: VPN users use a lot.

Add more VPN servers later as you grow; each one is a single command.

> Tight budget? You can run everything on one server. Pass `172.16.0.0/12` instead of the API IP in step 4.

### 2. Buy a domain

In its DNS settings, create an **A record** pointing `yourdomain.com` to your **web server's IP**.

### 3. Deploy the website + API (on the web server)

```bash
ssh root@WEB_SERVER_IP
curl -fsSL https://get.docker.com | sh
git clone <your-repo-url> vpn && cd vpn        # or upload this folder with scp

cp server/.env.example server/.env
nano server/.env      # fill in APP_URL, JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL and SMTP_PASS

echo "DOMAIN=yourdomain.com" > .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
echo "BACKUP_PASSWORD=$(openssl rand -hex 24)" >> .env   # copy this somewhere safe too!

docker compose up -d --build
```

To generate `JWT_SECRET` and `ENCRYPTION_KEY`, run `openssl rand -hex 32` twice.
**Back up `ENCRYPTION_KEY`.** If you lose it, customers' existing configs can't be downloaded again.

Open `https://yourdomain.com` (HTTPS is set up automatically). Go to **Admin sign in → Create the first admin**,
use the `ADMIN_EMAIL` address, set a password, and verify the address from the emailed code. Then sign in at
`/admin/login`. After setup, existing admins can add more administrators from **Admin → Admins**.

### 4. Set up the VPN server

```bash
# from your computer, upload the project:
scp -r agent deploy root@VPN_SERVER_IP:/root/vpn/
ssh root@VPN_SERVER_IP
sudo bash /root/vpn/deploy/install-vpn-node.sh WEB_SERVER_IP
```

The script installs AmneziaWG from the official Amnezia PPA (`ppa:amnezia/ppa`), generates this server's
camouflage settings, and sets up a firewall and the agent. It prints a block of server details at the end.
On the website, go to **Admin → Servers → Add server**, type a name and country, paste the block, and click
**Test & add server**.

> If the script says the AmneziaWG kernel module didn't load, run `apt-get full-upgrade -y && reboot`,
> then run the script again. This happens when the kernel was updated but the server hasn't restarted.

### 5. Open payments

1. **Admin → Settings**: enter your real bank details (bank, card or account number, recipient name, SBP
   phone). Customers see these when they pay. While this is empty, payments are closed.
2. A customer picks a plan → sends the money with their reference code (e.g. `JX00012`) in the comment →
   uploads the receipt (photo, screenshot or PDF, max 8 MB).
3. It appears in **Admin → Payments → Needs review**. Check the money actually arrived in your bank, then
   **Approve** (the plan's days are added instantly) or **Reject** with a reason the customer will see.
4. Receipts are stored in the `receipts` Docker volume (`UPLOAD_DIR`). Include it in your backups.

There are no payment integrations. Every payment goes through your review. For free trials or cash
payments, use **Admin → Customers → Add time**.

### 6. Backups

The `backup` service saves an **encrypted** copy of the database and receipts every day into `backups/` on the
web server, keeping the last 14 days. They can only be opened with `BACKUP_PASSWORD` from `.env`, so keep a
copy of that password outside the server (for example in a password manager).

- **Copy backups off the server regularly**: a backup on the same server doesn't help if the server is lost.
  From your computer: `scp root@WEB_SERVER_IP:/root/vpn/backups/* ./jirex-backups/`
- **Restore** (replaces all current data): `bash deploy/restore.sh backups/jirex-<date>.tar.gz.enc`

---

## Deploy a demo to Vercel

The repository includes a Vercel function for the API, SPA routing, and a daily maintenance cron. This setup is
for trying the website on Vercel: `DEMO_SERVER=1` creates a simulated VPN server, so generated VPN configs
will **not** connect to the internet.

1. Import the repository into Vercel and keep the **Root Directory** at the repository root. The root
   `vercel.json` installs the API and web dependencies, builds `web/`, and routes `/api/*` to the API.
2. Create a managed PostgreSQL database and add its connection string as `DATABASE_URL`. Use the provider's
   TLS-enabled connection string; a pooled connection string is recommended for serverless deployments.
3. Add these environment variables in the Vercel project settings (Production):

   | Variable | Value |
   | --- | --- |
   | `APP_URL` | The deployed site's full URL, such as `https://your-domain.vercel.app` |
   | `DATABASE_URL` | The managed PostgreSQL connection string |
   | `JWT_SECRET` | A new, random secret |
   | `ENCRYPTION_KEY` | A new, random 64-character hexadecimal key; keep a secure backup |
   | `ADMIN_EMAIL` | The email address that will create the first administrator |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Your email provider's SMTP settings; required for sign-in codes |
   | `DEMO_SERVER` | `1` |
   | `RECEIPT_STORAGE` | `database` |
   | `PG_POOL_MAX` | `3` |
   | `CRON_SECRET` | A new, random secret for the scheduled maintenance endpoint |

   Generate `JWT_SECRET`, `ENCRYPTION_KEY`, and `CRON_SECRET` separately with Node.js:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Do not commit these values or reuse production secrets in Preview deployments.
4. Deploy, then check `https://your-domain.vercel.app/api/health`. Sign up using `ADMIN_EMAIL`, verify the
   email code, and sign in at `/admin/login`. The Vercel cron runs maintenance daily at 03:00 UTC.

Vercel does not provide persistent local disk to functions, so receipts are stored encrypted in PostgreSQL.
This demo deployment does not configure a real VPN node. For a live VPN service, the API needs stable outbound
network access that can be allowlisted by the VPN nodes; host the API on a fixed-IP server or use an appropriate
static-egress setup.

## How it works

- **Access** is one date per customer (`access_until`). An approved receipt adds the plan's days (7, 30 or
  365) on top of any time left. Nothing renews automatically.
- **Sync:** every 2 minutes, and right after any approval, device change or revoke, the API makes each VPN
  server's peer list exactly match "devices of customers with access". Expired customers are cut off, and
  everything is restored after a server reboot.
- **Customer configs** include the server's AmneziaWG settings (`Jc`, `Jmin`, `Jmax`, `S1`, `S2`, `H1`–`H4`).
  These must match the server, so they're stored per server and generated once by the install script
  (re-running the script keeps them).
- **Receipts** are stored encrypted (AES-256-GCM) and deleted automatically 90 days after review
  (`RECEIPT_RETENTION_DAYS`); the payment record stays. They are only accepted if the file really is a PDF/JPG/PNG/WebP (checked from its content, not its
  name), up to 8 MB, max 2 waiting per customer. Only that customer and admins can open them.
- **Sign-in:** customers generate a UUID access key (no personal details required) and use it for every sign-in.
  Save the key privately. It can be viewed in the signed-in profile, and sessions expire after seven days of inactivity.
  Admins use email + password and a 6-digit email code, with email verification
  required before their first sign-in. Existing admins can add other admins from the dashboard. Codes are
  stored hashed, expire after 10 minutes, lock after 5 wrong tries, and are limited to one resend a minute and
  6 an hour. Admin password resets work the same way and sign the account out on every other device. Emails
  go out through the SMTP account in `server/.env` (`SMTP_*` settings).
- **Security:** admin passwords are hashed with bcrypt. Customer access key hashes are used for sign-in,
  and encrypted copies let customers view their own keys.
  customers' private keys are encrypted (AES-256-GCM) in the
  database; the agent accepts only the API server's IP, a secret token and a pinned TLS certificate;
  VPN customers can't reach each other.
- **No traffic logs.** Customer VPN accounts do not require a name or email. The system stores access-key
  hashes, devices and payment records; admin accounts use email addresses. AmneziaWG keeps only the
  "last handshake" time and byte counters in memory.

## Customers' privacy

- Customers can **download their data** and **delete their account** from the Account page. Deleting erases
  their details, devices and receipts; payment amounts and dates stay (without a name) for accounting.
- The **Privacy Policy** page (`/privacy`, English and Russian) describes exactly what the system stores. If you
  change what's collected, update it in `web/src/i18n/en.js` and `ru.js` (`privacy` section). Have it reviewed
  by a lawyer for your country before launch.

## Customer apps (AmneziaWG)

| Platform | Link |
| --- | --- |
| Android | https://play.google.com/store/apps/details?id=org.amnezia.awg |
| iPhone, iPad, Mac | https://apps.apple.com/app/amneziawg/id6478942365 |
| Windows | https://github.com/amnezia-vpn/amneziawg-windows-client/releases/latest |

Customers import the downloaded `.conf` file (**+ → Import from file** on Android; **Add a tunnel → Create
from file** on iPhone; **Import tunnel(s) from file** on Windows/Mac). The site also shows a QR code for
phones; check whether your version of the AmneziaWG app offers "Scan from QR code".

## Try it on your PC first

Needs only Node.js 20+ (no Docker, no Postgres install):

```bash
cd local
npm install
npm start          # opens everything at http://localhost:5173 ; Ctrl+C to stop
npm run reset      # wipe test data and start fresh
```

This runs a test database, the website, the API, and a **simulated VPN server**
with sample bank details. Test data is kept outside OneDrive (it can damage a database while syncing it), in
`%LOCALAPPDATA%JIREX-local` on Windows. Always stop with **Ctrl+C** so the database can save and close properly. Sign up as `desireasiimwe24@gmail.com` to be admin. Configs are real AmneziaWG format but
point at the simulated server, so they won't actually connect.

**Test a real VPN connection:** rent one VPN server by the hour, run `install-vpn-node.sh` on it, and either
deploy the website too (step 3) or expose your PC's API to it with a tunnel such as `cloudflared`.

---

## Before you take money: business & legal

- **Check the law where you and your customers are.** Russia restricts VPN services and regularly blocks VPN
  protocols. AmneziaWG makes blocking harder, not impossible. Get local legal advice.
- **Write a Terms of Service, an Acceptable Use Policy and a Privacy Policy** that match what you actually
  store. Link them in the footer.
- **Abuse complaints:** your hosting provider forwards complaints about your VPN server IPs. Read their
  policy; some hosts don't allow VPN services.
- **Bandwidth costs:** if one heavy user downloads 2 TB, does your plan cover it? Watch usage in Admin → Servers.

## Ideas for later

- Email notifications (new receipt for you, "plan activated" for customers)
- Free trial (automatically "Add time" on sign-up)
- Password reset by email
- More server locations, per-device bandwidth stats
