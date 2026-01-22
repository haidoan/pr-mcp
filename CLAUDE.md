# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PR MCP is a Model Context Protocol (MCP) server that enables AI-powered GitHub PR creation. It integrates with MCP-compatible editors (Cursor, Claude Desktop, Windsurf, etc.) to let the AI directly analyze git changes and create pull requests.

## Commands

```bash
# Install dependencies
pnpm install  # or npm install

# Run the MCP server
node index.js
# or
npm start
```

## Architecture

This is a single-file MCP server (`index.js`) that:

1. **Communicates via MCP protocol** using `@modelcontextprotocol/sdk` over stdio transport
2. **Executes git commands** via `execSync` to analyze changes between branches
3. **Creates PRs** using GitHub CLI (`gh`) - requires `gh` to be installed and authenticated

### MCP Tools Provided

| Tool | Purpose |
|------|---------|
| `analyze_changes` | Get git diff, commits, changed files between branches |
| `generate_pr_description` | Provide context for AI to generate PR description |
| `create_pr` | Push branch and create GitHub PR via `gh` CLI |
| `preview_pr` | Preview PR details without creating |
| `get_repo_config` | Read `.pr-mcp.json` repo configuration |
| `update_pr` | Update existing PR title/description/reviewers |

### Configuration

- **Global config**: `~/.pr-mcp/mcp-config.json` - stores default target branch
- **Per-repo config**: `.pr-mcp.json` in repo root - reviewers, target branch, custom prompts, draft settings

### Key Functions

- `getGitContext()` - Core function that gathers all git info (branch, commits, diff, stat)
- `extractTicket()` - Parses ticket numbers (e.g., `TK-1234`) from branch names
- `generateTitle()` - Creates PR title from branch name with ticket prefix

## Requirements

- Node.js >= 18
- GitHub CLI (`gh`) installed and authenticated (`gh auth login`)
