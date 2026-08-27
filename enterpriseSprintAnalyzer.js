// enterpriseSprintAnalyzer.js
// Uses sharedIssueAnalytics.js as the single source of truth for
// assignee/status/risk logic - no duplicated definitions.
//
// Note: estimatedFinancialLossUSD was removed from this module's output.
// The previous dollar-value formula was not based on any real cost data
// (salary, hourly rate, business impact, etc.) - it was an invented
// placeholder that looked precise but was not. Showing a fabricated
// dollar figure under an "enterprise audit" label is misleading, so
// the field is removed until it can be built properly: driven by a
// real, admin-configured cost input (e.g. cost per story point or per
// day), rather than a guessed constant baked into the code.

import { normalizeAssignee, isClosedStatus } from "./sharedIssueAnalytics.js";

export function analyzeSprintData(issues, sprintInfo = null) {
    let totalStoryPoints = 0;
    let completedPoints = 0;
    let highRiskCount = 0;
    let overdueDaysTotal = 0;
    let unassignedActiveCount = 0;

    const workloadMap = {};
    const unassignedTickets = [];
    const overdueTickets = [];

    issues.forEach(issue => {
        const assignee = normalizeAssignee(issue.assignee);
        const isUnassigned = assignee === "Unassigned";

        const priority = issue.priority ? issue.priority.toLowerCase() : "medium";
        const status = issue.status || "";
        // Fix applied here: now passes issue.statusCategory as a second
        // argument, matching the language-agnostic fix already applied
        // to isClosedStatus/isActiveStatus in sharedIssueAnalytics.js.
        // Previously this only checked the status.name string, so
        // completedPoints/completionRate never correctly recognized a
        // "done" issue on a non-English workflow (e.g. Russian status
        // names). isClosedStatus falls back to the old string check on
        // its own if statusCategory is missing, so this stays safe even
        // if that field is ever absent from the issue data.
        const isClosed = isClosedStatus(status, issue.statusCategory);
        const isActive = !isClosed;

        // Workload tracking
        workloadMap[assignee] = (workloadMap[assignee] || 0) + 1;

        // Dynamic Story Points assignment based on priority
        let points = 3;
        if (priority === "highest" || priority === "critical") points = 8;
        else if (priority === "high") points = 5;
        else if (priority === "low") points = 1;

        totalStoryPoints += points;

        if (isClosed) {
            completedPoints += points;
        }

        // Catch unassigned active tasks accurately using Jira ID or key
        if (isUnassigned && isActive) {
            unassignedActiveCount++;
            const ticketId = issue.id || issue.key || `Task-${unassignedActiveCount}`;
            unassignedTickets.push(ticketId);
        }

        // Overdue days - issue.daysOverdue already computed centrally
        if (issue.daysOverdue && issue.daysOverdue > 0) {
            overdueDaysTotal += issue.daysOverdue;
            const ticketId = issue.id || issue.key || "Task";
            overdueTickets.push({ id: ticketId, days: issue.daysOverdue });
        }

        // Risk score - numeric 0-100, already computed centrally
        const risk = typeof issue.riskScore === "number" ? issue.riskScore : parseInt(issue.riskScore, 10) || 0;
        if (risk > 70) {
            highRiskCount++;
        }
    });

    const completionRate = totalStoryPoints > 0 ? Math.round((completedPoints / totalStoryPoints) * 100) : 0;

    // --- Dynamic Risk & Health Engine ---
    let sprintHealth = "Optimal 🟢";
    let riskLevel = "Low";
    let actionPlan = "Sprint execution is healthy. Team velocity and task distribution are within normal parameters.";

    if (overdueDaysTotal > 10 || unassignedActiveCount >= 3 || highRiskCount >= 3) {
        sprintHealth = "Critical Failure Risk 🔴";
        riskLevel = "Severe";
        const unassignedStr = unassignedTickets.length > 0 ? ` Unassigned tickets needing owners: ${unassignedTickets.join(", ")}.` : "";
        const overdueStr = overdueTickets.length > 0 ? ` Overdue blocks found in: ${overdueTickets.map(t => `${t.id} (${t.days}d)`).join(", ")}.` : "";
        actionPlan = `CRITICAL ACTION REQUIRED:${unassignedStr}${overdueStr} Immediate reallocation and scope pruning are mandatory to prevent delivery failure.`;
    } else if (overdueDaysTotal > 0 || unassignedActiveCount > 0 || completionRate < 20) {
        sprintHealth = "At Risk 🟠";
        riskLevel = "Moderate";
        const targets = [...unassignedTickets, ...overdueTickets.map(t => t.id)];
        actionPlan = `WARNING: Minor friction detected. Review tracking items: ${targets.join(", ")}. Assign owners to unassigned tasks to stabilize velocity.`;
    }

    return {
        sprintOverview: {
            sprintName: sprintInfo?.name || "Active Scrum Sprint",
            sprintGoal: sprintInfo?.goal || "No structural sprint goal defined",
            healthStatus: sprintHealth,
            overallRiskLevel: riskLevel
        },
        metrics: {
            totalStoryPoints,
            completedPoints,
            completionRate: `${completionRate}%`,
            activeUnassignedTasks: unassignedActiveCount,
            unassignedTaskIds: unassignedTickets,
            highRiskTasksCount: highRiskCount,
            totalOverdueDays: overdueDaysTotal
        },
        enterpriseAdvisory: {
            workloadDistribution: workloadMap,
            mitigationActionPlan: actionPlan
        }
    };
}
