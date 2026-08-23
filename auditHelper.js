export function analyzeAuditData(issues) {
    const loadBalancing = {};
    const warnings = [];
    const deductions = [];

    const totalIssues = issues.length;
    let unassignedActiveCount = 0;

    const today = new Date();

    let overdueCount = 0;
    let unassignedCount = 0;
    let reopenedCount = 0;

    issues.forEach(issue => {
        const assignee = issue.assignee || "Unassigned";
        const status = issue.status ? issue.status.toLowerCase() : "";
        const isClosed = status === "done" || status === "closed";
        const summary = issue.summary ? issue.summary.toLowerCase() : "";
        const priority = issue.priority ? issue.priority.toLowerCase() : "medium";

        // 1. Load Balancing
        loadBalancing[assignee] = (loadBalancing[assignee] || 0) + 1;

        // 2. Due Date Calculations
        if (issue.dueDate && issue.dueDate !== "No due date" && issue.dueDate !== "N/A") {
            const dueDateTime = new Date(issue.dueDate + "T00:00:00Z");
            const diffTime = today.getTime() - dueDateTime.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 0) {
                issue.daysOverdue = diffDays;
                issue.daysUntilDue = null;
            } else {
                issue.daysOverdue = null;
                issue.daysUntilDue = Math.abs(diffDays);
            }
        } else {
            issue.daysOverdue = null;
            issue.daysUntilDue = null;
        }

        // 3. Active Unassigned Issues
        const isActive = status === "in progress" || status === "to do";
        if (assignee === "Unassigned" && isActive) {
            unassignedActiveCount++;
        }

        // 4. Reopened Check via Changelog
        if (issue.changelog && issue.changelog.histories) {
            issue.isReopened = detectReopenings(issue.id, issue.changelog);
        } else {
            issue.isReopened = false;
        }

        // 5. Warnings
        if (issue.daysOverdue !== null && issue.daysOverdue > 0) {
            overdueCount++;
            warnings.push({
                issueId: issue.id,
                type: "overdue",
                message: `${issue.id} is overdue by ${issue.daysOverdue} days`
            });
        }

        if (assignee === "Unassigned" && !isClosed) {
            unassignedCount++;
            warnings.push({
                issueId: issue.id,
                type: "unassigned",
                message: `${issue.id} is unassigned (Status: ${issue.status})`
            });
        }

        if (issue.isReopened) {
            reopenedCount++;
            warnings.push({
                issueId: issue.id,
                type: "reopened",
                message: `${issue.id} was reopened after completion`
            });
        }

        const isBlocked = status.includes("block");
        const hasNoDescription = !issue.description || issue.description.trim().length < 10;
        if (isBlocked && hasNoDescription) {
            warnings.push({
                issueId: issue.id,
                type: "blocked_no_reason",
                message: `${issue.id} is blocked but has no description or reason provided`
            });
        }

        // 6. Risk Score
        let risk = 10;

        if (priority === "highest" || priority === "critical") risk += 30;
        else if (priority === "high") risk += 20;
        else if (priority === "medium") risk += 10;

        if (assignee === "Unassigned" && (priority === "highest" || priority === "high")) risk += 35;
        else if (assignee === "Unassigned") risk += 15;

        if (isBlocked) risk += 25;

        if (issue.daysOverdue !== null && issue.daysOverdue > 0) risk += 30;

        if (
            summary.includes("crash") ||
            summary.includes("critical") ||
            summary.includes("emergency") ||
            summary.includes("fail")
        ) {
            risk += 40;
        }

        issue.riskScore = `${Math.min(100, Math.max(0, risk))}%`;
    });

    // 7. Health Score
    if (overdueCount > 0) {
        deductions.push({ reason: "Overdue tasks", count: overdueCount, points: -8 * overdueCount });
    }
    if (unassignedCount > 0) {
        deductions.push({ reason: "Unassigned tasks", count: unassignedCount, points: -5 * unassignedCount });
    }
    if (reopenedCount > 0) {
        deductions.push({ reason: "Reopened tasks", count: reopenedCount, points: -10 * reopenedCount });
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

export function detectReopenings(issueKey, changelog) {
    if (!changelog || !changelog.histories) return false;

    let wasDone = false;
    for (const history of changelog.histories) {
        for (const item of history.items) {
            if (item.field === "status") {
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
    return false;
}