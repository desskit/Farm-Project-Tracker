# Deploying Farm Project Tracker on Proxmox

A complete, start-to-finish guide to running the app on a Proxmox VE host, reachable
over HTTPS from anywhere via your home router.

```
Phone/laptop ──HTTPS──▶ Home router :80/:443 ──▶ Proxmox guest (Docker)
                        (port-forward)             ├─ caddy   (TLS, :80/:443)
                                                    └─ app     (Next.js, :3000)
                                                       └─ /data volume (SQLite + uploads)
```

> **Where the project is at:** the server foundation runs today — it boots, migrates its
> database, creates the admin account, and serves a health endpoint and a placeholder home
> page. The **login screen and full UI are the next phase**, so after deploying you'll confirm
> it's *up* (health check + home page), not log in yet. Everything below stays valid as those
> land — you'll just `git pull` and rebuild.

---

## 0. Prerequisites

- A **Proxmox VE** host you can create a guest on.
- A **domain name** (or subdomain) you can add a DNS record to, e.g. `farm.example.com`.
  Caddy needs this to obtain a free Let's Encrypt certificate.
- **Admin access to your home router** (to forward ports 80/443).
- Rough guest sizing: **2 vCPU, 2 GB RAM, 15 GB disk** is plenty.

Pick **one** guest type:

- **Option A — VM (recommended):** most robust, zero Docker/Proxmox friction. Start here.
- **Option B — LXC container:** lighter/faster, but Docker-in-LXC needs two feature flags.

---

## Option A — Ubuntu Server VM (recommended)

### A1. Get the install ISO onto Proxmox

In the Proxmox web UI: **Datacenter → your node → local (storage) → ISO Images → Download from URL**,
and paste the Ubuntu Server 24.04 LTS ISO URL (from ubuntu.com/download/server). Or upload an ISO
you've already downloaded.

### A2. Create the VM

**Create VM** (top-right), stepping through the wizard:

- **General:** Name `farm-tracker`.
- **OS:** the Ubuntu ISO you just added.
- **System:** defaults are fine (enable QEMU Agent if you like).
- **Disks:** 15–20 GB.
- **CPU:** 2 cores. **Memory:** 2048 MB.
- **Network:** bridge `vmbr0` (your LAN bridge).

Finish, then **Start** the VM and open its **Console** to run the Ubuntu installer. During install:
accept defaults, create your admin user, and **install OpenSSH server** when prompted.

### A3. Give it a stable LAN address

Easiest: create a **DHCP reservation** for the VM's MAC on your router so it always gets the same
IP (e.g. `192.168.1.50`). Alternatively set a static IP inside the guest. Note this IP — you'll
port-forward to it.

### A4. Install Docker

SSH into the VM (`ssh youruser@192.168.1.50`) and run:

```bash
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker   # or log out/in so group membership applies
docker --version && docker compose version
```

