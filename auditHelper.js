export function analyzeAuditData(issues) {
    const loadBalancing = {};
    const warnings = [];
    const deductions = [];

    const totalIssues = issues.length;
    let unassignedActiveCount = 0;

    // Server-safe timezone date
    const today = new Date();

    let overdueCount = 0;
    let unassignedCount = 0;
    let reopenedCount = 0;

    issues.forEach(issue => {
        const assignee = issue.assignee || "Unassigned";
        const status = issue.status ? issue.status.toLowerCase() : "";
        const isClosed = status === "done" || status === "closed" || status === "готово";

        // 1. Load Balancing Analysis
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

        // 3. Count Active Unassigned Issues
        const isActive = status === "in progress" || status === "в процессе проверки" || status === "к выполнению" || status === "в работе";
        if (assignee === "Unassigned" && isActive) {
            unassignedActiveCount++;
        }

        // 4. Warnings Generation (Translated to English)
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

        const isBlocked = status.includes("block") || status.includes("დაბლოკილი");
        const hasNoDescription = !issue.description || issue.description.trim().length < 10;
        if (isBlocked && hasNoDescription) {
            warnings.push({
                issueId: issue.id,
                type: "blocked_no_reason",
                message: `${issue.id} is blocked, but no description or reason provided in Jira`
            });
        }
    });

    // 5. Health Score & Breakdown Calculation
    const baseScore = 100;

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
    let healthScore = Math.max(0, baseScore + totalDeduction);

    return {
        healthScore: healthScore,
        scoreBreakdown: deductions,
        totalIssuesChecked: totalIssues,
        unassignedActiveCount: unassignedActiveCount,
        warnings: warnings,
        workloadDistribution: loadBalancing
    };
}

export function detectReopenings(issueKey, changelog) {
    if (!changelog || !changelog.histories) return false;

    let wasDone = false;
    for (const history of changelog.histories) {
        for (const item of history.items) {
            if (item.field === 'status') {
                const toStatus = item.toString ? item.toString.toLowerCase() : "";

                if (toStatus === 'done' || toStatus === 'готово' || toStatus === 'closed') {
                    wasDone = true;
                }
                if (wasDone && (toStatus === 'in progress' || toStatus === 'в работе' || toStatus === 'к выполнению')) {
                    return true;
                }
            }
        }
    }
    return false;
}