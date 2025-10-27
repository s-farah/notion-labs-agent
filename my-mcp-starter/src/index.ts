import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type Env = {
  NOTION_API_KEY: string;
  NOTION_PAGE_ID: string;
  NOTION_SCHEDULE_DB: string;
  AI: Ai;
  MCP_OBJECT: DurableObjectNamespace;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  GOOGLE_API_SCOPE: string;
};

export class MyMCP extends McpAgent {
  static serve = McpAgent.serve;
  server: McpServer;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;

    this.server = new McpServer({
      name: "Notion Labs Tool",
      version: "1.0.0",
    });

    this.setupTools();
  }

  async init() {
    // initialize something when the MCP server starts
  }

  setupTools() {
    const env = this.env;
    const server = this.server;

    // Helper to normalize Slack messages using Cloudflare Workers AI
    async function normalizeWithAI(input: string, env: Env): Promise<string> {
      try {
        const prompt = `
You are a text normalizer for Slack messages about lab deadlines.

Rewrite the following message into this exact canonical format:
"Lab {number} ({title}) due {Month} {Day}, {Year} {Time AM/PM}."

Rules:
1. Remove filler words like "is", "this", "night", "both", "and", "for", etc.
2. Remove weekdays like Sunday, Monday, etc.
3. Convert month abbreviations (e.g., "Nov" → "November").
4. Convert vague times like "midnight" → "11:59 PM" and "noon" → "12:00 PM".
5. Always include the current year if none is specified.
6. If there are multiple labs, write each one on its own line in canonical form.
7. Never add commentary or explanations — output ONLY the formatted text.

Examples:
Bad: "yo @channel lab 15 (BST Maps) due Fri night 11:59pm (Nov 21)"
Good: "Lab 15 (BST Maps) due November 21, 2025 11:59 PM."

Bad: "Lab 16 Binary Search Trees — code & conceptual both due dec 2 midnight"
Good: "Lab 16 (Binary Search Trees) due December 2, 2025 11:59 PM."

Message:
"""${input}"""
`;

        const response = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct" as any,
          { prompt }
        );

        let normalized =
          response?.result?.output_text?.trim?.() ||
          response?.output?.[0]?.content?.[0]?.text?.trim?.() ||
          response?.response?.trim?.() ||
          response?.result?.trim?.() ||
          input;

        console.log("AI raw response:", JSON.stringify(response, null, 2));
        console.log("Normalized Message:", normalized);
        return normalized;
      } catch (err) {
        console.error("AI normalization failed:", err);
        return input;
      }
    }

    // addScheduleItem tool
    try {
      server.tool(
        "addScheduleItem",
        {
          title: z.string(),
          description: z.string().optional(),
          when: z.string().optional(),
          tags: z.array(z.string()).optional(),
          type: z.string().optional(),
        },
        async (args) => {
          const token = env.NOTION_API_KEY;
          const databaseId = env.NOTION_SCHEDULE_DB;

          if (!token || !databaseId) {
            return {
              content: [
                { type: "text", text: "Error: Notion credentials missing." },
              ],
            };
          }

          let localWhen = args.when;
          if (args.when) {
            localWhen = args.when.replace(/Z$/, "");
          }

          const body = {
            parent: { database_id: databaseId },
            properties: {
              Name: { title: [{ text: { content: args.title } }] },
              Details: args.description
                ? { rich_text: [{ text: { content: args.description } }] }
                : undefined,
              When: localWhen
                ? {
                    date: {
                      start: localWhen,
                      time_zone: "America/Los_Angeles",
                    },
                  }
                : undefined,
              Tags: args.tags
                ? { multi_select: args.tags.map((t) => ({ name: t })) }
                : undefined,
              Type: args.type ? { select: { name: args.type } } : undefined,
            },
          };

          const response = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Notion-Version": "2022-06-28",
            },
            body: JSON.stringify(body),
          });

          const text = await response.text();

          if (!response.ok) {
            return {
              content: [{ type: "text", text: `Failed: ${text}` }],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `Added "${args.title}" to your Notion Schedule.`,
              },
            ],
          };
        }
      );
    } catch (err) {
      console.log("addScheduleItem already registered");
    }

    // addLabItem tool
    try {
      server.tool(
        "addLabItem",
        {
          title: z.string(),
          summary: z.string().optional(),
          links: z.array(z.string()).optional(),
        },
        async (args) => {
          const token = env.NOTION_API_KEY;
          const pageId = env.NOTION_PAGE_ID;

          const res = await fetch(
            `https://api.notion.com/v1/blocks/${pageId}/children`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
              },
              body: JSON.stringify({
                children: [
                  {
                    object: "block",
                    type: "toggle",
                    toggle: {
                      rich_text: [{ type: "text", text: { content: args.title } }],
                      children: [
                        ...(args.summary
                          ? [
                              {
                                object: "block",
                                type: "paragraph",
                                paragraph: {
                                  rich_text: [
                                    { type: "text", text: { content: args.summary } },
                                  ],
                                },
                              },
                            ]
                          : []),

                        ...(args.links?.length
                          ? [
                              {
                                object: "block",
                                type: "heading_3",
                                heading_3: {
                                  rich_text: [{ type: "text", text: { content: "Links" } }],
                                },
                              },
                              ...args.links.map((link) => ({
                                object: "block",
                                type: "paragraph",
                                paragraph: {
                                  rich_text: [
                                    {
                                      type: "text",
                                      text: { content: link, link: { url: link } },
                                    },
                                  ],
                                },
                              })),
                            ]
                          : []),
                      ],
                    },
                  },
                ],
              }),
            }
          );

          if (!res.ok) {
            const errText = await res.text();
            return { content: [{ type: "text", text: `Error: ${errText}` }] };
          }

          return {
            content: [
              {
                type: "text",
                text: `Successfully added "${args.title}" to Labs section.`,
              },
            ],
          };
        }
      );
    } catch (err) {
      console.log("addLabItem already registered");
    }

    // parseSlackMessage tool
    try {
      server.tool(
        "parseSlackMessage",
        { text: z.string() },
        async (args) => {
          console.log("parseSlackMessage called with:", args.text);

          const normalized = await normalizeWithAI(args.text, env);
          console.log("Normalized text:", normalized);

          const labs = [];
          const lines = normalized.split("\n").filter((l) => l.trim());

          for (const line of lines) {
            const match = line.match(/Lab (\d+) \(([^)]+)\) due (.+)\./i);

            if (match) {
              const [, labNumber, labTitle, dueDateStr] = match;

              try {
                const dueDate = new Date(dueDateStr);

                if (isNaN(dueDate.getTime())) {
                  console.warn("Invalid date for lab:", labNumber, dueDateStr);
                  continue;
                }

                const docLinkMatch = args.text.match(
                  /(https:\/\/docs\.google\.com\/document\/[^\s>]+)/i
                );

                labs.push({
                  labNumber: parseInt(labNumber),
                  labTitle: labTitle.trim(),
                  dueDate: dueDate.toISOString(),
                  docLink: docLinkMatch ? docLinkMatch[1] : null,
                });

                console.log(
                  `Parsed Lab ${labNumber}: ${labTitle} due ${dueDate.toISOString()}`
                );
              } catch (err) {
                console.error(`Failed to parse date for Lab ${labNumber}:`, err);
              }
            }
          }

          console.log(`Total labs parsed: ${labs.length}`);

          return {
            content: [{ type: "text", text: JSON.stringify(labs, null, 2) }],
          };
        }
      );
    } catch (err) {
      console.log("parseSlackMessage already registered");
    }

    // parseGoogleDoc tool
    try {
      server.tool(
        "parseGoogleDoc",
        { url: z.string() },
        async (args) => {
          const match = args.url.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (!match) {
            return { content: [{ type: "text", text: "Invalid Google Docs URL." }] };
          }
          const docId = match[1];

          // Build JWT
          const header = { alg: "RS256", typ: "JWT" };
          const iat = Math.floor(Date.now() / 1000);
          const exp = iat + 3600;
          const payload = {
            iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            scope: env.GOOGLE_API_SCOPE,
            aud: "https://oauth2.googleapis.com/token",
            exp,
            iat,
          };
          const base64url = (obj: any) =>
            btoa(JSON.stringify(obj))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");
          const unsigned = `${base64url(header)}.${base64url(payload)}`;

          const keyData = env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(
            /-----.* PRIVATE KEY-----/g,
            ""
          ).replace(/\n/g, "");
          const keyBytes = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));
          const privateKey = await crypto.subtle.importKey(
            "pkcs8",
            keyBytes,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["sign"]
          );
          const signature = await crypto.subtle.sign(
            "RSASSA-PKCS1-v1_5",
            privateKey,
            new TextEncoder().encode(unsigned)
          );
          const signedJwt = `${unsigned}.${btoa(
            String.fromCharCode(...new Uint8Array(signature))
          )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "")}`;

          // Exchange JWT for access token
          const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion: signedJwt,
            }),
          });
          const tokenJson: any = await tokenResp.json();
          const token = tokenJson.access_token;
          if (!token) {
            return {
              content: [{ type: "text", text: "Failed to get Google token." }],
            };
          }

          // Fetch document
          const docResp = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!docResp.ok) {
            return {
              content: [{ type: "text", text: `Doc fetch failed: ${await docResp.text()}` }],
            };
          }
          const doc: any = await docResp.json();

          // Extract summary and links
          const title = doc.title ?? "Untitled";
          const body = doc.body?.content ?? [];
          let summary = "";
          const headings: string[] = [];
          const links: string[] = [];

          for (const el of body) {
            const para = el.paragraph;
            if (!para) continue;
            const style = para.paragraphStyle?.namedStyleType;
            const text = (para.elements ?? [])
              .map((e: any) => e.textRun?.content ?? "")
              .join("")
              .trim();

            if (!summary && style === "NORMAL_TEXT" && text) summary = text;
            if (style?.startsWith("HEADING_") && text) headings.push(text);

            for (const e of para.elements ?? []) {
              const link = e.textRun?.textStyle?.link?.url;
              if (link) links.push(link);
            }
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ title, summary, links, headings }, null, 2),
              },
            ],
          };
        }
      );
    } catch (err) {
      console.log("parseGoogleDoc already registered");
    }
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("MCP server running!", { status: 200 });
    }

    return MyMCP.serve("/").fetch(request, env, ctx);
  },
};