Now skip to **[3. Get the app and configure it](#3-get-the-app-and-configure-it)**.

---

## Option B — LXC container (lighter)

### B1. Download a template

**Datacenter → node → local → CT Templates → Templates**, download **debian-12-standard**.
(Or on the host shell: `pveam update && pveam available | grep debian-12` then `pveam download local debian-12-standard_*`.)

### B2. Create the container

**Create CT** (top-right):

- **General:** uncheck *Unprivileged* is **not** required — leave it **unprivileged** (default, safer).
- **Template:** the Debian 12 template.
- **Disk:** 15 GB. **CPU:** 2 cores. **Memory:** 2048 MB.
- **Network:** bridge `vmbr0`, and set a **static IPv4** (e.g. `192.168.1.50/24`, gateway your router).

Create it but **don't start it yet.**

### B3. Enable Docker support (nesting + keyctl)

Docker needs two container features. Either:

- **GUI:** select the CT → **Options → Features →** enable **nesting** and **keyctl**, or
- **Host shell:** edit `/etc/pve/lxc/<CTID>.conf` and add:

  ```
  features: nesting=1,keyctl=1
  ```

Then **Start** the container.

### B4. Install Docker inside the container

Open the CT **Console** (or SSH) and run:

```bash
apt update && apt -y upgrade
apt -y install curl ca-certificates git
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

Continue below.

---

## 3. Get the app and configure it

Inside your VM or container:

```bash
git clone https://github.com/desskit/Farm-Project-Tracker.git
cd Farm-Project-Tracker/server
cp .env.example .env
```

Edit `.env` (`nano .env`) and set at least:

```dotenv
PUBLIC_DOMAIN=farm.example.com          # host only, no https://
PUBLIC_URL=https://farm.example.com
TZ=America/Los_Angeles                  # your farm's timezone
SESSION_SECRET=<paste output of: openssl rand -hex 32>
SEED_ADMIN_NAME=Dale
SEED_ADMIN_EMAIL=you@example.com
SEED_ADMIN_PASSWORD=<a strong password>
```

Generate the session secret with:

```bash
openssl rand -hex 32
```

Leave the SMTP / VAPID / ANTHROPIC values blank for now — those features stay off until you fill
them in later.

---

## 4. Networking: DNS + router port-forward

Caddy gets a real HTTPS certificate automatically, but it needs your domain pointing at your house
and ports 80/443 reachable.

1. **DNS:** add an **A record** for `farm.example.com` → your home's public IP
   (find it at e.g. `curl ifconfig.me`). If your ISP IP changes, use a **DDNS** provider
   (DuckDNS, Cloudflare, etc.) and a client that keeps the record updated.
2. **Router port-forward:** forward external **TCP 80** and **TCP 443** to the guest's LAN IP
   (`192.168.1.50`). Both are required — port 80 for the Let's Encrypt challenge, 443 for traffic.
3. **LAN access (optional):** many routers don't support "hairpin NAT," so `https://farm.example.com`
   may not resolve from *inside* your network. If so, add a local DNS override (Pi-hole / router
   hosts entry) mapping the domain to the guest's LAN IP, or just use the LAN IP for on-site testing.

---

## 5. Launch

From `Farm-Project-Tracker/server`:

```bash
docker compose up -d --build
```

First build takes a few minutes. Then check it:

```bash
docker compose ps                     # both app and caddy should be "running"
docker compose logs -f app            # look for: [boot] migrations applied
                                      #           [boot] created first admin: you@example.com
```

Press `Ctrl-C` to stop following logs (containers keep running).

---

## 6. Verify

- **From the guest itself:**
  ```bash
  curl -s http://localhost:3000/api/health
  # {"ok":true,"db":"up","time":"..."}
  ```
- **Through Caddy / the internet:** browse to `https://farm.example.com`. You should get a valid
  padlock (Let's Encrypt) and the placeholder home page reading *"Server phase — foundation is up"*
  with *"Not signed in."* That confirms the full path (DNS → router → Caddy → app → DB) works.
- Caddy issues the cert on first HTTPS request; if the padlock isn't valid immediately, give it a
  minute and check `docker compose logs -f caddy`.

The admin account from your `.env` already exists in the database — the login screen to use it
arrives with the next phase.

---

## 7. Backups

All app state is the **`farmdata`** Docker volume (`/data/app.db` + `/data/uploads`). Options:

- **Proxmox-level:** snapshot or back up the whole guest (Datacenter → Backup) — simplest.
- **File-level (nightly):**
  ```bash
  docker run --rm -v farm_farmdata:/data -v "$PWD":/backup busybox \
    tar czf /backup/farm-backup-$(date +%F).tgz -C /data .
  ```
  (Volume name is usually `<projectdir>_farmdata`; confirm with `docker volume ls`.)
- Restore by extracting the tarball back into the volume while the app is stopped.

Continuous SQLite replication (Litestream) is planned for a later phase.

---

## 8. Updating the app

```bash
cd Farm-Project-Tracker
git pull
cd server
docker compose up -d --build
```

Migrations run automatically on boot, so schema changes apply themselves. Your data in the volume
is preserved across rebuilds.

---

## 9. Security notes (you're exposing a login to the internet)

Port-forwarding puts the app on the public internet, so:

- Use a **strong admin password** and a real random **`SESSION_SECRET`**.
- Keep the guest updated (`apt upgrade`) and rebuild the app periodically for patches.
- Consider a firewall on the guest allowing only 80/443/22, e.g.:
  ```bash
  sudo ufw allow 22,80,443/tcp && sudo ufw enable
  ```
- Consider **fail2ban** or **CrowdSec** watching Caddy's logs to throttle brute-force attempts.
  (Server-side login rate-limiting is on the roadmap.)
- If you'd rather not expose anything publicly, a VPN (Tailscale/WireGuard) is a drop-in
  alternative — Caddy can still serve internally; just don't port-forward.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Cert never issues / browser warning | Ports 80 **and** 443 not both forwarded, or DNS not pointing at your IP. Check `docker compose logs caddy`. |
| `docker: permission denied` | Add your user to the `docker` group (`sudo usermod -aG docker $USER`, then re-login). |
| Docker won't start in an LXC | `nesting=1,keyctl=1` not set on the container, or CT not restarted after setting them. |
| Works on LAN IP but not the domain (from home) | No hairpin NAT — add a local DNS override (see §4.3). |
| Dates/rollovers look off by a day | Set `TZ` in `.env` to the farm's timezone and `docker compose up -d`. |
| `[boot] no users found ... SEED_ADMIN_* unset` | Set `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` in `.env` and restart. |
| Health check fails | `docker compose logs app` — usually a bad `DATABASE_URL` or the `/data` volume isn't writable. |
