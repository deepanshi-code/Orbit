const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const TICK_MS = 250;            // poll often; accuracy comes from timestamps, not tick count
const SAVE_EVERY_MS = 5000;
const WARN_MS = 10 * 60 * 1000; // heads-up before a deadline
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clockStr = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;

/* only touch the DOM when the value actually changed */
function setText(el, text) {
  text = String(text);
  if (el.textContent !== text) el.textContent = text;
}

/* ---------- safe storage ---------- */
function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
  catch (e) { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}

/* =====================================================
   NUMERAL DISPLAY
   Each digit sits in its own fixed-width cell, so nothing shifts as the
   time changes. Only the cells whose digit changed are touched (usually
   one per second), and they ease in with a short vertical roll.
   ===================================================== */
function setFlap(el, text) {
  const key = text.replace(/\d/g, "0");
  if (el.dataset.k !== key) {                      // structure changed (e.g. 59:59 -> 1:00:00): rebuild
    el.dataset.k = key;
    el.dataset.len = text.length > 8 ? "xl" : text.length > 5 ? "l" : "m";
    el.innerHTML = [...text].map(ch =>
      /\d/.test(ch) ? '<span class="fl"><i>0</i></span>' : `<span class="sep">${ch === " " ? "&nbsp;" : ch}</span>`).join("");
  }
  const cells = el.querySelectorAll(".fl");
  let n = 0;
  for (const ch of text) {
    if (!/\d/.test(ch)) continue;
    const cell = cells[n++], face = cell.firstChild;
    if (face.textContent !== ch) {
      face.textContent = ch;
      if (!REDUCED && face.animate) {
        face.animate([{ transform: "translateY(0.16em)", opacity: 0.15 }, { transform: "none", opacity: 1 }],
                     { duration: 260, easing: "cubic-bezier(.2,.7,.2,1)" });
      }
    }
  }
  el.setAttribute("aria-label", text);
}

/* ---------- pie dial ---------- */
let lastPie = "";
function setPie(p) {
  const v = Math.min(1, Math.max(0, p)).toFixed(4);
  if (v !== lastPie) { lastPie = v; $("pie").style.setProperty("--p", v); }
}

/* =====================================================
   THEMES: restrained palettes, one accent each.
   accent = timer / tasks, accent2 = stopwatch.
   on / on2 = text colour placed on top of accent / accent2.
   ===================================================== */
const THEMES = {
  obsidian:  { name: "Obsidian",  light: false, bg: "#0c0d0f", surface: "#131518", surface2: "#1a1d21", text: "#ececea", muted: "#8c9199", line: "#262a2f", accent: "#d9b36c", accent2: "#8fb8de", on: "#17130a", on2: "#0a1522", ok: "#7fc29b", warn: "#e0b25a", bad: "#e57f78" },
  ivory:     { name: "Ivory",     light: true,  bg: "#f3f1ea", surface: "#fbfaf6", surface2: "#efece3", text: "#1b1b19", muted: "#6b6a64", line: "#dcd8cc", accent: "#1f3a5f", accent2: "#8a5d22", on: "#ffffff", on2: "#ffffff", ok: "#2b7550", warn: "#946008", bad: "#b3352c" },
  midnight:  { name: "Midnight",  light: false, bg: "#090e18", surface: "#0f1626", surface2: "#162038", text: "#e8edf7", muted: "#8795ad", line: "#1f2b44", accent: "#7ba3ff", accent2: "#5fd1b0", on: "#07122b", on2: "#04231b", ok: "#5fd1b0", warn: "#e5b565", bad: "#f0867f" },
  forest:    { name: "Forest",    light: false, bg: "#0a0f0c", surface: "#101712", surface2: "#17211a", text: "#e9efe9", muted: "#86958a", line: "#223027", accent: "#8fc79a", accent2: "#d6b36a", on: "#06170b", on2: "#1d1505", ok: "#8fc79a", warn: "#d6b36a", bad: "#e2827a" },
  porcelain: { name: "Porcelain", light: true,  bg: "#edf0f4", surface: "#ffffff", surface2: "#f3f5f8", text: "#111827", muted: "#5b6475", line: "#dbe0e8", accent: "#2f55d4", accent2: "#0f766e", on: "#ffffff", on2: "#ffffff", ok: "#17794a", warn: "#96620a", bad: "#be2d2d" },
  rosewood:  { name: "Rosewood",  light: false, bg: "#120c0c", surface: "#1a1212", surface2: "#231919", text: "#f0e8e6", muted: "#a29290", line: "#2f2222", accent: "#e39a8a", accent2: "#cdb38a", on: "#2a0e09", on2: "#211705", ok: "#86c49a", warn: "#d9b062", bad: "#ee8a80" }
};
const DEFAULT_THEME = "obsidian";

function applyTheme(id, save = true) {
  if (!THEMES[id]) id = DEFAULT_THEME;
  const t = THEMES[id], s = document.documentElement.style;
  s.setProperty("--bg", t.bg);            s.setProperty("--surface", t.surface);
  s.setProperty("--surface-2", t.surface2); s.setProperty("--text", t.text);
  s.setProperty("--muted", t.muted);      s.setProperty("--line", t.line);
  s.setProperty("--t-accent", t.accent);  s.setProperty("--t-accent2", t.accent2);
  s.setProperty("--t-on", t.on);          s.setProperty("--t-on2", t.on2);
  s.setProperty("--ok", t.ok);            s.setProperty("--warn", t.warn);   s.setProperty("--bad", t.bad);
  document.body.classList.toggle("light", t.light);
  document.body.dataset.theme = id;
  document.querySelectorAll(".swatch").forEach(b => b.setAttribute("aria-checked", b.dataset.id === id));
  if (save) { try { localStorage.setItem("studyclock:theme", id); } catch (e) {} }
}

