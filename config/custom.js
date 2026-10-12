/**
 * AdGuard Home Header Action Pill for Homepage (Design A)
 * https://github.com/sunshine144/AguardHome-Homepage-Toggle
 *
 * Seamless top-right badge integration with 1-click default (10m) + duration dropdown,
 * drift-free real-time countdown timer, background tab throttling, and status synchronization.
 */

(function () {
  "use strict";

  const DEFAULT_PAUSE_MS = 600000; // 10 minutes default
  let pollInterval = null;
  let countdownTimer = null;
  let endsAt = 0;
  let isPaused = false;
  let documentClickAttached = false;

  function formatTime(ms) {
    if (ms <= 0) return "00:00";
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (hours > 0) {
      return `${hours}h ${mins.toString().padStart(2, "0")}m`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  function getMsUntilTomorrow() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return Math.max(60000, tomorrow.getTime() - now.getTime());
  }

  function showToast(message, type = "success") {
    let toast = document.getElementById("agh-global-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "agh-global-toast";
      toast.className = "agh-toast";
      document.body.appendChild(toast);
    }
    toast.className = `agh-toast show ${type === "pause" ? "agh-toast-pause" : "agh-toast-success"}`;
    toast.innerHTML = message;

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  async function callBridge(action, params = {}) {
    try {
      const res = await fetch("/api/config/adguard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Homepage-AdGuard-Toggle": "1"
        },
        body: JSON.stringify({ action, ...params })
      });
      if (!res.ok) {
        console.warn("[AGH-Bridge] HTTP error:", res.status);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn("[AGH-Bridge] Connection error:", err);
      return null;
    }
  }

  async function triggerPause(durationMs, label) {
    showToast(`⏳ Pausing AdGuard for ${label}...`, "pause");
    const res = await callBridge("pause", { duration: durationMs });
    if (res && res.ok) {
      showToast(`⏸ AdGuard paused for ${label}`, "pause");
      updateState(false, durationMs);
    } else {
      showToast("❌ Failed to pause AdGuard", "pause");
    }
  }

  async function triggerResume() {
    showToast("⏳ Resuming AdGuard protection...", "success");
    const res = await callBridge("resume");
    if (res && res.ok) {
      showToast("🛡️ AdGuard protection active", "success");
      updateState(true, 0);
    } else {
      showToast("❌ Failed to resume AdGuard", "pause");
    }
  }

  function startPolling() {
    if (document.hidden) return;
    clearInterval(pollInterval);
    const intervalMs = isPaused ? 10000 : 30000;
    pollInterval = setInterval(checkStatus, intervalMs);
  }

  function updateState(protectionEnabled, durationMs = 0) {
    isPaused = !protectionEnabled;

    const pill = document.getElementById("agh-pill");
    const mainBtn = document.getElementById("agh-main-btn");
    const splitBtn = document.getElementById("agh-split-btn");
    const dropdown = document.getElementById("agh-dropdown");

    if (!pill || !mainBtn) return;

    if (dropdown) dropdown.classList.remove("show");
    clearInterval(countdownTimer);

    if (isPaused) {
      pill.classList.add("agh-paused");
      if (durationMs > 0) {
        endsAt = Date.now() + durationMs;
        mainBtn.innerHTML = `<span class="agh-icon">▶</span> ${formatTime(durationMs)}`;
        countdownTimer = setInterval(() => {
          const remaining = Math.max(0, endsAt - Date.now());
          if (remaining <= 0) {
            clearInterval(countdownTimer);
            checkStatus();
          } else {
            mainBtn.innerHTML = `<span class="agh-icon">▶</span> ${formatTime(remaining)}`;
          }
        }, 1000);
      } else {
        mainBtn.innerHTML = `<span class="agh-icon">▶</span> RESUME`;
      }
      mainBtn.title = "Protection paused - Click to resume immediately";
      if (splitBtn) splitBtn.style.display = "none";
    } else {
      pill.classList.remove("agh-paused");
      mainBtn.innerHTML = `<span class="agh-icon">⏸</span> 10m`;
      mainBtn.title = "Click to pause AdGuard for 10 minutes";
      if (splitBtn) splitBtn.style.display = "inline-flex";
    }

    startPolling();
  }

  async function checkStatus() {
    const data = await callBridge("status");
    if (data && data.ok) {
      updateState(data.protection_enabled, data.protection_disabled_duration || 0);
    }
  }

  function findAdGuardCard() {
    // 1. Direct ID match from services.yaml (id: adguard-home)
    const liById = document.getElementById("adguard-home");
    if (liById) {
      return liById.querySelector(".service-card") || liById;
    }

    // 2. data-name attribute match
    const liByName = document.querySelector('li[data-name="AdGuard Home"], li[data-name="Adguard Home"], li[data-name="adguard"]');
    if (liByName) {
      return liByName.querySelector(".service-card") || liByName;
    }

    // 3. Link href and host inspection (avoids matching unrelated :8080 / :8000 services)
    const links = document.querySelectorAll('a[href*="adguard"], a[href]');
    for (const a of links) {
      try {
        const u = new URL(a.href, window.location.origin);
        const isAdgHost = u.hostname.toLowerCase().includes("adguard") || a.textContent.toLowerCase().includes("adguard");
        if (isAdgHost) {
          const card = a.closest(".service-card");
          if (card) return card;
        }
      } catch (_) {}
    }

    // 4. Scoped service card heading search
    const headings = document.querySelectorAll(".service-card .service-name, .service-card h2, .service-card h3");
    for (const h of headings) {
      if (h.textContent.trim().toLowerCase().includes("adguard")) {
        return h.closest(".service-card");
      }
    }
    return null;
  }

  function injectControls() {
    if (document.getElementById("agh-pill-container")) return;

    const card = findAdGuardCard();
    if (!card) return;

    const container = document.createElement("div");
    container.id = "agh-pill-container";
    container.className = "agh-pill-container";

    container.innerHTML = `
      <div id="agh-pill" class="agh-pill">
        <button id="agh-main-btn" class="agh-pill-btn" title="Click to pause AdGuard for 10 minutes">
          <span class="agh-icon">⏸</span> 10m
        </button>
        <button id="agh-split-btn" class="agh-pill-chevron" title="More duration options">
          ▼
        </button>
        <div id="agh-dropdown" class="agh-dropdown-menu">
          <button class="agh-dropdown-item" data-ms="30000" data-label="30 seconds">
            <span>⚡ For 30 seconds</span>
          </button>
          <button class="agh-dropdown-item" data-ms="60000" data-label="1 minute">
            <span>⏱️ For 1 minute</span>
          </button>
          <button class="agh-dropdown-item" data-ms="600000" data-label="10 minutes">
            <span>⏱️ For 10 minutes</span>
          </button>
          <button class="agh-dropdown-item" data-ms="3600000" data-label="1 hour">
            <span>🕒 For 1 hour</span>
          </button>
          <div class="agh-dropdown-divider"></div>
          <button class="agh-dropdown-item" data-action="tomorrow" data-label="Until tomorrow">
            <span>🌙 Until tomorrow</span>
          </button>
        </div>
      </div>
    `;

    // Ensure parent card has relative positioning
    if (getComputedStyle(card).position === "static") {
      card.style.position = "relative";
    }

    // Insert inside the card header
    card.appendChild(container);

    // Prevent button clicks from triggering parent card navigation link
    container.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    const mainBtn = container.querySelector("#agh-main-btn");
    const splitBtn = container.querySelector("#agh-split-btn");
    const dropdown = container.querySelector("#agh-dropdown");

    mainBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isPaused) {
        triggerResume();
      } else {
        triggerPause(DEFAULT_PAUSE_MS, "10 minutes");
      }
    });

    splitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdown.classList.toggle("show");
    });

    // Dropdown Items
    dropdown.querySelectorAll(".agh-dropdown-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropdown.classList.remove("show");

        const action = item.getAttribute("data-action");
        const label = item.getAttribute("data-label");

        if (action === "tomorrow") {
          const ms = getMsUntilTomorrow();
          triggerPause(ms, "until tomorrow");
        } else {
          const ms = parseInt(item.getAttribute("data-ms"), 10);
          triggerPause(ms, label);
        }
      });
    });

    // Close dropdown on outside click (registered once globally)
    if (!documentClickAttached) {
      document.addEventListener("click", (e) => {
        const curContainer = document.getElementById("agh-pill-container");
        const curDropdown = document.getElementById("agh-dropdown");
        if (curDropdown && (!curContainer || !curContainer.contains(e.target))) {
          curDropdown.classList.remove("show");
        }
      });
      documentClickAttached = true;
    }

    // Card successfully injected: disconnect observer to save CPU
    observer.disconnect();

    // Initial status check
    checkStatus();
  }

  // Observe DOM changes to inject button once card renders
  const observer = new MutationObserver(() => {
    if (!document.getElementById("agh-pill-container")) {
      injectControls();
    }
  });

  // Visibility change: pause polling when backgrounded, resume when foregrounded
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(pollInterval);
      pollInterval = null;
    } else {
      checkStatus();
      startPolling();
    }
  });

  function init() {
    injectControls();
    if (!document.getElementById("agh-pill-container")) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
