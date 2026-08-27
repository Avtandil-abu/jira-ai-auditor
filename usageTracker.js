// usageTracker.js
//
// Simple local daily usage counter for the Free tier's audit_project tool.
//
// Premium users (isPremiumEnabled() === true, see license.js) are never
// limited by this - index.js skips this check entirely for them.
//
// State is stored in a small JSON file next to this module, on the same
// machine that runs the MCP server. This is a per-installation counter,
// not tied to any account or central server - like license.js, it's a
// straightforward soft limit, not a tamper-proof mechanism. It resets
// automatically at the start of each new calendar day (local system
// clock).
//
// Kept in its own file, separate from index.js, so the counting logic
// and its storage format can change later (e.g. switch to a different
// limit, a different reset period, or a server-backed counter) without
// touching index.js - it only ever calls checkAndConsumeFreeUsage().

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USAGE_FILE = path.join(__dirname, ".usage.json");

export const DAILY_FREE_LIMIT = 5;

function todayKey() {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function readUsage() {
    try {
        const raw = fs.readFileSync(USAGE_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.count === "number" && typeof parsed.date === "string") {
            return parsed;
        }
    } catch {
        // File missing, unreadable, or malformed - treat as a fresh start.
    }
    return { date: todayKey(), count: 0 };
}

function writeUsage(usage) {
    try {
        fs.writeFileSync(USAGE_FILE, JSON.stringify(usage), "utf-8");
    } catch {
        // If we can't persist usage (e.g. read-only filesystem), fail
        // open rather than blocking a Free user from using the tool at
        // all - a missed count is a much smaller problem than a broken
        // server.
    }
}

/**
 * Checks whether another Free-tier audit_project call is allowed today,
 * and if so, records it immediately.
 *
 * Returns { allowed: boolean, remaining: number }.
 */
export function checkAndConsumeFreeUsage() {
    let usage = readUsage();

    if (usage.date !== todayKey()) {
        usage = { date: todayKey(), count: 0 };
    }

    if (usage.count >= DAILY_FREE_LIMIT) {
        return { allowed: false, remaining: 0 };
    }

    usage.count += 1;
    writeUsage(usage);

    return { allowed: true, remaining: DAILY_FREE_LIMIT - usage.count };
}
