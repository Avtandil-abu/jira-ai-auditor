import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { analyzeAuditData } from "./auditHelper.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

const authHeader = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`;

const server = new Server(
    {
        name: "jira-ai-auditor",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Tool descriptions for Claude
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "audit_project",
                description: "EXPERT ENTERPRISE JIRA AUDITOR. Automatically audits a Jira project to find overdue tasks, unassigned active items, reopened issues, and health scores with a detailed breakdown.",
                inputSchema: {
                    type: "object",
                    properties: {
                        projectKey: {
                            type: "string",
                            description: "The unique key of the Jira project (e.g., 'KAN')",
                        },
                    },
                    required: ["projectKey"],
                },
            },
        ],
    };
});

// Main tool logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "audit_project") {
        throw new Error("Unknown tool");
    }

    const { projectKey } = request.params.arguments;

    try {
        const jql = `project = "${projectKey.toUpperCase()}"`;

        const response = await axios.get(`${JIRA_DOMAIN}/rest/api/3/search/jql`, {
            params: {
                jql: jql,
                maxResults: 50,
                fields: "summary,status,assignee,reporter,priority,updated,duedate,description",
                expand: "changelog"
            },
            headers: {
                "Authorization": authHeader,
                "Accept": "application/json"
            }
        });

        if (!response.data || !response.data.issues || response.data.issues.length === 0) {
            return {
                content: [{ type: "text", text: `No issues found in project ${projectKey}.` }]
            };
        }

        const cleanIssues = response.data.issues.map(issue => {
            const currentStatus = issue.fields?.status?.name || "N/A";

            // Check if issue was reopened via changelog
            let wasEverDone = false;
            let currentIsDone = currentStatus.toLowerCase() === "done" || currentStatus.toLowerCase() === "готово" || currentStatus.toLowerCase() === "closed";

            if (issue.changelog && issue.changelog.histories) {
                issue.changelog.histories.forEach(history => {
                    history.items.forEach(item => {
                        if (item.field === 'status') {
                            const toStatus = (item.toString || "").toLowerCase();
                            if (toStatus === 'done' || toStatus === 'готово' || toStatus === 'closed') {
                                wasEverDone = true;
                            }
                        }
                    });
                });
            }

            const isReopened = wasEverDone && !currentIsDone;

            // Format timestamp to human-readable
            let updatedFormatted = "N/A";
            const rawUpdated = issue.fields?.updated;
            if (rawUpdated) {
                const dateObj = new Date(rawUpdated);
                if (!isNaN(dateObj.getTime())) {
                    const options = { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' };
                    updatedFormatted = dateObj.toLocaleDateString('en-GB', options);
                }
            }

            return {
                id: issue.key,
                summary: issue.fields?.summary || "No Summary",
                status: currentStatus,
                assignee: issue.fields?.assignee?.displayName || "Unassigned",
                reporter: issue.fields?.reporter?.displayName || "Unknown Creator",
                priority: issue.fields?.priority?.name || "N/A",
                updatedRaw: rawUpdated || "N/A",
                updated: updatedFormatted,
                dueDate: issue.fields?.duedate || "No due date",
                description: issue.fields?.description ? JSON.stringify(issue.fields.description) : "",
                isReopened: isReopened
            };
        });

        const auditResults = analyzeAuditData(cleanIssues);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        project: projectKey,
                        issues: cleanIssues,
                        auditReport: {
                            projectHealthScore: auditResults.healthScore,
                            scoreBreakdown: auditResults.scoreBreakdown,
                            totalChecked: auditResults.totalIssuesChecked,
                            unassignedActiveCount: auditResults.unassignedActiveCount,
                            warnings: auditResults.warnings,
                            teamWorkload: auditResults.workloadDistribution
                        }
                    }, null, 2),
                },
            ],
        };

    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        return {
            content: [{ type: "text", text: `Jira Error: ${errorMsg}` }],
            isError: true,
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    process.exit(1);
});