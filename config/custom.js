/**
 * AdGuard Home Header Action Pill for Homepage (Design A)
 * https://github.com/sunshine144/Adguard-Home-Toggle
 *
 * Seamless top-right badge integration with 1-click default (10m) + duration dropdown,
 * real-time ticking timer countdown, and status synchronization.
 */

(function () {
  "use strict";

  const DEFAULT_PAUSE_MS = 600000; // 10 minutes default
  let pollInterval = null;
  let countdownTimer = null;
  let remainingMs = 0;
  let isPaused = false;

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
      const searchParams = new URLSearchParams({ action, ...params });
      const url = `/api/config/adguard?${searchParams.toString()}`;
      const res = await fetch(url, { method: "GET" });
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

  function updateState(protectionEnabled, durationMs = 0) {
    isPaused = !protectionEnabled;
    remainingMs = durationMs;

    const pill = document.getElementById("agh-pill");
    const mainBtn = document.getElementById("agh-main-btn");
    const splitBtn = document.getElementById("agh-split-btn");
    const dropdown = document.getElementById("agh-dropdown");

    if (!pill || !mainBtn) return;

    if (dropdown) dropdown.classList.remove("show");
    clearInterval(countdownTimer);

    if (isPaused) {
      pill.classList.add("agh-paused");
      mainBtn.innerHTML = `<span class="agh-icon">▶</span> ${remainingMs > 0 ? formatTime(remainingMs) : "RESUME"}`;
      mainBtn.title = "Protection paused - Click to resume immediately";
      if (splitBtn) splitBtn.style.display = "none";

      if (remainingMs > 0) {
        countdownTimer = setInterval(() => {
          remainingMs -= 1000;
          if (remainingMs <= 0) {
            clearInterval(countdownTimer);
            checkStatus();
          } else {
            mainBtn.innerHTML = `<span class="agh-icon">▶</span> ${formatTime(remainingMs)}`;
          }
        }, 1000);
      }
    } else {
      pill.classList.remove("agh-paused");
      mainBtn.innerHTML = `<span class="agh-icon">⏸</span> 10m`;
      mainBtn.title = "Click to pause AdGuard for 10 minutes";
      if (splitBtn) splitBtn.style.display = "inline-flex";
    }
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

    // 3. Link href match
    const links = document.querySelectorAll('a[href*="adguard"], a[href*=":80"], a[href*=":3000"]');
    for (const a of links) {
      if (a.textContent.toLowerCase().includes("adguard")) {
        const card = a.closest(".service-card");
        if (card) return card;
      }
    }

    // 4. Text content match
    const elements = document.querySelectorAll(".service-name, h1, h2, h3, h4, span, div, p");
    for (const el of elements) {
      if (el.textContent.trim().toLowerCase() === "adguard home") {
        const card = el.closest(".service-card");
        if (card) return card;
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

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        dropdown.classList.remove("show");
      }
    });

    // Initial status check
    checkStatus();

    // Poll status every 7 seconds
    if (!pollInterval) {
      pollInterval = setInterval(checkStatus, 7000);
    }
  }

  // Observe DOM changes to inject button once card renders
  const observer = new MutationObserver(() => {
    if (!document.getElementById("agh-pill-container")) {
      injectControls();
    }
  });

  function init() {
    injectControls();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
