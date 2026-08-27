import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { analyzeSprintData } from "./enterpriseSprintAnalyzer.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { analyzeAuditData } from "./auditHelper.js";
import { enrichIssue } from "./sharedIssueAnalytics.js";
import { isPremiumEnabled } from "./license.js";
import { checkAndConsumeFreeUsage, DAILY_FREE_LIMIT } from "./usageTracker.js";

const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

const authHeader = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`;

const server = new Server(
    {
        name: "avtandil-ai-enterprise-auditor",
        version: "1.2.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "audit_project",
                description: "Enterprise-grade Jira project auditor. Analyzes project health, workload, and assigns smart Risk Scores to tasks.",
                inputSchema: {
                    type: "object",
                    properties: {
                        projectKey: { type: "string", description: "Jira Project Key (e.g. 'KAN')" },
                    },
                    required: ["projectKey"],
                },
            },
            {
                name: "audit_sprint",
                description: "[Premium] Enterprise-grade Scrum Sprint Auditor. Predicts sprint success, analyzes velocity, story points, and risks. Requires an activated Premium license.",
                inputSchema: {
                    type: "object",
                    properties: {
                        projectKey: { type: "string", description: "Jira Project Key (e.g. 'SCRUM')" },
                    },
                    required: ["projectKey"],
                },
            },
        ],
    };
});

/**
 * Fetches all statuses configured for a project and builds a
 * statusId -> statusCategoryKey map ("new" | "indeterminate" | "done").
 *
 * This is what makes status detection language-agnostic: statusCategory
 * is a fixed Jira platform concept, not a display label, so it is the
 * same regardless of whether the workflow's status names are in
 * English, Russian, Georgian, or a fully custom name.
 *
 * If this call fails for any reason (permissions, API differences,
 * network issue), we return an empty map and the rest of the code
 * falls back to the previous string-based behavior - so a failure here
 * degrades gracefully instead of breaking the whole audit.
 */
async function fetchStatusCategoryMap(projectKey) {
    const statusCategoryMap = {};
    try {
        const response = await axios.get(
            `${JIRA_DOMAIN}/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`,
            {
                headers: {
                    "Authorization": authHeader,
                    "Accept": "application/json"
                }
            }
        );

        // Response is an array of issue types, each with its own list of
        // statuses. We flatten all of them into one id -> category map,
        // since a status id is unique within the project regardless of
        // which issue type it's listed under.
        for (const issueType of response.data || []) {
            for (const status of issueType.statuses || []) {
                if (status?.id && status?.statusCategory?.key) {
                    statusCategoryMap[status.id] = status.statusCategory.key;
                }
            }
        }
    } catch (error) {
        // Swallow the error intentionally - see function comment above.
        // Downstream logic (isActiveStatus/isClosedStatus/detectReopenings)
        // falls back to string matching when this map is empty.
    }
    return statusCategoryMap;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;

    if (toolName !== "audit_project" && toolName !== "audit_sprint") {
        throw new Error("Unknown tool");
    }

    const { projectKey } = request.params.arguments;

    // Premium gate: audit_sprint requires an activated license. Checked
    // before any Jira API call is made, so a non-Premium user doesn't
    // spend API quota on a request they can't use the result of.
    if (toolName === "audit_sprint" && !isPremiumEnabled()) {
        return {
            content: [
                {
                    type: "text",
                    text: "Sprint auditing (audit_sprint) is a Premium feature. Activate your Premium license to unlock sprint completion tracking, velocity analysis, and advanced risk scoring. See the README for how to activate.",
                },
            ],
        };
    }

    // Daily Free-tier limit for audit_project. Premium users bypass this
    // entirely. Checked before any Jira API call, so a Free user who has
    // hit the limit doesn't spend API quota on a request that will be
    // blocked anyway.
    if (toolName === "audit_project" && !isPremiumEnabled()) {
        const usage = checkAndConsumeFreeUsage();
        if (!usage.allowed) {
            return {
                content: [
                    {
                        type: "text",
                        text: `You've used all ${DAILY_FREE_LIMIT} free audits for today. Your limit resets tomorrow, or activate a Premium license for unlimited audits plus sprint tracking and advanced risk scoring. See the README for how to activate.`,
                    },
                ],
            };
        }
    }

    try {
        const jql = `project = "${projectKey.toUpperCase()}"`;

        const [searchResponse, statusCategoryMap] = await Promise.all([
            axios.get(`${JIRA_DOMAIN}/rest/api/3/search/jql`, {
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
            }),
            fetchStatusCategoryMap(projectKey.toUpperCase())
        ]);

        const response = searchResponse;

        if (!response.data || !response.data.issues || response.data.issues.length === 0) {
            return { content: [{ type: "text", text: `No issues found in project ${projectKey}.` }] };
        }

        const baseIssues = response.data.issues.map(issue => ({
            id: issue.key,
            summary: issue.fields?.summary || "",
            status: issue.fields?.status?.name || "N/A",
            // New fields, in addition to the existing ones above - used for
            // language-agnostic status detection. Nothing above this line
            // changed.
            statusId: issue.fields?.status?.id || null,
            statusCategory: issue.fields?.status?.statusCategory?.key || null,
            assignee: issue.fields?.assignee?.displayName || "Unassigned",
            reporter: issue.fields?.reporter?.displayName || "Unknown Creator",
            priority: issue.fields?.priority?.name || "N/A",
            updated: issue.fields?.updated || "N/A",
            dueDate: issue.fields?.duedate || "No due date",
            description: issue.fields?.description?.text || "",
            changelog: issue.changelog || null
        }));

        // Single place where every issue gets its derived fields
        // (normalized assignee, daysOverdue/daysUntilDue, isReopened,
        // riskScore). statusCategoryMap is now passed through so
        // enrichIssue/detectReopenings can resolve changelog status IDs
        // to their category without relying on localized status text.
        const today = new Date();
        const enrichedIssues = baseIssues.map(issue => enrichIssue(issue, today, statusCategoryMap));

        let auditResult;
        if (toolName === "audit_sprint") {
            // Reaching this point means the Premium check above already
            // passed, so audit_sprint always gets full detail.
            auditResult = analyzeSprintData(enrichedIssues);
        } else {
            auditResult = analyzeAuditData(enrichedIssues, isPremiumEnabled());
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(auditResult, null, 2),
                },
            ],
        };
    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        return { content: [{ type: "text", text: `Jira Error: ${errorMsg}` }], isError: true };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    process.exit(1);
});