(function buildThemePicker() {
  const pop = $("themePop");
  pop.innerHTML = Object.entries(THEMES).map(([id, t]) =>
    `<button class="swatch" role="menuitemradio" aria-checked="false" data-id="${id}"
       style="--sw-bg:${t.bg};--sw-surface:${t.surface};--sw-text:${t.text};--sw-line:${t.line};--sw-accent:${t.accent}">
       <span class="dot"><i></i><i></i></span><span>${t.name}</span></button>`).join("");
  pop.addEventListener("click", e => {
    const b = e.target.closest(".swatch");
    if (b) applyTheme(b.dataset.id);
  });
  const btn = $("themeBtn");
  const close = () => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", e => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    btn.setAttribute("aria-expanded", String(!pop.hidden));
  });
  document.addEventListener("click", e => { if (!pop.hidden && !pop.contains(e.target)) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { close(); btn.focus(); } });
})();

(function restoreTheme() {
  let id = DEFAULT_THEME;
  try { id = localStorage.getItem("studyclock:theme") || DEFAULT_THEME; } catch (e) {}
  applyTheme(id, false);          // unknown ids (older themes) fall back to the default
})();

/* ---------- mode + view ---------- */
let mode = "timer";
const timer = { totalMs: 0, remainingMs: 0, endTs: 0, running: false, id: null };
const sw = { elapsedMs: 0, startTs: 0, running: false, id: null };

function setState(s) { document.body.dataset.state = s; }
function isRunning() { return mode === "timer" ? timer.running : sw.running; }

function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  $("tabTimer").setAttribute("aria-selected", m === "timer");
  $("tabSw").setAttribute("aria-selected", m === "stopwatch");
  $("timerExtras").inert = m !== "timer";
  $("status").textContent = "";
  syncUI();
}
$("tabTimer").addEventListener("click", () => setMode("timer"));
$("tabSw").addEventListener("click", () => setMode("stopwatch"));

function setView(v) {                 // only matters on narrow screens
  document.body.dataset.view = v;
  $("navFocus").setAttribute("aria-current", v === "focus");
  $("navTasks").setAttribute("aria-current", v === "tasks");
}
$("navFocus").addEventListener("click", () => setView("focus"));
$("navTasks").addEventListener("click", () => setView("tasks"));

/* ---------- wall clock ---------- */
function updateRealTime() {
  const d = new Date();
  setText($("currentTime"), clockStr(d));
  setText($("dateChip"), d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }));
}
setInterval(updateRealTime, 1000);
updateRealTime();

