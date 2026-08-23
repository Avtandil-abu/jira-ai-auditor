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
        const isClosed = status === "done" || status === "closed" || status === "готово";
        const summary = issue.summary ? issue.summary.toLowerCase() : "";
        const priority = issue.priority ? issue.priority.toLowerCase() : "medium";

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
        const isActive = status === "in progress" || status === "в процессе проверки" || status === "к выполнению" || status === "в работе" || status === "to do";
        if (assignee === "Unassigned" && isActive) {
            unassignedActiveCount++;
        }

        // 4. Warnings Generation
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

        const isBlocked = status.includes("block") || status.includes("დაბლოკილი") || status.includes("review");
        const hasNoDescription = !issue.description || issue.description.trim().length < 10;
        if (isBlocked && hasNoDescription) {
            warnings.push({
                issueId: issue.id,
                type: "blocked_no_reason",
                message: `${issue.id} is blocked/in review, but no description or reason provided in Jira`
            });
        }

        // 🧠 5. Avtandil-AI ინტელექტუალური Risk Score ალგორითმი (v1.1)
        let risk = 10; // საბაზისო

        // პრიორიტეტის ფაქტორი
        if (priority === "highest" || priority === "critical") risk += 30;
        else if (priority === "high") risk += 20;
        else if (priority === "medium") risk += 10;

        // უპატრონო კრიტიკული საქმეები
        if (assignee === "Unassigned" && (priority === "highest" || priority === "high")) risk += 35;
        else if (assignee === "Unassigned") risk += 15;

        // გაჭედილი საქმეები
        if (isBlocked) risk += 25;

        // დედლაინის გადაცილება
        if (issue.daysOverdue > 0) risk += 30;

        // 🔥 ტექსტის სემანტიკური ფილტრი (კლოდის შენიშვნის პასუხად!)
        if (summary.includes("crash") || summary.includes("critical") || summary.includes("emergency") || summary.includes("fail")) {
            risk += 40; // კატასტროფულად ვუწევთ რისკს საშიში სიტყვების გამო
        }

        issue.riskScore = `${Math.min(100, Math.max(0, risk))}%`;
    });

    // 6. Health Score & Breakdown Calculation
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
        workloadDistribution: loadBalancing,
        issues: issues // ვაბრუნებთ გადამუშავებულ თასქებს რისკებთან ერთად
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
