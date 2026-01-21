# PR AI - MCP Server

> AI-powered GitHub PR creation for **Cursor**, **Claude Desktop**, **Windsurf**, and other MCP-compatible editors.

## Why MCP?

Unlike the CLI version where you run commands manually, the MCP server lets your AI IDE **directly** create PRs:

```
You: "Create a PR for my changes"
Cursor: [analyzes diff, generates description, creates PR]
        ✅ PR created: https://github.com/you/repo/pull/42
```

No copy/paste. No switching windows. Just ask.

## Quick Install

```bash
# Clone and install
git clone https://github.com/USER/pr-ai-mcp.git
cd pr-ai-mcp
npm install

# Or install globally
npm install -g pr-ai-mcp
```

## Setup for Cursor

Add to your Cursor MCP config (`~/.cursor/mcp.json` or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "pr-ai": {
      "command": "node",
      "args": ["/path/to/pr-ai-mcp/src/index.js"]
    }
  }
}
```

Or if installed globally via npm:

```json
{
  "mcpServers": {
    "pr-ai": {
      "command": "npx",
      "args": ["pr-ai-mcp"]
    }
  }
}
```

**Restart Cursor** after adding the config.

## Setup for Claude Desktop

Add to Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pr-ai": {
      "command": "node",
      "args": ["/path/to/pr-ai-mcp/src/index.js"]
    }
  }
}
```

## Setup for Windsurf / Continue / Others

Most MCP-compatible editors use similar config. Add the server with:
- Command: `node` (or `npx`)
- Args: path to `src/index.js` (or `pr-ai-mcp` if installed via npm)

## Available Tools

| Tool | Description |
|------|-------------|
| `analyze_changes` | Analyze git diff, commits, changed files |
| `generate_pr_description` | Get context for AI to generate PR description |
| `create_pr` | Create the GitHub PR |
| `preview_pr` | Preview PR without creating |
| `get_repo_config` | Show .pr-ai.json settings |

## Usage Examples

### Basic PR Creation

```
You: Create a PR for my changes

AI: I'll analyze your changes and create a PR.
    [calls analyze_changes]
    [calls create_pr with generated description]
    
    ✅ PR Created!
    Title: [TK-1234] add user authentication
    URL: https://github.com/you/repo/pull/42
```

### With Specific Options

```
You: Create a draft PR targeting main, add @alice as reviewer

AI: [calls create_pr with draft=true, target=main, reviewers=alice]
    ✅ Draft PR created...
```

### Preview First

```
You: Show me what the PR would look like

AI: [calls preview_pr]
    ## PR Preview
    Title: [TK-1234] add user auth
    Branch: feature/tk-1234-auth → develop
    ...
```

### Analyze Changes

```
You: What changes am I about to PR?

AI: [calls analyze_changes]
    ## Git Analysis
    Commits: 3
    - abc123 add login endpoint
    - def456 add auth middleware
    - ghi789 add tests
    ...
```

## Per-Repo Configuration (Optional)

Create `.pr-ai.json` in your repo root:

```json
{
  "reviewers": ["alice", "bob"],
  "targetBranch": "main",
  "draft": false,
  "customPrompt": "Focus on security implications",
  "excludeFiles": ["package-lock.json"]
}
```

The MCP server automatically reads this and applies:
- Default reviewers
- Default target branch
- Custom AI instructions
- Draft PR by default

## Requirements

- Node.js >= 18
- GitHub CLI (`gh`) installed and authenticated
- Git repository with GitHub remote

## How It Works

```
┌─────────────────┐
│   Your IDE      │
│ (Cursor/Claude) │
└────────┬────────┘
         │ MCP Protocol
         ▼
┌─────────────────┐
│  PR AI Server   │
│  (this tool)    │
└────────┬────────┘
         │ Git + GitHub CLI
         ▼
┌─────────────────┐
│    GitHub       │
└─────────────────┘
```

1. You ask your AI to create a PR
2. AI calls MCP tools to analyze changes
3. AI generates description based on diff
4. AI calls `create_pr` tool
5. Server uses `gh` CLI to create PR
6. You get the PR URL

## Comparison: CLI vs MCP

| Aspect | CLI (`pr-ai`) | MCP Server |
|--------|---------------|------------|
| Usage | Run command in terminal | Ask AI in IDE |
| AI Provider | Claude/Gemini/OpenAI API | Your IDE's AI |
| API Key | Required | Not needed (uses IDE) |
| Integration | Manual | Seamless |
| Best For | Terminal users | IDE users |

## Troubleshooting

### "Tool not found" in Cursor

1. Check MCP config path is correct
2. Restart Cursor completely
3. Check Cursor's MCP logs

### "Not in a git repository"

Make sure you have a file open from a git repository, or specify `working_directory`.

### "gh: command not found"

Install GitHub CLI: https://cli.github.com/

Then authenticate: `gh auth login`

### PR creation fails

Check:
```bash
# Is gh authenticated?
gh auth status

# Can you create PR manually?
gh pr create --help
```

## License

MIT
# pr-mcp