/* ---------- formatting ---------- */
function fmt(totalSec) {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function fmtDur(ms) {
  if (ms <= 0) return "0m";
  const m = Math.round(ms / 60000);
  if (m < 1) return "<1m";
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function fmtLeft(ms) {
  const m = Math.floor(Math.abs(ms) / 60000);
  if (m < 1) return "<1m";
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}

function toLocalInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------- rendering ---------- */
function render() {
  let text, p;
  if (mode === "timer") {
    text = fmt(Math.ceil(timer.remainingMs / 1000));
    p = timer.totalMs > 0 ? timer.remainingMs / timer.totalMs : 0;
  } else {
    const ms = swCurrent();
    text = fmt(Math.floor(ms / 1000));
    p = (ms % 60000) / 60000;       // one sweep per minute
  }
  setFlap($("digits"), text);
  setPie(p);
  document.title = isRunning() ? `${text} · Orbit` : "Orbit";
}

function syncUI() {
  const running = isRunning();
  const paused = !running && (mode === "timer"
    ? timer.remainingMs > 0 && timer.remainingMs < timer.totalMs
    : sw.elapsedMs > 0);
  const label = running ? "Pause" : paused ? "Resume" : "Start";
  $("mainBtn").innerHTML = ic(running ? "pause" : "play") + `<span>${label}</span><kbd>Space</kbd>`;
  $("sub").textContent = mode === "timer"
    ? (timer.running ? `Ends at ${clockStr(new Date(timer.endTs))}` : "Ends at --:--:--")
    : "Hand sweeps once per minute";
  const lock = timer.running;
  document.querySelectorAll(".chip[data-min], #setBtn, .inputs input").forEach(el => { el.disabled = lock; });
  document.querySelectorAll(".chip[data-min]").forEach(c =>
    c.classList.toggle("active", Number(c.dataset.min) * 60000 === timer.totalMs));
  if (document.body.dataset.state !== "done" || running) {
    setState(running ? "running" : paused ? "paused" : "idle");
  }
  render();
}

/* =====================================================
   DAILY STATS
   "Minutes focused" = real running time of the timer AND stopwatch
   (accumulated in flush()), so paused/reset/stopwatch work counts.
   "Sessions" = countdown timers that ran all the way to zero.
   ===================================================== */
let statsCache = { key: null, data: { n: 0, min: 0 } };

function todayKey() {
  const d = new Date();
  return `studyclock:stats:${user ? user.key : "guest"}:${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function getStats() {
  const k = todayKey();
  if (statsCache.key !== k) {      // new day, or profile changed
    const s = readJSON(k, null);
    statsCache = { key: k, data: s && typeof s.n === "number" ? s : { n: 0, min: 0 } };
  }
  return statsCache.data;
}
function saveStats() { getStats(); writeJSON(statsCache.key, statsCache.data); }
function showStats() {
  const s = getStats();
  setText($("sessions"), s.n);
  setText($("focusMin"), Math.floor(s.min));
}

/* =====================================================
   TIME ACCOUNTING
   Time is attributed in slices: each running source (timer / stopwatch)
   remembers when it was last flushed. The slice since then always counts
   toward today's focus minutes, and also goes to whichever task is active
   *at flush time*. Changing the active task flushes first, so time never
   lands on the wrong task.
   ===================================================== */
let user = null;          // { name, key }
let tasks = [];
let activeId = null;
let lastSave = 0;
let justAddedId = null;
let animateAll = false;
let editingId = null;
const lastFlush = { timer: 0, sw: 0 };

function activeTask() { return tasks.find(t => t.id === activeId) || null; }

function flush(src, now = Date.now(), force = false) {
  const prev = lastFlush[src];
  if (!prev) return;
  const delta = now - prev;
  lastFlush[src] = now;
  if (delta > 0) {
    getStats().min += delta / 60000;
    const t = user && activeTask();
    if (t) t.ms += delta;
  }
  // a forced flush must persist even when the delta is 0 (a tick may have just added it)
  if (force || now - lastSave >= SAVE_EVERY_MS) {
    saveTasks();
    saveStats();
    lastSave = now;
    showStats();
    updateTaskTimes();
  }
}

function flushAll() {
  const now = Date.now();
  if (timer.running) flush("timer", Math.min(now, timer.endTs), true);
  if (sw.running) flush("sw", now, true);
}

function setActive(id) {
  flushAll();                         // close the slice for the previous task
  activeId = id;
  if (timer.running) lastFlush.timer = Date.now();
  if (sw.running) lastFlush.sw = Date.now();
  updateFocusRow();
  renderTasks();
}

function updateFocusRow() {
  const t = user && activeTask();
  $("focusRow").hidden = !t;
  if (t) $("focusName").textContent = t.text;
}
$("focusClear").addEventListener("click", () => setActive(null));

/* ---------- timer (timestamp-based: immune to tab throttling) ---------- */
function setDuration(totalSec) {
  if (timer.running) return;
  timer.totalMs = timer.remainingMs = totalSec * 1000;
  $("status").textContent = "";
  setState("idle");
  syncUI();
}

function readField(id) {
  const v = Math.floor(Number($(id).value));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

$("setBtn").addEventListener("click", () => {
  const total = readField("daysInput") * 86400 + readField("hoursInput") * 3600 +
                readField("minutesInput") * 60 + readField("secondsInput");
  if (total <= 0) { $("status").textContent = "Enter a time greater than zero."; return; }
  setDuration(total);
});

document.querySelectorAll(".chip[data-min]").forEach(c =>
  c.addEventListener("click", () => setDuration(Number(c.dataset.min) * 60)));

function tickTimer() {
  timer.remainingMs = Math.max(0, timer.endTs - Date.now());
  flush("timer", Math.min(Date.now(), timer.endTs));
  render();
  if (timer.remainingMs <= 0) finishTimer();
}

function startTimer() {
  if (timer.running) return;
  if (timer.remainingMs <= 0) {
    $("status").textContent = "Pick a preset or set a custom time first.";
    return;
  }
  if (sw.running) pauseStopwatch();   // one clock at a time, so task time isn't double-counted
  requestNotifyPermission();          // on a user gesture
  timer.running = true;
  timer.endTs = Date.now() + timer.remainingMs;
  lastFlush.timer = Date.now();
  $("status").textContent = "";
  timer.id = setInterval(tickTimer, TICK_MS);
  syncUI();
}

function pauseTimer() {
  flush("timer", Math.min(Date.now(), timer.endTs), true);
  lastFlush.timer = 0;
  clearInterval(timer.id);
  timer.remainingMs = Math.max(0, timer.endTs - Date.now());
  timer.running = false;
  syncUI();
}

function resetTimer() {
  if (timer.running) { flush("timer", Math.min(Date.now(), timer.endTs), true); }
  lastFlush.timer = 0;
  clearInterval(timer.id);
  timer.running = false;
  timer.remainingMs = timer.totalMs; // back to the chosen duration
  $("status").textContent = "";
  setState("idle");
  syncUI();
}

function finishTimer() {
  flush("timer", timer.endTs, true);
  lastFlush.timer = 0;
  clearInterval(timer.id);
  timer.running = false;
  timer.remainingMs = 0;
  getStats().n += 1;                  // a completed session (minutes were already counted by flush)
  saveStats();
  showStats();
  syncUI();
  setState("done");
  $("sub").textContent = "Session complete";
  const t = user && activeTask();
  $("status").textContent = t ? `Logged to “${t.text}”` : "Session complete";
  ringPie();
  beep();
  desktopNotify("Time's up", t ? `Session complete. Logged to “${t.text}”.` : "Session complete.", "timer-done");
}

/* one gentle pulse of the dial when a session ends */
function ringPie() {
  if (REDUCED) return;
  const dial = $("dial");
  dial.classList.remove("pulse");
  void dial.offsetWidth;              // restart the animation
  dial.classList.add("pulse");
}

/* ---------- stopwatch (timestamp-based) ---------- */
function swCurrent() { return sw.elapsedMs + (sw.running ? Date.now() - sw.startTs : 0); }

function swTick() { flush("sw"); render(); }

function startStopwatch() {
  if (sw.running) return;
  if (timer.running) pauseTimer();
  sw.running = true;
  sw.startTs = Date.now();
  lastFlush.sw = sw.startTs;
  sw.id = setInterval(swTick, TICK_MS);
  syncUI();
}
function pauseStopwatch() {
  flush("sw", Date.now(), true);
  lastFlush.sw = 0;
  sw.elapsedMs = swCurrent();
  sw.running = false;
  clearInterval(sw.id);
  syncUI();
}
function resetStopwatch() {
  if (sw.running) flush("sw", Date.now(), true);
  lastFlush.sw = 0;
  clearInterval(sw.id);
  sw.running = false;
  sw.elapsedMs = 0;
  syncUI();
}

/* ---------- shared controls ---------- */
$("mainBtn").addEventListener("click", () => {
  if (mode === "timer") (timer.running ? pauseTimer : startTimer)();
  else (sw.running ? pauseStopwatch : startStopwatch)();
});
$("resetBtn").addEventListener("click", () => (mode === "timer" ? resetTimer : resetStopwatch)());

/* ---------- feedback: generated beep ---------- */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach(o => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + o);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + o + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + o);
      osc.stop(ctx.currentTime + o + 0.25);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch (e) {}
}

/* =====================================================
   ALERTS: in-app toast + desktop notification
   Desktop notifications only fire while this page is open (a tab can be
   in the background). A static site has no server to push them otherwise.
   ===================================================== */
function toast(title, body, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = ic(kind === "bad" ? "alert" : "bell") + "<div><b></b><p></p></div>";
  el.querySelector("b").textContent = title;
  el.querySelector("p").textContent = body || "";
  const dismiss = () => { el.classList.add("out"); setTimeout(() => el.remove(), 220); };
  el.addEventListener("click", dismiss);
  $("toasts").appendChild(el);
  setTimeout(dismiss, 10000);
}

function desktopNotify(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => { window.focus(); setView("tasks"); n.close(); };
  } catch (e) {}
}

function alertUser(title, body, kind, tag) {
  toast(title, body, kind);
  desktopNotify(title, body, tag);
}

function requestNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Promise.resolve(Notification.requestPermission()).then(updateNotifyBar);
  }
}

function updateNotifyBar() {
  const bar = $("notifyBar");
  if (!("Notification" in window)) {
    bar.className = "notify-bar off"; bar.textContent = "Desktop alerts aren't supported in this browser. In-app alerts still work."; return;
  }
  const p = Notification.permission;
  if (p === "granted") {
    bar.className = "notify-bar on";
    bar.innerHTML = ic("bell") + "<span>Desktop alerts on. They fire while this page stays open.</span>";
  } else if (p === "denied") {
    bar.className = "notify-bar off";
    bar.innerHTML = ic("alert") + "<span>Desktop alerts are blocked. Allow notifications for this site in your browser settings.</span>";
  } else {
    bar.className = "notify-bar ask";
    bar.innerHTML = ic("bell") + "<span>Get a desktop alert when a deadline passes</span><button type='button' id='enableAlerts' class='btn small'>Enable</button>";
    $("enableAlerts").addEventListener("click", requestNotifyPermission);
  }
}

/* ---------- deadline checker ---------- */
function pctOf(t) {
  if (t.done) return 100;
  return t.est ? Math.min(100, Math.round(t.ms / (t.est * 60000) * 100)) : 0;
}

function checkDeadlines() {
  if (!user) return;
  const now = Date.now();
  const late = [], soon = [];
  for (const t of tasks) {
    if (t.done || !t.due) continue;
    if (now >= t.due) {
      if (!t.notified) { t.notified = true; t.warned = true; late.push(t); }
    } else if (!t.warned && t.due - now <= WARN_MS) {
      t.warned = true; soon.push(t);
    }
  }
  if (late.length || soon.length) saveTasks();

  soon.forEach(t => alertUser(`Due in ${fmtLeft(t.due - now)}`,
    `${t.text} · ${pctOf(t)}% done`, "info", "soon-" + t.id));

  if (late.length === 1) {
    const t = late[0], at = new Date(t.due);
    alertUser("Deadline passed", `“${t.text}” was due at ${pad(at.getHours())}:${pad(at.getMinutes())}. Progress: ${pctOf(t)}%`, "bad", "late-" + t.id);
  } else if (late.length > 1) {
    alertUser(`${late.length} tasks passed their deadline`, late.map(t => t.text).join(", "), "bad", "late-many");
  }
  if (late.length) beep();
  updateTaskTimes();
}
setInterval(checkDeadlines, 15000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDeadlines(); });

/* =====================================================
   LOCAL PROFILES (sign in / create)
   Honest scope: this is a per-browser profile system, not server auth.
   Passwords are never stored: only a PBKDF2-SHA256 hash with a random salt.
   ===================================================== */
const USERS_KEY = "studyclock:users";
const SESSION_KEY = "studyclock:session";
let creating = false;

const enc = new TextEncoder();
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function hashPassword(password, saltBytes) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 150000, hash: "SHA-256" }, key, 256);
  return toB64(bits);
}

function setAuthMode(create) {
  creating = create;
  $("authTitle").textContent = create ? "Create your profile" : "Sign in to manage tasks";
  $("authSubmit").textContent = create ? "Create profile" : "Sign in";
  $("authSwitch").textContent = create ? "Already have a profile? Sign in" : "New here? Create a profile";
  $("authPass").autocomplete = create ? "new-password" : "current-password";
  $("authError").textContent = "";
}
$("authSwitch").addEventListener("click", () => setAuthMode(!creating));

$("authView").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("authUser").value.trim();
  const pass = $("authPass").value;
  const err = $("authError");
  err.textContent = "";

  if (!window.crypto || !crypto.subtle) { err.textContent = "This browser can't do secure hashing here (needs https or localhost)."; return; }
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(name)) { err.textContent = "Username: 3-20 letters, numbers, . _ -"; return; }
  if (pass.length < 6) { err.textContent = "Password must be at least 6 characters."; return; }

  const key = name.toLowerCase();
  const users = readJSON(USERS_KEY, {});
  $("authSubmit").disabled = true;
  $("authSubmit").textContent = creating ? "Creating…" : "Signing in…";   // hashing takes a moment: show it
  await new Promise(r => setTimeout(r, 30));                              // let the browser paint that first (rAF stalls in hidden tabs)
  try {
    if (creating) {
      if (users[key]) { err.textContent = "That username is taken on this device."; return; }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      users[key] = { name, salt: toB64(salt), hash: await hashPassword(pass, salt) };
      if (!writeJSON(USERS_KEY, users)) { err.textContent = "Couldn't save: browser storage is unavailable."; return; }
    } else {
      const rec = users[key];
      const ok = rec && (await hashPassword(pass, fromB64(rec.salt))) === rec.hash;
      if (!ok) { err.textContent = "Wrong username or password."; return; }
    }
    signIn(users[key].name, key, $("authRemember").checked);
  } finally {
    $("authSubmit").disabled = false;
    $("authSubmit").textContent = creating ? "Create profile" : "Sign in";
  }
});

function signIn(name, key, remember) {
  user = { name, key };
  try {
    sessionStorage.setItem(SESSION_KEY, key);
    if (remember) localStorage.setItem(SESSION_KEY, key); else localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
  tasks = readJSON(`studyclock:tasks:${key}`, []);
  activeId = null;
  animateAll = true;
  resetAuthForm();
  endEdit();
  showStats();
  showTasksPanel();
  updateFocusRow();
  checkDeadlines();
}

function resetAuthForm() {
  $("authUser").value = "";
  $("authPass").value = "";
  $("authRemember").checked = false;
  setAuthMode(false);               // always come back to "Sign in"
}

$("signOut").addEventListener("click", () => {
  flushAll();
  saveTasks();
  saveStats();
  user = null; tasks = []; activeId = null;
  try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) {}
  resetAuthForm();
  endEdit();
  showStats();
  showTasksPanel();
  updateFocusRow();
});

function restoreSession() {
  let key = null;
  try { key = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY); } catch (e) {}
  const rec = key && readJSON(USERS_KEY, {})[key];
  if (rec) {
    user = { name: rec.name, key };
    tasks = readJSON(`studyclock:tasks:${key}`, []);
  }
}

function showTasksPanel() {
  $("authView").hidden = !!user;
  $("taskView").hidden = !user;
  $("userBar").hidden = !user;
  $("newTaskBtn").hidden = !user;
  const initial = user ? user.name.charAt(0).toUpperCase() : "?";
  $("avatar").textContent = initial;
  $("headAvatar").textContent = initial;
  $("headName").textContent = user ? user.name : "Guest";
  $("headUser").classList.toggle("signed", !!user);
  if (user) {
    $("userName").textContent = user.name;
    updateNotifyBar();
    renderTasks();
  } else {
    $("taskSummary").textContent = "Sign in to track your work";
    $("stOpen").textContent = "—";
    $("stTracked").textContent = "—";
    updateHero();
  }
}

/* =====================================================
   TASK DIALOG: name, deadline, estimate, priority
   ===================================================== */
function saveTasks() { if (user) writeJSON(`studyclock:tasks:${user.key}`, tasks); }

const prioValue = () => document.querySelector("input[name=prio]:checked").value;
function setPrio(v) { document.querySelector(`input[name=prio][value=${v}]`).checked = true; }

const dlg = $("taskDialog");
function openTaskDialog() { if (!dlg.open) dlg.showModal(); }
function closeTaskDialog() { if (dlg.open) dlg.close(); }
$("newTaskBtn").addEventListener("click", () => { endEdit(); openTaskDialog(); });
$("dlgClose").addEventListener("click", closeTaskDialog);
dlg.addEventListener("click", e => { if (e.target === dlg) closeTaskDialog(); });   // click on the backdrop
dlg.addEventListener("close", () => { if (editingId) { endEdit(); renderTasks(); } });

/* quick deadline / study-time chips */
document.querySelectorAll(".tf-quick .chip").forEach(c => c.addEventListener("click", () => {
  if (c.dataset.est) {
    $("taskEst").value = c.dataset.est;
    $("taskEst").classList.remove("invalid");
    return;
  }
  let ms;
  if (c.dataset.add === "tomorrow") {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); ms = d.getTime();
  } else ms = Date.now() + Number(c.dataset.add) * 60000;
  $("taskDue").value = toLocalInput(ms);
  $("taskDue").classList.remove("invalid");
}));

/* clear a field's red outline as soon as the user fixes it */
["taskInput", "taskDue", "taskEst"].forEach(id =>
  $(id).addEventListener("input", () => { $(id).classList.remove("invalid"); $("taskFormError").textContent = ""; }));

function resetTaskForm() {
  $("taskInput").value = "";
  $("taskDue").value = "";
  $("taskEst").value = "";
  setPrio("med");
  $("taskFormError").textContent = "";
  ["taskInput", "taskDue", "taskEst"].forEach(id => $(id).classList.remove("invalid"));
}

function endEdit() {
  editingId = null;
  resetTaskForm();
  $("taskSubmit").innerHTML = ic("plus") + "<span>Add task</span>";
  $("ntLabel").textContent = "New task";
}
$("taskCancel").addEventListener("click", closeTaskDialog);

function startEdit(t) {
  editingId = t.id;
  $("taskInput").value = t.text;
  $("taskDue").value = t.due ? toLocalInput(t.due) : "";
  $("taskEst").value = t.est || "";
  setPrio(t.prio || "med");
  $("taskFormError").textContent = "";
  $("taskSubmit").innerHTML = ic("check") + "<span>Save changes</span>";
  $("ntLabel").textContent = "Edit task";
  openTaskDialog();
}

$("taskForm").addEventListener("submit", e => {
  e.preventDefault();
  if (!user) return;
  const err = $("taskFormError");
  const fail = (el, msg) => { err.textContent = msg; el.classList.add("invalid"); el.focus(); };
  err.textContent = "";
  ["taskInput", "taskDue", "taskEst"].forEach(id => $(id).classList.remove("invalid"));

  const editing = editingId && tasks.find(t => t.id === editingId);

  /* all three core fields are required */
  const text = $("taskInput").value.trim();
  if (!text) return fail($("taskInput"), "Step 1: tell us what the task is.");

  if (!$("taskDue").value) return fail($("taskDue"), "Step 2: choose when you need to finish it.");
  let due = new Date($("taskDue").value).getTime();
  if (!Number.isFinite(due)) return fail($("taskDue"), "That deadline isn't a valid date.");
  // the field only holds whole minutes, so compare at minute precision and keep the original exact value
  const unchanged = !!(editing && editing.due && Math.floor(editing.due / 60000) === Math.floor(due / 60000));
  if (unchanged) due = editing.due;
  if (due <= Date.now() && !unchanged) return fail($("taskDue"), "That time has already passed. Pick a deadline in the future.");

  if ($("taskEst").value === "") return fail($("taskEst"), "Step 3: guess how many minutes of study it needs.");
  const est = Math.floor(Number($("taskEst").value));
  if (!Number.isFinite(est) || est < 1 || est > 1440) return fail($("taskEst"), "Study time must be between 1 and 1440 minutes.");

  const now = Date.now();
  requestNotifyPermission();            // user gesture: needed so the deadline alert can fire

  if (editing) {
    const dueChanged = editing.due !== due;
    Object.assign(editing, { text, due, est, prio: prioValue() });
    if (dueChanged) { editing.notified = false; editing.warned = !!due && due - now <= WARN_MS; }
    endEdit();
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    tasks.unshift({
      id, text, done: false, ms: 0, due, est, prio: prioValue(),
      created: now, notified: false, warned: !!due && due - now <= WARN_MS
    });
    justAddedId = id;
    resetTaskForm();
  }
  closeTaskDialog();
  saveTasks();
  renderTasks();
  toast(editing ? "Task updated" : "Task added", `“${text}” · due ${new Date(due).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`, "info");
});

/* =====================================================
   TASK CARDS
   ===================================================== */
function iconButton(label, iconName, cls, onClick) {
  const b = document.createElement("button");
  b.type = "button"; b.className = cls; b.innerHTML = ic(iconName);
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
}

function dueInfo(t) {
  if (!t.due) return null;
  const at = new Date(t.due);
  const when = `${at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (t.done) {
    const onTime = !t.doneAt || t.doneAt <= t.due;
    return { state: "done", text: onTime ? "Done on time" : "Done late", title: `Deadline ${when}` };
  }
  const left = t.due - Date.now();
  if (left <= 0) return { state: "overdue", text: `Overdue by ${fmtLeft(left)}`, title: `Deadline was ${when}` };
  return { state: left <= 3600000 ? "soon" : "ok", text: `Due in ${fmtLeft(left)}`, title: `Deadline ${when}` };
}

/* paint the parts of a card that change over time (no DOM rebuild) */
function paintTask(li, t) {
  const est = t.est ? t.est * 60000 : 0;
  const pct = pctOf(t);

  li.querySelector(".task-time").textContent =
    est ? `${fmtDur(t.ms)} of ${fmtDur(est)} studied` : (t.ms > 0 ? `${fmtDur(t.ms)} studied` : "");

  const bar = li.querySelector(".pbar");
  bar.parentElement.hidden = !est;      // hide the whole bar row when there is no estimate
  bar.setAttribute("aria-valuenow", pct);
  bar.classList.toggle("full", pct >= 100);
  bar.firstElementChild.style.width = pct + "%";
  li.querySelector(".task-pct").textContent = est ? pct + "%" : "";

  const info = dueInfo(t);
  const chip = li.querySelector(".due");
  chip.hidden = !info;
  if (info) {
    chip.className = "due " + info.state;
    chip.title = info.title;
    chip.innerHTML = ic("calendar") + "<span></span>";
    chip.lastChild.textContent = info.text;
  }
  li.classList.toggle("overdue", !!info && info.state === "overdue");
}

/* =====================================================
   PLAN OVERVIEW (big % + next-deadline ticket), FILTERS, TICKER
   ===================================================== */
let filter = "all";

const isOverdue = t => !t.done && t.due && t.due <= Date.now();
function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }
function matchesFilter(t, f = filter) {
  switch (f) {
    case "today":   return !t.done && !!t.due && t.due <= endOfToday();   // due today, or already late
    case "overdue": return isOverdue(t);
    case "done":    return t.done;
    default:        return true;
  }
}

function fmtCountdown(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${pad(m)}m`;
  return `${pad(m)}m ${pad(s % 60)}s`;
}

function updateSummaries() {
  const open = tasks.filter(t => !t.done);
  const overdue = open.filter(isOverdue).length;
  const total = tasks.reduce((s, t) => s + t.ms, 0);
  $("taskSummary").textContent =
    `${open.length} open${overdue ? ` · ${overdue} overdue` : ""} · ${tasks.length - open.length} done`;
  setText($("stOpen"), open.length);
  setText($("stTracked"), fmtDur(total));
  setText($("cAll"), tasks.length);
  setText($("cToday"), tasks.filter(t => matchesFilter(t, "today")).length);
  setText($("cOver"), overdue);
  setText($("cDone"), tasks.length - open.length);
  updateHero();
}

function updateHero() {
  const box = $("nextUp"), plan = $("plan");
  if (!user) {
    setText($("planPct"), "0%");
    $("planBar").firstElementChild.style.width = "0%";
    $("planSub").textContent = "Sign in to plan your work";
    plan.classList.remove("alert");
    box.dataset.state = "none";
    setText($("nuName"), "Sign in to start");
    setText($("nuTime"), "—");
    $("nuFill").style.width = "0%";
    setText($("nuMeta"), "No tasks yet");
    $("nuFocus").hidden = true;
    return;
  }
  /* overall plan progress: study time done vs. study time planned (finished tasks count fully) */
  let planned = 0, got = 0;
  for (const t of tasks) {
    const w = t.est || 30;
    planned += w;
    got += t.done ? w : (t.est ? Math.min(w, t.ms / 60000) : 0);
  }
  const pct = planned ? Math.round(got / planned * 100) : 0;
  const overdue = tasks.filter(isOverdue).length;
  $("planBar").firstElementChild.style.width = pct + "%";
  $("planBar").setAttribute("aria-valuenow", pct);
  $("planBar").classList.toggle("full", pct >= 100);
  setText($("planPct"), pct + "%");
  const open = tasks.filter(t => !t.done).length;
  setText($("planSub"), !tasks.length ? "No tasks yet. Add one to start a plan."
    : overdue ? `${overdue} overdue · ${open} open` : pct === 100 ? "Plan complete" : `${open} open · ${tasks.length - open} done`);
  plan.classList.toggle("alert", overdue > 0);

  /* next deadline = earliest open task that has one (an overdue task counts, and shows first) */
  const next = tasks.filter(t => !t.done && t.due).sort((a, b) => a.due - b.due)[0];
  if (!next) {
    box.dataset.state = "none";
    setText($("nuName"), tasks.length ? "All caught up" : "Nothing scheduled");
    setText($("nuTime"), "—");
    $("nuFill").style.width = "0%";
    setText($("nuMeta"), tasks.length ? "No open deadlines" : "Add a task to get started");
    $("nuFocus").hidden = true;
    return;
  }
  const left = next.due - Date.now();
  box.dataset.state = left <= 0 ? "overdue" : left <= 3600000 ? "soon" : "ok";
  setText($("nuName"), next.text);
  setText($("nuTime"), left <= 0 ? `-${fmtCountdown(left)}` : fmtCountdown(left));
  $("nuFill").style.width = pctOf(next) + "%";
  setText($("nuMeta"), left <= 0 ? `Overdue · ${pctOf(next)}% studied` : `${pctOf(next)}% studied`);
  const focusBtn = $("nuFocus");
  focusBtn.hidden = false;
  const on = next.id === activeId;
  focusBtn.className = "focus-btn" + (on ? " on" : "");
  const html = ic("target") + `<span>${on ? "Tracking" : "Focus"}</span>`;
  if (focusBtn.dataset.h !== html) { focusBtn.dataset.h = html; focusBtn.innerHTML = html; }
  focusBtn.onclick = () => focusOn(next);
}
setInterval(() => { if (user) updateHero(); }, 1000);

/* start tracking a task, and guide the user to the clock */
function focusOn(t) {
  const turningOn = t.id !== activeId;
  setActive(turningOn ? t.id : null);
  if (turningOn) {
    toast("Now tracking", `“${t.text}”. Press Start on the clock to begin.`, "info");
    if (matchMedia("(max-width: 920px)").matches) setView("focus");   // phone: jump to the clock
  }
}

document.querySelectorAll("#filters .tab").forEach(b => b.addEventListener("click", () => {
  filter = b.dataset.f;
  document.querySelectorAll("#filters .tab").forEach(x => x.setAttribute("aria-selected", x === b));
  animateAll = true;
  renderTasks();
}));

/* cheap in-place refresh used while a clock runs */
function updateTaskTimes() {
  if (!user) return;
  document.querySelectorAll("#taskList .task").forEach(li => {
    const t = tasks.find(x => x.id === li.dataset.id);
    if (t) paintTask(li, t);
  });
  updateSummaries();
}

function renderTasks() {
  if (!user) return;
  const list = $("taskList");
  list.textContent = "";
  // open tasks by nearest deadline (no deadline last), then finished ones
  const open = tasks.filter(t => !t.done).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
  const ordered = [...open, ...tasks.filter(t => t.done)].filter(t => matchesFilter(t));

  if (!ordered.length) {
    const msg = !tasks.length
      ? ["No tasks yet", "Press “New task” and fill in the 3 steps"]
      : { today: ["Nothing due today", "No deadlines before midnight"], overdue: ["Nothing overdue", "You're on schedule"],
          done: ["No finished tasks yet", "Press Done on a task when you complete it"], all: ["No tasks", ""] }[filter];
    const li = document.createElement("li");
    li.className = "task-empty";
    li.innerHTML = ic("clipboard") + `<p>${msg[0]}</p><small>${msg[1]}</small>`;
    list.appendChild(li);
  }

  ordered.forEach((t, i) => {
    const li = document.createElement("li");
    li.dataset.id = t.id;
    li.className = `task p-${t.prio || "med"}` + (t.done ? " done" : "") + (t.id === activeId ? " active" : "") + (t.id === editingId ? " editing" : "");
    if (t.id === justAddedId) li.classList.add("enter");
    else if (animateAll) { li.classList.add("enter"); li.style.animationDelay = Math.min(i, 8) * 40 + "ms"; }

    /* top: priority tag + due chip */
    const top = document.createElement("div");
    top.className = "tk-top";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = { low: "Low", med: "Medium", high: "High" }[t.prio || "med"];
    const due = document.createElement("span");
    due.className = "due"; due.hidden = true;
    top.append(tag, due);

    /* title: textContent, so task text is never parsed as HTML */
    const title = document.createElement("h4");
    title.className = "tk-title";
    title.textContent = t.text;

    /* progress */
    const bar = document.createElement("div");
    bar.className = "pbar";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", `Progress on ${t.text}`);
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.innerHTML = "<i></i>";
    const prog = document.createElement("div");
    prog.className = "bar-row";
    prog.innerHTML = '<span class="task-pct"></span>';
    prog.prepend(bar);

    const time = document.createElement("div");
    time.className = "task-time";

    /* footer actions */
    const foot = document.createElement("div");
    foot.className = "tk-foot";
    const done = document.createElement("button");
    done.type = "button";
    done.className = "btn small";
    done.innerHTML = ic("check") + `<span>${t.done ? "Undo" : "Done"}</span>`;
    done.setAttribute("aria-label", t.done ? `Mark “${t.text}” as not done` : `Mark “${t.text}” as done`);
    done.addEventListener("click", () => {
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
      if (t.done && t.id === activeId) { setActive(null); }
      saveTasks(); renderTasks();
    });
    foot.appendChild(done);

    if (!t.done) {
      const on = t.id === activeId;
      const fb = document.createElement("button");
      fb.type = "button";
      fb.className = "focus-btn" + (on ? " on" : "");
      fb.innerHTML = ic("target") + `<span>${on ? "Tracking" : "Focus"}</span>`;
      fb.setAttribute("aria-label", on ? "Stop tracking time to this task" : `Track time on “${t.text}”`);
      fb.addEventListener("click", () => focusOn(t));
      foot.appendChild(fb);
      foot.appendChild(iconButton(`Edit “${t.text}”`, "pencil", "task-edit", () => startEdit(t)));
    }
    foot.appendChild(iconButton(`Delete “${t.text}”`, "trash", "task-del", () => {
      if (t.id === activeId) setActive(null);
      if (t.id === editingId) endEdit();
      li.classList.add("leaving");
      setTimeout(() => {
        tasks = tasks.filter(x => x.id !== t.id);
        saveTasks(); renderTasks();
      }, REDUCED ? 0 : 180);
    }));

    li.append(top, title, prog, time, foot);
    list.appendChild(li);
    paintTask(li, t);
  });

  justAddedId = null;
  animateAll = false;
  updateSummaries();
}

/* ---------- keyboard shortcuts ----------
   Space start/pause · R reset · N new task · 1 timer · 2 stopwatch · T themes
   Ignored while typing, while a dialog is open, or with a modifier held. */
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  const el = document.activeElement, tag = el && el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el && el.isContentEditable)) return;
  if (dlg.open) return;
  if (e.code === "Space") {
    if (tag === "BUTTON" || tag === "SUMMARY") return;      // let a focused control handle its own Space
    e.preventDefault(); $("mainBtn").click();
  } else if (e.key === "r" || e.key === "R") { $("resetBtn").click(); }
  else if ((e.key === "n" || e.key === "N") && user) { e.preventDefault(); $("newTaskBtn").click(); }
  else if (e.key === "1") $("tabTimer").click();
  else if (e.key === "2") $("tabSw").click();
  else if (e.key === "t" || e.key === "T") $("themeBtn").click();
});

/* don't lose the last slice if the tab is closed */
addEventListener("pagehide", () => { flushAll(); saveTasks(); saveStats(); });

/* ---------- init ---------- */
$("taskSubmit").innerHTML = ic("plus") + "<span>Add task</span>";
restoreSession();
animateAll = true;
setMode("timer");
showStats();
updateFocusRow();
showTasksPanel();
setAuthMode(false);
setDuration(25 * 60); // sensible default: one focus block
checkDeadlines();     // catches deadlines that passed while the page was closed
