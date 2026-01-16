import fs from "node:fs/promises";

const USERNAME = process.env.USERNAME;
const THEME = process.env.THEME || "dark";

if (!USERNAME) {
  console.error("Missing USERNAME env var");
  process.exit(1);
}

const url = `https://github.com/users/${encodeURIComponent(USERNAME)}/contributions`;
const res = await fetch(url, {
  headers: {
    // These headers help GitHub return the expected HTML snippet
    "user-agent": "github-actions-streak-generator",
    "accept": "text/html",
    "x-requested-with": "XMLHttpRequest",
    "referer": `https://github.com/${encodeURIComponent(USERNAME)}`,
  },
});

if (!res.ok) {
  throw new Error(`Failed to fetch contributions page: ${res.status} ${res.statusText}`);
}

const html = await res.text();

// Parse days from ContributionCalendar-day rects.
// We prefer data-count if present, but fall back to data-level (0..4).
const dayRe = /class="ContributionCalendar-day"[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*?(?:data-count="(\d+)")?[^>]*data-level="(\d+)"/g;

let match;
const days = [];
while ((match = dayRe.exec(html)) !== null) {
  const date = match[1];
  const countMaybe = match[2];
  const level = Number(match[3]); // 0..4
  const count = countMaybe ? Number(countMaybe) : (level > 0 ? 1 : 0); // boolean contribution fallback
  days.push({ date, count, level });
}

if (days.length === 0) {
  // Write debug artifact to help diagnose future markup changes
  await fs.mkdir("dist", { recursive: true });
  await fs.writeFile("dist/contributions-debug.html", html, "utf8");
  throw new Error(
    "Could not parse contributions (no days found). Saved dist/contributions-debug.html for inspection."
  );
}

// Current streak: consecutive days from the end with count>0 (or level>0)
let currentStreak = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].count > 0) currentStreak++;
  else break;
}

// Longest streak
let longestStreak = 0;
let running = 0;
for (const d of days) {
  if (d.count > 0) {
    running++;
    if (running > longestStreak) longestStreak = running;
  } else {
    running = 0;
  }
}

// Totals: only accurate if data-count exists; otherwise this is "active days"
const hasRealCounts = days.some((d) => d.count > 1);
const total = days.reduce((acc, d) => acc + d.count, 0);

const bg = THEME === "light" ? "#ffffff" : "#0b1220";
const border = THEME === "light" ? "#e5e7eb" : "#243244";
const text = THEME === "light" ? "#111827" : "#e5e7eb";
const sub = THEME === "light" ? "#374151" : "#93c5fd";
const accent = THEME === "light" ? "#2563eb" : "#60a5fa";
const ok = THEME === "light" ? "#16a34a" : "#22c55e";

const updated = new Date().toISOString().slice(0, 10);
const totalLabel = hasRealCounts ? "Year contributions" : "Active days (year)";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="180" viewBox="0 0 900 180">
  <rect x="0" y="0" rx="18" ry="18" width="900" height="180" fill="${bg}" stroke="${border}" />
  <text x="36" y="52" fill="${text}" font-size="28"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">
    GitHub Streak • ${USERNAME}
  </text>

  <text x="36" y="84" fill="${sub}" font-size="16"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">
    Self-generated via GitHub Actions (no third-party widgets)
  </text>

  <g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">
    <text x="36" y="130" fill="${accent}" font-size="30">Current</text>
    <text x="170" y="130" fill="${ok}" font-size="40">${currentStreak}</text>
    <text x="240" y="130" fill="${text}" font-size="18">days</text>

    <text x="330" y="130" fill="${accent}" font-size="30">Longest</text>
    <text x="470" y="130" fill="${ok}" font-size="40">${longestStreak}</text>
    <text x="540" y="130" fill="${text}" font-size="18">days</text>

    <text x="630" y="130" fill="${accent}" font-size="22">${totalLabel}</text>
    <text x="840" y="130" fill="${ok}" font-size="36" text-anchor="end">${total}</text>
  </g>

  <text x="36" y="160" fill="${sub}" font-size="14"
        font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">
    Updated: ${updated}
  </text>
</svg>`;

await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/streak.svg", svg, "utf8");
