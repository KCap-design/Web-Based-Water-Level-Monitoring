// =========================================
//  AquaWatch — Firebase Realtime App Logic
// =========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDlYfVAzcKLRk9NTVmKQk91gIy3_WoeqAI",
  authDomain: "water-level-monitoring-b35e5.firebaseapp.com",
  projectId: "water-level-monitoring-b35e5",
  storageBucket: "water-level-monitoring-b35e5.firebasestorage.app",
  messagingSenderId: "903076815632",
  appId: "1:903076815632:web:c50c49eec6d4991bb9fb95",
  measurementId: "G-VNHZHBRV3P",
  databaseURL: "https://water-level-monitoring-b35e5-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// --- Init ---
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// --- DOM References ---
const loaderWrapper     = document.getElementById("loaderWrapper");
const liveBadge         = document.getElementById("liveBadge");
const lastUpdatedEl     = document.getElementById("lastUpdated");
const waterFill         = document.getElementById("waterFill");
const levelLabel        = document.getElementById("levelLabel");
const levelDesc         = document.getElementById("levelDesc");
const pillLow           = document.getElementById("pillLow");
const pillMedium        = document.getElementById("pillMedium");
const pillHigh          = document.getElementById("pillHigh");
const distanceValue     = document.getElementById("distanceValue");
const arcProgress       = document.getElementById("arcProgress");
const distanceRangeLabel= document.getElementById("distanceRangeLabel");
const statMin           = document.getElementById("statMin");
const statMax           = document.getElementById("statMax");
const statAvg           = document.getElementById("statAvg");
const logList           = document.getElementById("logList");
const clearLogBtn       = document.getElementById("clearLogBtn");

// --- Session Stats ---
let minDist = Infinity, maxDist = -Infinity;
let distSum = 0, distCount = 0;
let lastLevel = null;
let logEntries = [];

// --- Arc Constants ---
// The arc path is a 180-degree semicircle. Full length ≈ π * r = π * 80 ≈ 251.2
const ARC_LENGTH  = 251.2;
const DIST_MAX_CM = 400; // sensor max range

// =========================================
//  Utility helpers
// =========================================

