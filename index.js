#!/usr/bin/env node

/**
 * PR AI - MCP Server
 * 
 * Provides AI-powered GitHub PR creation tools via MCP protocol.
 * Works with: Cursor, Claude Desktop, Windsurf, Continue, etc.
 * 
 * Tools:
 *   - analyze_changes: Analyze git changes between branches
 *   - generate_pr_description: Generate PR description from changes
 *   - create_pr: Create GitHub PR with description
 *   - preview_pr: Preview PR without creating
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const VERSION = "1.0.0";

// Config paths
const CONFIG_DIR = path.join(os.homedir(), ".pr-ai");
const CONFIG_FILE = path.join(CONFIG_DIR, "mcp-config.json");

//=============================================================================
// Configuration
//=============================================================================

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Error loading config:", e.message);
  }
  return { defaultTarget: "develop" };
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadRepoConfig(cwd) {
  const configPath = path.join(cwd, ".pr-ai.json");
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (e) {
    // Ignore errors, config is optional
  }
  return null;
}

//=============================================================================
// Git Helpers
//=============================================================================

function execGit(command, cwd) {
  try {
    return execSync(command, { 
      encoding: "utf-8", 
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (e) {
    return null;
  }
}

function findGitRoot(startDir) {
  let dir = startDir || process.cwd();
  while (dir !== "/") {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function getGitContext(cwd, targetBranch = "develop") {
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    throw new Error("Not in a git repository");
  }

  // Resolve target branch
  let resolvedTarget = targetBranch;
  if (!execGit(`git rev-parse --verify ${targetBranch}`, gitRoot)) {
    if (execGit(`git rev-parse --verify origin/${targetBranch}`, gitRoot)) {
      resolvedTarget = `origin/${targetBranch}`;
    } else {
      throw new Error(`Target branch '${targetBranch}' not found`);
    }
  }

  const currentBranch = execGit("git branch --show-current", gitRoot);
  const commits = execGit(`git log ${resolvedTarget}..HEAD --oneline`, gitRoot);
  const commitMessages = execGit(`git log ${resolvedTarget}..HEAD --pretty=format:"### %s%n%b"`, gitRoot);
  const diffStat = execGit(`git diff ${resolvedTarget} --stat`, gitRoot);
  
  // Get diff with size limit
  let diff = execGit(`git diff ${resolvedTarget}`, gitRoot) || "";
  const maxDiffSize = 80000;
  if (diff.length > maxDiffSize) {
    diff = diff.substring(0, maxDiffSize) + "\n\n... [diff truncated]";
  }

  const commitCount = commits ? commits.split("\n").filter(Boolean).length : 0;

  return {
    gitRoot,
    currentBranch,
    targetBranch,
    resolvedTarget,
    commits,
    commitMessages,
    diffStat,
    diff,
    commitCount,
  };
}

function extractTicket(branchName, pattern = "[A-Za-z]+-[0-9]+") {
  const regex = new RegExp(pattern, "i");
  const match = branchName?.match(regex);
  return match ? match[0].toUpperCase() : null;
}

function generateTitle(branchName, repoConfig = {}) {
  const ticket = extractTicket(branchName, repoConfig.ticketPattern);
  
  // Remove common prefixes
  let desc = branchName
    .replace(/^(feature|fix|hotfix|bugfix|chore|refactor|docs|test|ci)s?\//i, "");
  
  // Remove ticket from description
  if (ticket) {
    desc = desc.replace(new RegExp(`${ticket}-?`, "i"), "");
  }
  
  // Clean up
  desc = desc.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  
  // Build title
  let title = "";
  if (repoConfig.titlePrefix) title += repoConfig.titlePrefix + " ";
  if (ticket) title += `[${ticket}] `;
  title += desc || "Pull Request";
  
  return title;
}

//=============================================================================
// MCP Server
//=============================================================================

const server = new Server(
  { name: "pr-ai", version: VERSION },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze_changes",
        description: "Analyze git changes between current branch and target branch. Returns commits, changed files, and diff. Use this first to understand what changed before generating PR description.",
        inputSchema: {
          type: "object",
          properties: {
            target_branch: {
              type: "string",
              description: "Target branch to compare against (default: develop)",
              default: "develop",
            },
            working_directory: {
              type: "string",
              description: "Working directory path (default: current directory)",
            },
          },
        },
      },
      {
        name: "generate_pr_description",
        description: "Generate a PR description based on git changes. The AI (you) should analyze the changes and create a well-structured description with Summary, Changes, and Testing sections.",
        inputSchema: {
          type: "object",
          properties: {
            target_branch: {
              type: "string",
              description: "Target branch (default: develop)",
              default: "develop",
            },
            working_directory: {
              type: "string",
              description: "Working directory path",
            },
            include_diff: {
              type: "boolean",
              description: "Include full diff in context (default: true)",
              default: true,
            },
          },
        },
      },
      {
        name: "create_pr",
        description: "Create a GitHub Pull Request. Pushes branch and creates PR using GitHub CLI.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "PR title (auto-generated from branch if not provided)",
            },
            description: {
              type: "string",
              description: "PR description/body (required)",
            },
            target_branch: {
              type: "string",
              description: "Target branch (default: develop)",
              default: "develop",
            },
            reviewers: {
              type: "string",
              description: "Comma-separated GitHub usernames for review",
            },
            draft: {
              type: "boolean",
              description: "Create as draft PR",
              default: false,
            },
            working_directory: {
              type: "string",
              description: "Working directory path",
            },
          },
          required: ["description"],
        },
      },
      {
        name: "preview_pr",
        description: "Preview PR details without creating. Shows title, description preview, and settings.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "PR title (auto-generated if not provided)",
            },
            description: {
              type: "string",
              description: "PR description to preview",
            },
            target_branch: {
              type: "string",
              description: "Target branch (default: develop)",
              default: "develop",
            },
            reviewers: {
              type: "string",
              description: "Reviewers to add",
            },
            working_directory: {
              type: "string",
              description: "Working directory path",
            },
          },
        },
      },
      {
        name: "get_repo_config",
        description: "Get the PR AI configuration for the current repository (.pr-ai.json). Returns reviewers, target branch, custom prompts, etc.",
        inputSchema: {
          type: "object",
          properties: {
            working_directory: {
              type: "string",
              description: "Working directory path",
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const cwd = args?.working_directory || process.cwd();
  const config = loadConfig();

  try {
    switch (name) {
      //-----------------------------------------------------------------------
      case "analyze_changes": {
        const targetBranch = args?.target_branch || config.defaultTarget || "develop";
        const ctx = getGitContext(cwd, targetBranch);
        const repoConfig = loadRepoConfig(ctx.gitRoot);

        if (!ctx.commits) {
          return {
            content: [{
              type: "text",
              text: `No commits found between '${ctx.currentBranch}' and '${targetBranch}'.\n\nMake sure you have commits that differ from the target branch.`,
            }],
          };
        }

        const title = generateTitle(ctx.currentBranch, repoConfig || {});

        let response = `## Git Analysis

**Current Branch:** ${ctx.currentBranch}
**Target Branch:** ${targetBranch}
**Commits:** ${ctx.commitCount}
**Suggested Title:** ${title}

### Commits
\`\`\`
${ctx.commits}
\`\`\`

### Files Changed
\`\`\`
${ctx.diffStat || "No changes"}
\`\`\`

### Commit Messages
${ctx.commitMessages || "No commit messages"}
`;

        if (repoConfig) {
          response += `\n### Repo Config (.pr-ai.json)
- Reviewers: ${repoConfig.reviewers?.join(", ") || "none"}
- Target: ${repoConfig.targetBranch || "develop"}
- Custom Prompt: ${repoConfig.customPrompt || "none"}
`;
        }

        return { content: [{ type: "text", text: response }] };
      }

      //-----------------------------------------------------------------------
      case "generate_pr_description": {
        const targetBranch = args?.target_branch || config.defaultTarget || "develop";
        const includeDiff = args?.include_diff !== false;
        const ctx = getGitContext(cwd, targetBranch);
        const repoConfig = loadRepoConfig(ctx.gitRoot);

        if (!ctx.commits) {
          throw new Error(`No commits found between '${ctx.currentBranch}' and '${targetBranch}'`);
        }

        const title = generateTitle(ctx.currentBranch, repoConfig || {});

        let prompt = `## PR Context

**Branch:** ${ctx.currentBranch} → ${targetBranch}
**Title:** ${title}

### Commits (${ctx.commitCount})
\`\`\`
${ctx.commits}
\`\`\`

### Commit Messages
${ctx.commitMessages || "No messages"}

### Files Changed
\`\`\`
${ctx.diffStat || "No changes"}
\`\`\`
`;

        if (includeDiff && ctx.diff) {
          prompt += `
### Code Diff
\`\`\`diff
${ctx.diff}
\`\`\`
`;
        }

        if (repoConfig?.customPrompt) {
          prompt += `
### Custom Instructions
${repoConfig.customPrompt}
`;
        }

        prompt += `
---

**Please generate a PR description with:**

## Summary
[1-2 sentences: what does this PR do and why]

## Changes
- [Key change 1]
- [Key change 2]
- [Key change 3]

## Testing
- [ ] [How to test]
- [ ] [Another test case]

Be concise and specific. Focus on WHAT changed and WHY.`;

        return { content: [{ type: "text", text: prompt }] };
      }

      //-----------------------------------------------------------------------
      case "create_pr": {
        const targetBranch = args?.target_branch || config.defaultTarget || "develop";
        const ctx = getGitContext(cwd, targetBranch);
        const repoConfig = loadRepoConfig(ctx.gitRoot);

        if (!args?.description) {
          throw new Error("PR description is required");
        }

        // Generate title if not provided
        const title = args?.title || generateTitle(ctx.currentBranch, repoConfig || {});
        
        // Get reviewers from args or repo config
        const reviewers = args?.reviewers || repoConfig?.reviewers?.join(",") || "";
        const draft = args?.draft || repoConfig?.draft || false;

        // Push branch
        try {
          execSync(`git push -u origin ${ctx.currentBranch}`, { 
            cwd: ctx.gitRoot,
            stdio: 'pipe'
          });
        } catch (e) {
          // Branch might already be pushed
        }

        // Build gh command
        const ghArgs = [
          "pr", "create",
          "--base", targetBranch,
          "--head", ctx.currentBranch,
          "--title", title,
          "--body", args.description,
        ];

        if (reviewers) {
          ghArgs.push("--reviewer", reviewers);
        }

        if (draft) {
          ghArgs.push("--draft");
        }

        // Create PR
        const result = execSync(`gh ${ghArgs.map(a => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`, {
          cwd: ctx.gitRoot,
          encoding: "utf-8",
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();

        return {
          content: [{
            type: "text",
            text: `✅ **PR Created Successfully!**

**Title:** ${title}
**URL:** ${result}
**Target:** ${targetBranch}
${reviewers ? `**Reviewers:** ${reviewers}` : ""}
${draft ? "**Type:** Draft" : ""}`,
          }],
        };
      }

      //-----------------------------------------------------------------------
      case "preview_pr": {
        const targetBranch = args?.target_branch || config.defaultTarget || "develop";
        const ctx = getGitContext(cwd, targetBranch);
        const repoConfig = loadRepoConfig(ctx.gitRoot);

        const title = args?.title || generateTitle(ctx.currentBranch, repoConfig || {});
        const reviewers = args?.reviewers || repoConfig?.reviewers?.join(", ") || "none";
        const draft = repoConfig?.draft ? "Yes" : "No";

        let preview = `## PR Preview

**Title:** ${title}
**Branch:** ${ctx.currentBranch} → ${targetBranch}
**Commits:** ${ctx.commitCount}
**Reviewers:** ${reviewers}
**Draft:** ${draft}

### Files Changed
\`\`\`
${ctx.diffStat || "No changes"}
\`\`\`
`;

        if (args?.description) {
          preview += `
### Description
${args.description}
`;
        }

        preview += `
---
Use **create_pr** tool to create this PR.`;

        return { content: [{ type: "text", text: preview }] };
      }

      //-----------------------------------------------------------------------
      case "get_repo_config": {
        const gitRoot = findGitRoot(cwd);
        if (!gitRoot) {
          throw new Error("Not in a git repository");
        }

        const repoConfig = loadRepoConfig(gitRoot);

        if (!repoConfig) {
          return {
            content: [{
              type: "text",
              text: `No .pr-ai.json found in ${gitRoot}

This is optional. To create one, add a .pr-ai.json file:

\`\`\`json
{
  "reviewers": ["alice", "bob"],
  "targetBranch": "main",
  "customPrompt": "Focus on security",
  "draft": false
}
\`\`\``,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `## Repo Config

**File:** ${path.join(gitRoot, ".pr-ai.json")}

\`\`\`json
${JSON.stringify(repoConfig, null, 2)}
\`\`\`

**Parsed:**
- Reviewers: ${repoConfig.reviewers?.join(", ") || "none"}
- Target Branch: ${repoConfig.targetBranch || "develop"}
- Draft by Default: ${repoConfig.draft || false}
- Custom Prompt: ${repoConfig.customPrompt || "none"}
- Excluded Files: ${repoConfig.excludeFiles?.join(", ") || "none"}`,
          }],
        };
      }

      //-----------------------------------------------------------------------
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ **Error:** ${error.message}`,
      }],
      isError: true,
    };
  }
});

//=============================================================================
// Start Server
//=============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`PR AI MCP Server v${VERSION} running...`);
}

main().catch(console.error);
