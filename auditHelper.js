// auditHelper.js
// Uses sharedIssueAnalytics.js as the single source of truth for
// assignee/status/due-date/risk/reopened logic - no duplicated
// definitions.

import { normalizeAssignee, isActiveStatus, isClosedStatus } from "./sharedIssueAnalytics.js";

export function analyzeAuditData(issues, isPremium = false) {
    const loadBalancing = {};
    const warnings = [];
    const deductions = [];

    const totalIssues = issues.length;
    let unassignedActiveCount = 0;

    let overdueCount = 0;
    let unassignedCount = 0;
    let reopenedCount = 0;

    issues.forEach(issue => {
        const assignee = normalizeAssignee(issue.assignee);
        const status = issue.status || "";
        // Both calls now pass issue.statusCategory as a second argument,
        // so active/closed detection is language-agnostic (see the fix
        // in sharedIssueAnalytics.js). Falls back to the old string
        // check automatically if statusCategory is missing.
        const isClosed = isClosedStatus(status, issue.statusCategory);
        const summary = issue.summary ? issue.summary.toLowerCase() : "";

        // 1. Load Balancing
        loadBalancing[assignee] = (loadBalancing[assignee] || 0) + 1;

        // 2. Active Unassigned Issues
        const isActive = isActiveStatus(status, issue.statusCategory);
        if (assignee === "Unassigned" && isActive) {
            unassignedActiveCount++;
        }

        // 3. Warnings - overdue
        if (issue.daysOverdue !== null && issue.daysOverdue !== undefined && issue.daysOverdue > 0) {
            overdueCount++;
            warnings.push({
                issueId: issue.id,
                type: "overdue",
                message: `${issue.id} is overdue by ${issue.daysOverdue} days`
            });
        }

        // 4. Warnings - unassigned (non-closed)
        if (assignee === "Unassigned" && !isClosed) {
            unassignedCount++;
            warnings.push({
                issueId: issue.id,
                type: "unassigned",
                message: `${issue.id} is unassigned (Status: ${issue.status})`
            });
        }

        // 5. Warnings - reopened
        if (issue.isReopened) {
            reopenedCount++;
            warnings.push({
                issueId: issue.id,
                type: "reopened",
                message: `${issue.id} was reopened after completion`
            });
        }

        // 6. Warnings - blocked without a reason
        const isBlocked = status.toLowerCase().includes("block");
        const hasNoDescription = !issue.description || issue.description.trim().length < 10;
        if (isBlocked && hasNoDescription) {
            warnings.push({
                issueId: issue.id,
                type: "blocked_no_reason",
                message: `${issue.id} is blocked but has no description or reason provided`
            });
        }

        // Free tier gets a simplified Low/Medium/High tag instead of the
        // exact 0-100 score. The underlying calculation (calculateRiskScore
        // in sharedIssueAnalytics.js) is unchanged either way - only how
        // much detail is shown in the output differs by tier. Thresholds
        // match the >70 cutoff already used elsewhere (e.g. highRiskCount).
        const riskNumeric = typeof issue.riskScore === "number" ? issue.riskScore : parseInt(issue.riskScore, 10) || 0;
        if (isPremium) {
            issue.riskScore = `${riskNumeric}%`;
        } else {
            let tag = "Low";
            if (riskNumeric >= 70) tag = "High";
            else if (riskNumeric >= 40) tag = "Medium";
            issue.riskScore = tag;
        }
    });

    // 7. Health Score
    //
    // Deductions are proportional to each issue's share of the total
    // issue count, with a capped maximum per category, so a single
    // factor cannot single-handedly zero out the whole score, and
    // project size is taken into account (2 overdue issues out of 5
    // is treated as more serious than 2 overdue issues out of 200).
    // Reopened issues carry the highest per-share weight, since a task
    // being reopened after being marked done is the strongest signal of
    // a real quality/process problem.

    if (totalIssues > 0) {
        if (overdueCount > 0) {
            const overdueShare = overdueCount / totalIssues;
            const points = -Math.round(Math.min(35, overdueShare * 35));
            deductions.push({ reason: "Overdue tasks", count: overdueCount, points });
        }
        if (unassignedCount > 0) {
            const unassignedShare = unassignedCount / totalIssues;
            const points = -Math.round(Math.min(25, unassignedShare * 25));
            deductions.push({ reason: "Unassigned tasks", count: unassignedCount, points });
        }
        if (reopenedCount > 0) {
            const reopenedShare = reopenedCount / totalIssues;
            const points = -Math.round(Math.min(40, reopenedShare * 40));
            deductions.push({ reason: "Reopened tasks", count: reopenedCount, points });
        }
    }

    const totalDeduction = deductions.reduce((sum, d) => sum + d.points, 0);
    const healthScore = Math.max(0, 100 + totalDeduction);

    return {
        healthScore,
        scoreBreakdown: deductions,
        totalIssuesChecked: totalIssues,
        unassignedActiveCount,
        warnings,
        workloadDistribution: loadBalancing,
        issues
    };
}
