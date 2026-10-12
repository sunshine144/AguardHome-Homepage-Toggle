# 🛡️ Homepage AdGuard Home Header Action Pill

> Add an interactive 1-Click Pause & Resume action pill with custom durations and a live ticking countdown directly to your [Homepage](https://gethomepage.dev/) dashboard — **no Home Assistant required!**

<div align="center">
  <img src="assets/demo.gif" alt="Homepage AdGuard Action Pill Demo" width="700" />
</div>

> [!NOTE]
> **Why this exists**: The standard community advice for adding buttons to Homepage is *"just set up Home Assistant and build an automation."* If you only run a lightweight server with a few services, installing and configuring Home Assistant just to pause DNS blocking for 10 minutes is massive overkill. This project gives you a direct, native-feeling toggle with zero external software needed.

---

## ✨ Features

- 🚫 **No Home Assistant Needed**: Completely standalone — built specifically to eliminate the need for an external Home Assistant stack.
- ⚡ **1-Click Default Pause**: Click the badge once to instantly pause AdGuard for 10 minutes.
- ⏱️ **Split Duration Dropdown**: Click the chevron (`▼`) to pick custom durations:
  - ⚡ 30 seconds
  - ⏱️ 1 minute
  - ⏱️ 10 minutes
  - 🕒 1 hour
  - 🌙 *Until tomorrow* (dynamically calculates milliseconds to midnight)
- ⏳ **Live Countdown Timer**: Once paused, the pill turns into a subtle pulsing red indicator showing real-time remaining time (`▶ 09:42`).
- 🛡️ **Click-to-Resume**: Click the ticking badge at any time to immediately cancel the pause and resume DNS protection.
- 🔒 **Zero Extra Ports / No CORS Issues**: Bypasses the AdGuard API's CORS limitations by using Homepage's Next.js backend as a same-origin proxy. Zero firewall modifications needed; works flawlessly over LAN, Tailscale, or HTTPS reverse proxies.
- 🎨 **Nord / Slate Aesthetic**: Translucent frosted glass look with smooth hover effects, dropdown shadows, and toast notifications.

---

## 🏗️ Architecture

AdGuard Home's API (`/control/protection`) returns `405 Method Not Allowed` when called directly from a browser because it does not support CORS preflight (`OPTIONS`) requests. Furthermore, accessing Homepage over HTTPS causes mixed-content blocks when calling HTTP endpoints.

This project solves both problems elegantly by routing status checks and protection toggles through Homepage's existing config API handler (`/api/config/adguard`):

```
┌──────────────────────────────────────┐
│        Browser (Homepage UI)         │
└──────────────────┬───────────────────┘
                   │  POST /api/config/adguard
                   │  Headers: X-Homepage-AdGuard-Toggle: 1
                   │  Payload: {"action": "pause", "duration": 600000}
                   │  (CSRF-Hardened: POST-only, custom header, CORS preflight protected)
                   ▼
┌──────────────────────────────────────┐
│ Homepage Container (:3000)           │
│   Next.js API: /api/config/[path].js │
└──────────────────┬───────────────────┘
                   │  POST http://adguard-host:80/control/protection
                   │  (Server-to-server with Basic Auth)
                   ▼
┌──────────────────────────────────────┐
│         AdGuard Home Server          │
└──────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Add `id: adguard-home` to `services.yaml`

In your Homepage `config/services.yaml`, ensure your AdGuard Home item has `id: adguard-home`:

```yaml
    - AdGuard Home:
        id: adguard-home
        icon: adguard-home.png
        href: http://192.168.1.1:80
        description: Network DNS & Ad Blocker
        widget:
          type: adguard
          url: http://192.168.1.1:80
          username: "{{HOMEPAGE_VAR_ADGUARD_USER}}"
          password: "{{HOMEPAGE_VAR_ADGUARD_PASSWORD}}"
```

### 2. Configure Credentials in `config/.env`

Set your AdGuard Home connection details in your Homepage `config/.env` (or copy from `config/.env.example`):

```env
# Choose the URL that matches your AdGuard hosting setup:
HOMEPAGE_VAR_ADGUARD_URL=http://192.168.1.1:80       # Bare-metal / Router / Dedicated server
# HOMEPAGE_VAR_ADGUARD_URL=http://adguard-home:80    # Docker container on the same network
# HOMEPAGE_VAR_ADGUARD_URL=http://host.docker.internal:80 # Installed directly on the Docker host

HOMEPAGE_VAR_ADGUARD_USER=admin
HOMEPAGE_VAR_ADGUARD_PASSWORD=your_secure_password
```

> [!IMPORTANT]
> **Container Networking Tip**: Do **not** use `http://localhost:80`. Inside the Homepage container, `localhost` points to Homepage itself, not your host or other containers. Use your server's LAN IP or the container service name (e.g., `http://adguard-home:80`).
>
> **Why .env?** Homepage natively resolves `{{HOMEPAGE_VAR_*}}` tokens, and storing credentials in `.env` ensures passwords are never committed to git or exposed in plain text.

### 3. Copy `custom.js` & `custom.css`

Copy the custom script and styling from `config/` into your Homepage's `config/` directory:

```bash
cp config/custom.js /path/to/your/homepage/config/custom.js
cp config/custom.css /path/to/your/homepage/config/custom.css
```

### 4. Enable Dynamic In-Container Boot Patcher (Recommended)

Copy `entrypoint-patch.sh` into your Homepage directory and make it executable:

```bash
cp entrypoint-patch.sh /path/to/your/homepage/entrypoint-patch.sh
chmod +x /path/to/your/homepage/entrypoint-patch.sh
```

This lightweight script runs inside the Homepage container at startup. It patches Next.js dynamically in container memory, so **future Homepage container updates or Watchtower/autoupdate runs will never break your toggle**! If Homepage ever updates in an incompatible way, the patcher gracefully skips itself, allowing Homepage to start normally.

### 5. Update `docker-compose.yml`

Mount `entrypoint-patch.sh` and set the container entrypoint (no Docker socket or raw host mounts needed):

```yaml
services:
  homepage:
    image: ghcr.io/gethomepage/homepage:latest
    container_name: homepage
    ports:
      - "3000:3000"
    entrypoint: ["/bin/sh", "/usr/local/bin/entrypoint-patch.sh"]
    volumes:
      - ./config:/app/config:z
      # Dynamic in-container patcher (survives image updates!)
      - ./entrypoint-patch.sh:/usr/local/bin/entrypoint-patch.sh:ro,z
    # Loads AdGuard credentials securely from config/.env
    env_file:
      - ./config/.env
    environment:
      - PORT=3000
      # Security best practice: restrict allowed hosts to your LAN IP / domain
      # - HOMEPAGE_ALLOWED_HOSTS=192.168.1.100,localhost,127.0.0.1
    restart: always
```

*(Optional alternative)*: If you prefer static file patching instead of an entrypoint wrapper, you can run `./patches/patch.sh homepage` which uses the container's built-in Node.js runtime with zero host dependencies.

### 6. Restart Homepage

```bash
docker compose down && docker compose up -d
# or: podman-compose down && podman-compose up -d
```

Hard-refresh your Homepage browser tab (`Ctrl + F5` or `Cmd + Shift + R`). The action pill will appear in the top-right header of your AdGuard Home card!

---

## ⚙️ Customization

In `config/custom.js`, you can easily customize:
- **Default pause time**: Change `DEFAULT_PAUSE_MS = 600000;` (default is 10 minutes).
- **Dropdown durations**: Add, change, or remove options in the `agh-dropdown-menu` HTML block.
- **Polling efficiency**: Status polling runs every 30 seconds while the tab is active and automatically pauses completely when the tab is backgrounded (`document.hidden`) to avoid CPU overhead on low-power devices.
- **Drift-free countdown**: The countdown calculates remaining time using absolute system timestamps (`endsAt`), keeping time accurate even if the tab was suspended.

In `config/custom.css`, you can adjust colors, fonts, or position to match your personal Homepage theme.

---

## 🤝 Acknowledgments & Development Note

This project was conceived, architectural decisions guided, and thoroughly reviewed and tested by me. The low-level JavaScript, Next.js proxy patches, CSS, and container automation were programmed in pair-programming sessions with Google DeepMind's **Antigravity AI**.

> *"My ideas and requirements made this possible; AI made it possible today!"*

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

