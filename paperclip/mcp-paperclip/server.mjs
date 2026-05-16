#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = (
  process.env.PAPERCLIP_API_BASE ||
  process.env.PAPERCLIP_AGENT_API_URL ||
  process.env.PAPERCLIP_API_URL ||
  "http://127.0.0.1:3100"
).replace(/\/+$/, "");

const API_KEY =
  process.env.PAPERCLIP_API_KEY ||
  process.env.PAPERCLIP_PROFILE_SYNC_API_KEY ||
  "";

const DEFAULT_COMPANY_ID = process.env.PAPERCLIP_DEFAULT_COMPANY_ID || "";

if (!API_KEY) {
  process.stderr.write(
    "[mcp-paperclip] Missing PAPERCLIP_API_KEY (or PAPERCLIP_PROFILE_SYNC_API_KEY). " +
      "Set one in the container env so the MCP server can call Paperclip.\n"
  );
}

const STATUS_ENUM = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
];

const PRIORITY_ENUM = ["low", "medium", "high", "urgent"];

async function pcFetch(path, { method = "GET", body, query } = {}) {
  const url = new URL(API_BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const detail =
      typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed)
        : String(parsed ?? "");
    throw new Error(
      `Paperclip ${method} ${url.pathname} failed: ${res.status} ${res.statusText} — ${detail}`
    );
  }
  return parsed;
}

function resolveCompanyId(arg) {
  const id = arg || DEFAULT_COMPANY_ID;
  if (!id) {
    throw new Error(
      "companyId is required. Pass it as an argument or set PAPERCLIP_DEFAULT_COMPANY_ID."
    );
  }
  return id;
}

function pickDefined(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

const TOOLS = [
  {
    name: "paperclip_list_companies",
    description:
      "List Paperclip companies the API key has access to. Use this first if you do not know which company to file an issue in.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => pcFetch("/api/companies"),
  },
  {
    name: "paperclip_create_issue",
    description:
      "Create a new issue (task) in a Paperclip company. Returns the created issue with its identifier (e.g. PAP-42) and UUID.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        companyId: {
          type: "string",
          description:
            "Company UUID. Optional if PAPERCLIP_DEFAULT_COMPANY_ID is set in env.",
        },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: STATUS_ENUM, default: "backlog" },
        priority: { type: "string", enum: PRIORITY_ENUM, default: "medium" },
        projectId: { type: "string", description: "Project UUID" },
        goalId: { type: "string", description: "Goal UUID" },
        parentId: { type: "string", description: "Parent issue UUID" },
        assigneeAgentId: { type: "string" },
        assigneeUserId: { type: "string" },
        labelIds: { type: "array", items: { type: "string" } },
        blockedByIssueIds: { type: "array", items: { type: "string" } },
      },
    },
    handler: async (args) => {
      const companyId = resolveCompanyId(args.companyId);
      const body = pickDefined(args, [
        "title",
        "description",
        "status",
        "priority",
        "projectId",
        "goalId",
        "parentId",
        "assigneeAgentId",
        "assigneeUserId",
        "labelIds",
        "blockedByIssueIds",
      ]);
      return pcFetch(`/api/companies/${companyId}/issues`, {
        method: "POST",
        body,
      });
    },
  },
  {
    name: "paperclip_list_issues",
    description:
      "List issues in a company, with optional filters. Returns a paginated array.",
    inputSchema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
        status: {
          type: "array",
          items: { type: "string", enum: STATUS_ENUM },
          description: "Repeat to filter by multiple statuses.",
        },
        assigneeAgentId: { type: "string" },
        assigneeUserId: { type: "string" },
        projectId: { type: "string" },
        parentId: { type: "string" },
        q: { type: "string", description: "Full-text search" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    handler: async (args) => {
      const companyId = resolveCompanyId(args.companyId);
      const query = pickDefined(args, [
        "status",
        "assigneeAgentId",
        "assigneeUserId",
        "projectId",
        "parentId",
        "q",
        "limit",
      ]);
      return pcFetch(`/api/companies/${companyId}/issues`, { query });
    },
  },
  {
    name: "paperclip_get_issue",
    description:
      "Get a single issue by UUID or human identifier (e.g. PAP-39). Returns the issue plus project, goal, ancestors, blockers, and documents.",
    inputSchema: {
      type: "object",
      required: ["issueId"],
      properties: {
        issueId: { type: "string" },
      },
    },
    handler: async ({ issueId }) =>
      pcFetch(`/api/issues/${encodeURIComponent(issueId)}`),
  },
  {
    name: "paperclip_update_issue",
    description:
      "Update an issue: change status, priority, assignee, project, title, description, or add a comment in the same request. Set reopen=true to bring a closed issue back to todo.",
    inputSchema: {
      type: "object",
      required: ["issueId"],
      properties: {
        issueId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: STATUS_ENUM },
        priority: { type: "string", enum: PRIORITY_ENUM },
        projectId: { type: "string" },
        assigneeAgentId: { type: "string" },
        assigneeUserId: { type: "string" },
        comment: { type: "string", description: "Add a comment alongside the update." },
        reopen: { type: "boolean" },
        labelIds: { type: "array", items: { type: "string" } },
        blockedByIssueIds: { type: "array", items: { type: "string" } },
      },
    },
    handler: async (args) => {
      const { issueId } = args;
      const body = pickDefined(args, [
        "title",
        "description",
        "status",
        "priority",
        "projectId",
        "assigneeAgentId",
        "assigneeUserId",
        "comment",
        "reopen",
        "labelIds",
        "blockedByIssueIds",
      ]);
      return pcFetch(`/api/issues/${encodeURIComponent(issueId)}`, {
        method: "PATCH",
        body,
      });
    },
  },
  {
    name: "paperclip_comment_on_issue",
    description:
      "Add a markdown comment to an issue. Use @AgentName mentions to wake other agents. Set reopen=true to bring a closed issue back to todo.",
    inputSchema: {
      type: "object",
      required: ["issueId", "body"],
      properties: {
        issueId: { type: "string" },
        body: { type: "string", description: "Markdown comment body." },
        reopen: { type: "boolean" },
      },
    },
    handler: async ({ issueId, body, reopen }) =>
      pcFetch(`/api/issues/${encodeURIComponent(issueId)}/comments`, {
        method: "POST",
        body: pickDefined({ body, reopen }, ["body", "reopen"]),
      }),
  },
  {
    name: "paperclip_list_agents",
    description:
      "List agents (AI employees) in a company. Use this to find an assigneeAgentId before creating or updating an issue.",
    inputSchema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
      },
    },
    handler: async ({ companyId }) => {
      const id = resolveCompanyId(companyId);
      return pcFetch(`/api/companies/${id}/agents`);
    },
  },
  {
    name: "paperclip_list_projects",
    description:
      "List projects in a company. Use this to find a projectId before associating an issue.",
    inputSchema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
      },
    },
    handler: async ({ companyId }) => {
      const id = resolveCompanyId(companyId);
      return pcFetch(`/api/companies/${id}/projects`);
    },
  },
];

const TOOLS_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const server = new Server(
  {
    name: "paperclip",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS_BY_NAME[request.params.name];
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
    };
  }
  try {
    const result = await tool.handler(request.params.arguments ?? {});
    return {
      content: [
        {
          type: "text",
          text:
            typeof result === "string"
              ? result
              : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: err.message ?? String(err) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
