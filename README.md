Jira AI Auditor

Find the problems your Jira dashboard doesn't show you.

An MCP (Model Context Protocol) server that brings advanced project and sprint health auditing directly into Claude Desktop. Instantly detect overdue tasks, unassigned work, and reopened issues — with a proportional health score, risk scoring, and sprint-level analysis.

Why this tool

Most Jira integrations either give you full read/write access with no analysis, or a dashboard full of charts you still have to interpret yourself. This tool is different: it reads your project and tells you, in plain language, what's actually wrong — overdue tickets, unowned work, tasks that were marked done and quietly reopened.

It's also one of the few Jira tools that works correctly regardless of what language your team's workflow uses. Status detection is based on Jira's own language-independent status categories, not English text matching — so it works the same whether your statuses are named "Done", "Готово", or anything else.

Features
🆓 Free
Project Health Score — proportional 0–100 score based on overdue, unassigned, and reopened work
Overdue & Unassigned Detection — see exactly which tickets need attention
Reopened Issue Detection — catches tickets marked Done and later reopened, using changelog history (not just current status)
Risk Tags — each ticket flagged Low / Medium / High risk
Team Workload View — how tasks are distributed across your team
Works with any Jira language — tested with English and Russian workflows
5 free audits per day
💎 Premium
Sprint Auditor (audit_sprint) — story points, completion rate, sprint-level risk assessment
Exact Risk Scores — precise 0–100 score per ticket instead of a Low/Medium/High tag, factoring in priority, overdue duration, blocked status, and more
Unlimited audits — no daily limit
More advanced auditing features are on the roadmap
Requirements
Claude Desktop
Node.js v18 or higher
A Jira Cloud account with API access
Installation

1. Clone the repository:

git clone https://github.com/Avtandil-abu/jira-ai-auditor
cd jira-ai-auditor

2. Install dependencies:

npm install

3. Get your Jira API Token:

Go to Atlassian Account Settings
Click Create API token
Copy the token

4. Configure Claude Desktop:

Open your claude_desktop_config.json and add:

json
{
  "mcpServers": {
    "jira-ai-auditor": {
      "command": "node",
      "args": ["/full/path/to/jira-ai-auditor/index.js"],
      "env": {
        "JIRA_DOMAIN": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@company.com",
        "JIRA_API_TOKEN": "your-api-token-here"
      }
    }
  }
}

5. Restart Claude Desktop and start auditing:

Audit my Jira project KAN
Usage

Once connected, simply ask Claude:

Audit project KAN
What's the health score of my project?
Find all overdue tasks in KAN
Which tickets were reopened in KAN?

Sprint auditing (Premium only):

Audit the sprint for project KAN
Upgrading to Premium

Premium unlocks unlimited audits, sprint auditing, and exact risk scores.

👉 See pricing and upgrade

After checkout, you'll receive your Premium activation instructions by email within 24 hours.

Beta Program

We're looking for engineering managers and PMs to test this tool on real projects.

👉 Request Free Beta Access

Support this project

If this tool is useful to you, a ⭐ on this repo genuinely helps — it's how other people find it.

👉 Support the development on Ko-fi

License

Proprietary — © 2026 Avtandil Labs. All rights reserved. See LICENSE.txt.