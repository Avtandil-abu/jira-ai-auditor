// sharedIssueAnalytics.js
// Shared helper functions used by both analyzers
// (enterpriseSprintAnalyzer.js and auditHelper.js), so assignee/status/
// due-date/risk/reopened logic is defined in exactly one place.

/**
 * Returns "Unassigned" for any empty/undefined/"unassigned" value.
 * Unchanged.
 */
export function normalizeAssignee(rawAssignee) {
    if (!rawAssignee) return "Unassigned";
    const trimmed = rawAssignee.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "unassigned") return "Unassigned";
    return rawAssignee;
}

/**
 * A status is "active" if it is not in the "done" statusCategory.
 *
 * Fix applied here: this used to check status.toLowerCase() against
 * English words ("done", "closed", "resolved"), which only worked by
 * coincidence when a workflow happened to use English status names.
 * On a workflow with Russian, Georgian, or any other/custom status
 * names, it silently never matched, and every issue was always
 * considered "active" even after being closed.
 *
 * Now this checks issue.statusCategory (a fixed Jira platform value -
 * "new" | "indeterminate" | "done" - not a display label, so it is the
 * same regardless of language or custom status naming).
 *
 * Fallback: if statusCategory isn't available on the issue (e.g. the
 * project/statuses lookup failed, or older cached data is passed in),
 * this falls back to the previous English string-matching behavior, so
 * nothing breaks outright - it just loses language-independence in
 * that edge case, same as before.
 */
export function isActiveStatus(status, statusCategory = null) {
    if (statusCategory) {
        return statusCategory !== "done";
    }
    const s = status ? status.toLowerCase() : "";
    const isClosed = s.includes("done") || s.includes("closed") || s.includes("resolved");
    return !isClosed;
}

export function isClosedStatus(status, statusCategory = null) {
    return !isActiveStatus(status, statusCategory);
}

/**
 * Calculates overdue/until-due days using one shared implementation.
 * Unchanged.
 * @param {string} dueDate - "YYYY-MM-DD" or "No due date"/"N/A"
 * @param {Date} today - injectable for testing, defaults to current time
 */
export function calculateDueStatus(dueDate, today = new Date()) {
    if (!dueDate || dueDate === "No due date" || dueDate === "N/A") {
        return { daysOverdue: null, daysUntilDue: null };
    }

    const dueDateTime = new Date(dueDate + "T00:00:00Z");
    if (isNaN(dueDateTime.getTime())) {
        return { daysOverdue: null, daysUntilDue: null };
    }

    const diffTime = today.getTime() - dueDateTime.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
        return { daysOverdue: diffDays, daysUntilDue: null };
    }
    return { daysOverdue: null, daysUntilDue: Math.abs(diffDays) };
}

/**
 * Detects whether a task was reopened after being closed, based on changelog.
 *
 * Fix applied here: this used to compare changelog toString values
 * (localized display text - e.g. the English word "Done" translated
 * into whatever language the workflow uses) against
 * hardcoded English words ("done", "closed", "in progress", "to do").
 * This only worked by coincidence on English-named workflows, and
 * silently returned false for every issue on any non-English or custom
 * workflow - never detecting a real reopening.
 *
 * Now this uses the changelog's status ID (item.to), which is stable
 * and language-independent, and looks it up in statusCategoryMap (built
 * once per project in index.js from the real Jira statusCategory data)
 * to get that status's category ("new" | "indeterminate" | "done").
 * A reopening is: the issue was ever in the "done" category, and later
 * moved to a non-"done" category.
 *
 * Fallback: if no statusCategoryMap is provided (or it's empty, e.g.
 * the lookup failed), this falls back to the previous string-matching
 * behavior so nothing throws - it just loses language-independence in
 * that edge case, same as before.
 */