function formatTime(d = new Date()) {
  return d.toLocaleTimeString("en-PH", { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function levelConfig(level) {
  switch (level.toUpperCase()) {
    case "LOW":    return { cssClass: "level-low",    fillPct: 20, label: "LOW",    desc: "Water level is low", color: "#10d078" };
    case "HIGH":   return { cssClass: "level-high",   fillPct: 90, label: "HIGH",   desc: "⚠ Water level is high!", color: "#f43f5e" };
    default:       return { cssClass: "level-medium", fillPct: 52, label: "MED",    desc: "Water level is normal", color: "#00d4ff" };
  }
}

function getRangeLabel(dist) {
  if (dist === null || isNaN(dist)) return "—";
  if (dist < 30)  return "Very Close  (< 30 cm)";
  if (dist < 100) return "Near  (30 – 100 cm)";
  if (dist < 200) return "Moderate  (100 – 200 cm)";
  return "Far  (> 200 cm)";
}

function setConnected(ok) {
  liveBadge.className = ok ? "live-badge" : "live-badge disconnected";
  liveBadge.querySelector("span:last-child").textContent = ok ? "LIVE" : "OFFLINE";
}

// =========================================
//  Update Water Level UI
// =========================================

function updateWaterLevel(rawLevel) {
  const levelStr = (rawLevel || "MEDIUM").toString().trim();
  const cfg = levelConfig(levelStr);

  // Tank fill
  waterFill.style.height = `${cfg.fillPct}%`;
  waterFill.className = `water-fill ${cfg.cssClass}`;

  // Label
  levelLabel.textContent = cfg.label;
  levelLabel.style.backgroundImage = `linear-gradient(90deg, ${cfg.color}, ${cfg.color}cc)`;

  // Description
  levelDesc.textContent = cfg.desc;

  // Pills
  [pillLow, pillMedium, pillHigh].forEach(p => p.classList.remove("active"));
  const map = { LOW: pillLow, MEDIUM: pillMedium, HIGH: pillHigh };
  if (map[levelStr.toUpperCase()]) map[levelStr.toUpperCase()].classList.add("active");

  // Log entry only if changed
  if (levelStr.toUpperCase() !== lastLevel) {
    lastLevel = levelStr.toUpperCase();
    addLogEntry(levelStr.toUpperCase(), null);
  }
}

// =========================================
//  Update Ultrasonic UI
// =========================================

function updateUltrasonic(dist) {
  const d = parseFloat(dist);
  if (isNaN(d)) { distanceValue.textContent = "—"; return; }

  // Big number
  distanceValue.textContent = d.toFixed(1);

  // Arc gauge
  const pct = Math.min(d / DIST_MAX_CM, 1);
  const offset = ARC_LENGTH - pct * ARC_LENGTH;
  arcProgress.style.strokeDashoffset = offset.toFixed(2);

  // Range label
  distanceRangeLabel.textContent = getRangeLabel(d);

  // Session stats
  if (d < minDist) minDist = d;
  if (d > maxDist) maxDist = d;
  distSum += d; distCount++;

  statMin.textContent = minDist === Infinity ? "—" : `${minDist.toFixed(1)} cm`;
  statMax.textContent = maxDist === -Infinity ? "—" : `${maxDist.toFixed(1)} cm`;
  statAvg.textContent = distCount === 0 ? "—" : `${(distSum / distCount).toFixed(1)} cm`;
}

// =========================================
//  Activity Log
// =========================================

function addLogEntry(level, dist) {
  const now   = new Date();
  const time  = formatTime(now);
  const lvlLC = level.toLowerCase();

  // Build message
  const distPart = dist !== null ? ` | Distance: ${parseFloat(dist).toFixed(1)} cm` : "";
  const msg      = `Water level: ${level}${distPart}`;

  const entry = document.createElement("div");
  entry.className = `log-entry log-${lvlLC}`;
  entry.innerHTML = `
    <div class="log-dot"></div>
    <span class="log-time">${time}</span>
    <span class="log-text">${msg}</span>
    <span class="log-badge">${level}</span>
  `;

  // Remove empty placeholder
  const emptyEl = logList.querySelector(".log-empty");
  if (emptyEl) emptyEl.remove();

  logList.prepend(entry);         // newest on top
  logEntries.unshift(entry);

  // Keep max 50 entries
  if (logEntries.length > 50) {
    const old = logEntries.pop();
    old.remove();
  }
}

// =========================================
//  Firebase Listeners
// =========================================

let connected = false;

// Connection state
const connRef = ref(db, ".info/connected");
onValue(connRef, snap => {
  connected = snap.val() === true;
  setConnected(connected);
  if (!connected) lastUpdatedEl.textContent = "Reconnecting…";
});

// Water level
const levelRef = ref(db, "/Water_level");
onValue(levelRef, snap => {
  const val = snap.val();
  if (val === null) return;
  updateWaterLevel(val);
  lastUpdatedEl.textContent = "Updated " + formatTime();
  setConnected(true);
}, err => {
  console.error("Level error:", err);
  setConnected(false);
});

// Ultrasonic distance
const ultraRef = ref(db, "/Ultrasonic");
onValue(ultraRef, snap => {
  const val = snap.val();
  if (val === null) return;
  updateUltrasonic(val);
  lastUpdatedEl.textContent = "Updated " + formatTime();
}, err => {
  console.error("Ultrasonic error:", err);
});

// =========================================
//  Clear Log Button
// =========================================

clearLogBtn.addEventListener("click", () => {
  logList.innerHTML = '<div class="log-empty">Log cleared. Waiting for sensor data…</div>';
  logEntries = [];
  lastLevel  = null;
  minDist    = Infinity; maxDist = -Infinity;
  distSum    = 0; distCount = 0;
  statMin.textContent = "—"; statMax.textContent = "—"; statAvg.textContent = "—";
});

// =========================================
//  Page Lifecycle
// =========================================

window.addEventListener("load", () => {
  // Add a 3-second delay as requested
  setTimeout(() => {
    loaderWrapper.classList.add("hidden");
  }, 3000);
});
