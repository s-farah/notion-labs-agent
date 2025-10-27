import { routeAgentRequest, type Schedule, getAgentByName } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import { env } from "cloudflare:workers";
import type { AgentNamespace } from "agents";

export type Env = {
  Chat: AgentNamespace<Chat>;
  MCP_SERVER: Fetcher;
};

const workersai = createWorkersAI({ binding: env.AI });
const model = workersai("@cf/meta/llama-3.1-8b-instruct-awq" as any);

export class Chat extends AIChatAgent<Env> {
  // handle internal routes used by the worker
  async onRequest(request: Request) {
    const url = new URL(request.url);

    // Return all current messages (for debugging or fetch calls)
    if (url.pathname === "/conversation") {
      return Response.json({ messages: this.messages });
    }

    // Allow adding new messages from Slack/webhooks
    if (url.pathname === "/add-message" && request.method === "POST") {
      const message = await request.json();
      await this.saveMessages([...this.messages, message]);
      return new Response("Message added", { status: 200 });
    }

    return new Response("Not implemented", { status: 404 });
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // Connect to MCP server
    await this.mcp.connect("https://my-mcp-server.shoushafarah.workers.dev/sse");

    const allTools = {
      ...tools,
      ...this.mcp.getAITools(),
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleanedMessages = cleanupMessages(this.messages);

        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions,
        });

        const result = streamText({
          system: `
You are an AI assistant with access to scheduling and Notion tools.

Available capabilities:
- Schedule tasks for later execution
- Parse Slack messages about lab assignments
- Add items to Notion (Labs page and Schedule database)
- Get local time for any location

When a user asks about Slack messages or labs:
1. Use parseSlackMessage to extract lab info
2. For EACH lab in the parsed result, call both addLabItem AND addScheduleItem
3. Confirm what you added

When a user asks to schedule something:
1. Use scheduleTask to set it up

Always confirm what you're doing before executing tools.

${getSchedulePrompt({ date: new Date() })}
          `,
          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<typeof allTools>,
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [{ type: "text", text: `Running scheduled task: ${description}` }],
        metadata: { createdAt: new Date() },
      },
    ]);
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Simple OpenAI key check (optional)
    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({ success: hasOpenAIKey });
    }

    // Handle Slack webhook events
    if (url.pathname === "/slack/events" && request.method === "POST") {
      const body = (await request.json()) as any;
      console.log("Slack webhook received:", JSON.stringify(body, null, 2));

      // Slack URL verification
      if (body.type === "url_verification") {
        return Response.json({ challenge: body.challenge });
      }

      // Slack event callback for messages
      if (body.type === "event_callback" && body.event?.type === "message") {
        const event = body.event;
        console.log("New Slack message:", event.text);

        try {
          // Get (or create) the durable object instance for the Slack agent
          const agent = await getAgentByName(env.Chat, "slack-automation");

          // Build message object
          const newMessage = {
            id: generateId(),
            role: "user" as const,
            parts: [
              {
                type: "text" as const,
                text: `New Slack message received. Parse it and add any labs to Notion:\n\n${event.text}`,
              },
            ],
            metadata: { createdAt: new Date(), source: "slack" },
          };

          // POST it to the durable object’s internal endpoint
          await agent.fetch("https://agent.internal/add-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newMessage),
          });

          console.log("Message saved to agent successfully");
        } catch (err) {
          console.error("Failed to forward to agent:", err);
        }

        return new Response("ok", { status: 200 });
      }
    }

    // Route any UI or internal agent requests
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
};
