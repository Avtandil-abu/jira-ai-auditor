import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { analyzeAuditData } from "./auditHelper.js"; // აუცილებელი იმპორტი!

const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

const authHeader = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`;

const server = new Server(
    {
        name: "avtandil-ai-enterprise-auditor",
        version: "1.1.0",
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
        ],
    };
});

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
                fields: "summary,status,assignee,reporter,priority,updated,duedate,description"
            },
            headers: {
                "Authorization": authHeader,
                "Accept": "application/json"
            }
        });

        if (!response.data || !response.data.issues || response.data.issues.length === 0) {
            return { content: [{ type: "text", text: `No issues found in project ${projectKey}.` }] };
        }

        // ბაზისური მასივის მომზადება დამხმარესთვის
        const baseIssues = response.data.issues.map(issue => ({
            id: issue.key,
            summary: issue.fields?.summary || "",
            status: issue.fields?.status?.name || "N/A",
            assignee: issue.fields?.assignee?.displayName || "Unassigned",
            reporter: issue.fields?.reporter?.displayName || "Unknown Creator",
            priority: issue.fields?.priority?.name || "N/A",
            updated: issue.fields?.updated || "N/A",
            dueDate: issue.fields?.duedate || "No due date",
            description: issue.fields?.description?.text || ""
        }));

        // ვიძახებთ თქვენს ნამდვილ ფაილს!
        const auditResult = analyzeAuditData(baseIssues);

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