export function detectReopenings(changelog, statusCategoryMap = null) {
    if (!changelog || !changelog.histories) return false;

    const useCategoryMap = statusCategoryMap && Object.keys(statusCategoryMap).length > 0;

    // Fix applied here: changelog.histories is NOT guaranteed to be in
    // chronological order. In practice, Jira's API can return histories
    // newest-first (most recent change at index 0). The reopening check
    // below is inherently order-dependent (it needs to see a transition
    // INTO "done" before it can correctly detect a later transition OUT
    // of "done"), so we explicitly sort a copy of the histories by their
    // "created" timestamp (oldest first) before scanning. Without this,
    // a real reopening (To Do -> Done -> In Progress) can be missed
    // whenever the API happens to return histories newest-first, since
    // the "moved out of done" event would be seen before the "moved
    // into done" event that should have set wasDone = true.
    const sortedHistories = [...changelog.histories].sort((a, b) => {
        const aTime = a.created ? new Date(a.created).getTime() : 0;
        const bTime = b.created ? new Date(b.created).getTime() : 0;
        return aTime - bTime;
    });

    let wasDone = false;
    for (const history of sortedHistories) {
        for (const item of history.items) {
            if (item.field === "status") {
                if (useCategoryMap) {
                    const toCategory = item.to ? statusCategoryMap[item.to] : null;
                    if (toCategory === "done") {
                        wasDone = true;
                    } else if (wasDone && toCategory && toCategory !== "done") {
                        return true;
                    }
                } else {
                    const toStatus = item.toString ? item.toString.toLowerCase() : "";
                    if (toStatus === "done" || toStatus === "closed") {
                        wasDone = true;
                    }
                    if (wasDone && (toStatus === "in progress" || toStatus === "to do")) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

/**
 * Calculates a 0-100 risk score. Unchanged from the previous fix -
 * priority double-counting removed, keyword weight reduced, overdue
 * contribution made gradual. No changes in this pass.
 *
 * Assumes the issue already has daysOverdue (from calculateDueStatus)
 * and a normalized assignee.
 */
export function calculateRiskScore(issue) {
    const priority = issue.priority ? issue.priority.toLowerCase() : "medium";
    const status = issue.status ? issue.status.toLowerCase() : "";
    const assignee = normalizeAssignee(issue.assignee);
    const summary = issue.summary ? issue.summary.toLowerCase() : "";
    const isBlocked = status.includes("block");

    let risk = 10;

    if (priority === "highest" || priority === "critical") risk += 30;
    else if (priority === "high") risk += 20;
    else if (priority === "medium") risk += 10;

    if (assignee === "Unassigned") risk += 20;

    if (isBlocked) risk += 25;

    if (issue.daysOverdue !== null && issue.daysOverdue !== undefined && issue.daysOverdue > 0) {
        risk += Math.min(50, issue.daysOverdue * 2);
    }

    if (
        summary.includes("crash") ||
        summary.includes("critical") ||
        summary.includes("emergency") ||
        summary.includes("fail")
    ) {
        risk += 10;
    }

    return Math.min(100, Math.max(0, risk));
}

/**
 * Enriches a single issue with all derived fields (normalized assignee,
 * daysOverdue/daysUntilDue, isReopened, riskScore).
 * Called once, in index.js, before handing issues to either analyzer -
 * so both tools operate on exactly the same data.
 *
 * Fix applied here: now accepts statusCategoryMap and passes it through
 * to detectReopenings, so reopening detection is language-agnostic.
 * Everything else in this function is unchanged.
 */
export function enrichIssue(rawIssue, today = new Date(), statusCategoryMap = null) {
    const assignee = normalizeAssignee(rawIssue.assignee);
    const { daysOverdue, daysUntilDue } = calculateDueStatus(rawIssue.dueDate, today);
    const isReopened = rawIssue.changelog
        ? detectReopenings(rawIssue.changelog, statusCategoryMap)
        : false;

    const enriched = {
        ...rawIssue,
        assignee,
        daysOverdue,
        daysUntilDue,
        isReopened
    };

    enriched.riskScore = calculateRiskScore(enriched);

    return enriched;
}
