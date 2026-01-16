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
    "user-agent": "streak-generator (github-actions)",
    "accept": "text/html",
  },
});
if (!res.ok) {
  throw new Error(`Failed to fetch contributions page: ${res.status} ${res.statusText}`);
}
const html = await res.text();

const re = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-count="(\d+)"/g;
let match;
const days = [];
while ((match = re.exec(html)) !== null) {
  days.push({ date: match[1], count: Number(match[2]) });
}

if (days.length === 0) {
  throw new Error("Could not parse contributions (no days found).");
}

let currentStreak = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].count > 0) currentStreak++;
  else break;
}

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

const total = days.reduce((acc, d) => acc + d.count, 0);

const bg = THEME === "light" ? "#ffffff" : "#0b1220";
const border = THEME === "light" ? "#e5e7eb" : "#243244";
const text = THEME === "light" ? "#111827" : "#e5e7eb";
const sub = THEME === "light" ? "#374151" : "#93c5fd";
const accent = THEME === "light" ? "#2563eb" : "#60a5fa";
const ok = THEME === "light" ? "#16a34a" : "#22c55e";

const updated = new Date().toISOString().slice(0, 10);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="180" viewBox="0 0 900 180">
  <rect x="0" y="0" rx="18" ry="18" width="900" height="180" fill="${bg}" stroke="${border}" />
  <text x="36" y="52" fill="${text}" font-size="28"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">
    GitHub Streak • ${USERNAME}
  </text>

  <text x="36" y="84" fill="${sub}" font-size="16"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">
    Current streak and best streak (computed from public contributions calendar)
  </text>

  <g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">
    <text x="36" y="130" fill="${accent}" font-size="34">Current</text>
    <text x="190" y="130" fill="${ok}" font-size="40">${currentStreak}</text>
    <text x="255" y="130" fill="${text}" font-size="18">days</text>

    <text x="360" y="130" fill="${accent}" font-size="34">Longest</text>
    <text x="520" y="130" fill="${ok}" font-size="40">${longestStreak}</text>
    <text x="590" y="130" fill="${text}" font-size="18">days</text>

    <text x="680" y="130" fill="${accent}" font-size="34">Year</text>
    <text x="770" y="130" fill="${ok}" font-size="40">${total}</text>
  </g>

  <text x="36" y="160" fill="${sub}" font-size="14"
        font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">
    Updated: ${updated}
  </text>
</svg>`;

await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/streak.svg", svg, "utf8");