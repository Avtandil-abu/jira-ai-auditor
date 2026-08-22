# Jira AI Auditor

> Find the problems your Jira dashboard doesn't show you.

An MCP (Model Context Protocol) server that brings advanced project health auditing directly into your Claude Desktop. Instantly detect overdue tasks, unassigned active work, and reopened issues — with a 0–100 health score.

---

## Features

- **Real-Time Health Score** — Instant 0–100 project health score with detailed breakdown
- **Smart Risk Detection** — Flags overdue tasks, unassigned active work, and reopened issues
- **Native Claude Integration** — No extra web apps. Run audits directly inside Claude Desktop
- **Team Workload Analysis** — See how tasks are distributed across your team

---

## Requirements

- [Claude Desktop](https://claude.ai/download)
- [Node.js](https://nodejs.org) v18 or higher
- A Jira Cloud account with API access

---

## Installation

**1. Clone the repository:**
```bash
git clone https://github.com/YOUR_USERNAME/jira-ai-auditor.git
cd jira-ai-auditor
```

**2. Install dependencies:**
```bash
npm install
```

**3. Get your Jira API Token:**
- Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
- Click **Create API token**
- Copy the token

**4. Configure Claude Desktop:**

Open your `claude_desktop_config.json` and add:

```json
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
```

**5. Restart Claude Desktop and start auditing:**

`Audit my Jira project KAN`
---

## Usage

Once connected, simply ask Claude:

- `Audit project KAN`
- `What's the health score of my PROJECT?`
- `Find all overdue tasks in KAN`

---

## Beta Program

We're looking for engineering managers and PMs to test this tool on real projects.

👉 [Request Free Beta Access](https://forms.gle/Dke3uW3xbYzd5ahJ7)

---

## License

Proprietary — © 2026 Avtandil Labs. All rights reserved.

---

## Support

If this tool provides value to your team and saves your time, consider supporting the development!

[![ko-fi](https://ko-fi.com)](https://ko-fi.com)
