import fs from "node:fs/promises";

const USERNAME = process.env.USERNAME;
const THEME = process.env.THEME || "dark";

if (!USERNAME) {
  console.error("Missing USERNAME env var");
  process.exit(1);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "github-actions-streak-generator",
      "accept": "text/html",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

// 1) Load the profile page
const profileHtml = await fetchText(`https://github.com/${encodeURIComponent(USERNAME)}`);

// 2) Extract the dynamic contributions endpoint from the profile page
// GitHub renders a <include-fragment src="..."> or data-url for the calendar.
const srcMatch =
  profileHtml.match(/<include-fragment[^>]*src="([^"]*contributions[^"]*)"/) ||
  profileHtml.match(/data-url="([^"]*contributions[^"]*)"/);

if (!srcMatch) {
  await fs.mkdir("dist", { recursive: true });
  await fs.writeFile("dist/profile-debug.html", profileHtml, "utf8");
  throw new Error(
    "Could not find contributions fragment URL on profile page. Saved dist/profile-debug.html."
  );
}

let contribUrl = srcMatch[1];
if (contribUrl.startsWith("/")) contribUrl = `https://github.com${contribUrl}`;

// 3) Fetch the contributions fragment that contains day cells
const contribHtml = await fetchText(contribUrl);

// Save for debugging (helpful if GitHub changes markup again)
await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/contributions-fragment.html", contribHtml, "utf8");

// 4) Parse per-day data
// We look for ContributionCalendar-day items and parse data-date + data-level/count.
const dayRe = /class="ContributionCalendar-day"[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*?(?:data-count="(\d+)")?[^>]*?(?:data-level="(\d+)")?/g;

let match;
const days = [];
while ((match = dayRe.exec(contribHtml)) !== null) {
  const date = match[1];
  const countMaybe = match[2];
  const levelMaybe = match[3];

  const count = countMaybe
    ? Number(countMaybe)
    : levelMaybe
      ? (Number(levelMaybe) > 0 ? 1 : 0)
      : 0;

  days.push({ date, count });
}

if (days.length === 0) {
  throw new Error(
    "Could not parse contributions fragment (no days found). Check dist/contributions-fragment.html."
  );
}

// Compute current streak (ending at last day in calendar)
let currentStreak = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].count > 0) currentStreak++;
  else break;
}

// Compute longest streak
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

// Total is accurate only if data-count exists; otherwise it’s “active days”
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
    Generated via GitHub Actions (no external widget services)
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

await fs.writeFile("dist/streak.svg", svg, "utf8");