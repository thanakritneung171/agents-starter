import { routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
// import { openai } from "@ai-sdk/openai";
import { createOpenAI } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
// import { connectToMCPServer, listMCPTools, convertMCPToolsToAIFormat } from "./mcp-client";
// import { env } from "cloudflare:workers";



import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

let mcpClient: Client | null = null;

export async function connectToMCPServer(serverUrl: string): Promise<Client | null> {
  try {
    const transport = new SSEClientTransport(new URL(serverUrl));
    const client = new Client(
      {
        name: "agents-starter",
        version: "1.0.0"
      },
      {
        capabilities: {}
      }
    );

    await client.connect(transport);
    mcpClient = client;
    console.log(`✓ Connected to MCP server at ${serverUrl}`);
    return client;
  } catch (error) {
    console.error(`✗ Failed to connect to MCP server at ${serverUrl}:`, error);
    mcpClient = null;
    return null;
  }
}

export function getMCPClient(): Client | null {
  return mcpClient;
}

export async function listMCPTools(): Promise<Tool[]> {
  if (!mcpClient) {
    throw new Error("MCP client not connected");
  }

  const response = await mcpClient.listTools();
  return response.tools;
}

export async function callMCPTool(toolName: string, toolInput: Record<string, unknown>) {
  if (!mcpClient) {
    throw new Error("MCP client not connected");
  }

  const result = await mcpClient.callTool({
    name: toolName,
    arguments: toolInput
  });

  return result;
}

export async function disconnectMCPServer(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
    console.log("✓ Disconnected from MCP server");
  }
}

export async function convertMCPToolsToAIFormat(): Promise<Record<string, any>> {
  if (!mcpClient) {
    throw new Error("MCP client not connected");
  }

  const mcpTools = await listMCPTools();
  const aiTools: Record<string, any> = {};

  for (const tool of mcpTools) {
    // Debug: log original schema
    console.log(`[MCP] Tool "${tool.name}":`, JSON.stringify(tool.inputSchema, null, 2));
    
    // Ensure inputSchema is a valid JSON Schema with type: "object"
    let schema = tool.inputSchema || {};
    
    // If schema is missing or invalid, create a basic one
    if (!schema || !schema.type || (schema.type as any) === "None" || Object.keys(schema).length === 0) {
      console.log(`[MCP] ${tool.name}: Creating default schema (was invalid)`);
      schema = {
        type: "object",
        properties: {},
        required: []
      };
    } else if (schema.type !== "object") {
      // If it has a type but not "object", wrap it
      console.log(`[MCP] ${tool.name}: Wrapping non-object schema`);
      schema = {
        type: "object",
        properties: schema,
        required: []
      };
    }
    
    console.log(`[MCP] ${tool.name}: Final schema =`, JSON.stringify(schema, null, 2));

    aiTools[tool.name] = {
      description: tool.description || `MCP Tool: ${tool.name}`,
      parameters: schema,
      execute: async (input: Record<string, unknown>) => {
        const result = await callMCPTool(tool.name, input);
        return result;
      }
    };
  }

  return aiTools;
}

export function mergeMCPToolSources(sources: Array<Record<string, any> | undefined>): Record<string, any> {
  const result: Record<string, any> = {};
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i] || {};
    const sourceName = `source#${i}`;
    for (const [name, impl] of Object.entries(src)) {
      if (result[name]) {
        console.log(`[MCP merge] Skipping duplicate MCP tool '${name}' from ${sourceName}; keeping existing definition.`);
        continue;
      }
      result[name] = impl;
      console.log(`[MCP merge] Registered MCP tool '${name}' from ${sourceName}`);
    }
  }
  return result;
}


// const model = openai("gpt-4o-2024-11-20");

// ---------- helper: client & model ผ่าน Gateway ----------
function getOpenAIClient(env: Env) {
  return createOpenAI({
    apiKey: (env as any).OPENAI_API_KEY as string,                 // คีย์ของ OpenAI เดิม
    baseURL: ((env as any).GATEWAY_BASE_URL as string) || undefined // ชี้ไปที่ /.../gateway-name/openai
    // ถ้าเปิด Provider Keys แบบ require token: เติม header เพิ่มได้
    // headers: { "cf-aig-authorization": `Bearer ${(env as any).CF_AIG_TOKEN}` }
  });
}

function getModel(env: Env) {
  const modelName = ((env as any).OPENAI_MODEL as string) || "gpt-4o-2024-11-20";
  return getOpenAIClient(env)(modelName);
}

type MCPConnector = {
  connect: (url: string) => Promise<any>;
  getAITools: () => Record<string, any>;
};

export async function loadMcpTools(params: {
  env: Env;
  mcp: MCPConnector; // this.mcp
  defaultUrl?: string;
}): Promise<{
  mcpServerUrl: string;
  mcpAITools: Record<string, any>;
}> {
  const { env, mcp, defaultUrl = "https://my-mcp-server.devteam-d3a.workers.dev/sse" } = params;

  const mcpServerUrl = ((env as any).MCP_SERVER_URL as string) || defaultUrl;

  try {
    // ถ้าคุณยังอยากคง global mcpClient ไว้ ก็เรียกได้
    // await connectToMCPServer(mcpServerUrl);

    // อันนี้คือของ agents-starter (this.mcp) — ใช้ตัวนี้ตัวเดียวพอ
    await mcp.connect(mcpServerUrl);
    console.log(`✓ MCP server connected for this chat session`);

    const mcpAITools = mcp.getAITools() || {};
    return { mcpServerUrl, mcpAITools };
  } catch (error) {
    console.error(`✗ Failed to connect MCP server or load tools:`, error);
    return { mcpServerUrl, mcpAITools: {} };
  }
}


/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */

  //  let mcpAITools: Record<string, any> = {};

export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const { mcpAITools } = await loadMcpTools({
      env: this.env,
      mcp: this.mcp
    });
    //  // Initialize MCP connection if not already connected
    // const mcpServerUrl = ((this.env as any).MCP_SERVER_URL as string) || "https://my-mcp-server.devteam-d3a.workers.dev/sse";
    // let mcpAITools: Record<string, any> = {};
    
    // try {
    //   await connectToMCPServer(mcpServerUrl);
    //   const mcpConnection = await this.mcp.connect(mcpServerUrl);
    //   console.log(`✓ MCP server connected for this chat session`);
      
    //   // Get AI tools from mcpConnection
    //   mcpAITools = this.mcp.getAITools() || {};
    // } catch (error) {
    //   console.error(`✗ Failed to connect MCP server or load tools: ${error}`);
    //   mcpAITools = {};
    // }
    console.log(`✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓`);

    // Collect all tools: local tools + MCP tools (keep local tools separate)
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };
    //   const allTools = {
    //   ...tools,
    //   ...this.mcp.getAITools(),
    //   ...mcpAITools
    // };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful assistant that can do various tasks... 

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,

          messages: convertToModelMessages(processedMessages),
          model:getModel(this.env),   // ← ใช้โมเดลที่วิ่งผ่าน Gateway,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

     // บาง lib อาจอ้าง process.env —แมพแบบหลวม ๆ ให้
    if (!(globalThis as any).process) {
      (globalThis as any).process = { env } as any;
    }

    // --- ทดสอบ Gateway แบบง่าย ---
    if (url.pathname === "/gateway-test") {
      try {
        const text = await streamText({
          model: getModel(env),
          messages: [{ role: "user", content: "Reply exactly: pong" }]
        }).text;// ใช้ text แทน toText()

        return Response.json({
          ok: true,
          via: (env as any).GATEWAY_BASE_URL ? "cloudflare-ai-gateway" : "direct",
          baseURL: (env as any).GATEWAY_BASE_URL || "https://api.openai.com/v1",
          model: ((env as any).OPENAI_MODEL as string) || "gpt-4o-2024-11-20",
          text
        });
      } catch (e) {
        return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
      }
    }

     // --- ตรวจคีย์ / สถานะการตั้งค่า ---
    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!(env as any).OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey,
        gatewayConfigured: !!(env as any).GATEWAY_BASE_URL
      });
    }

    if (!(env as any).OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }

    // ให้ agents จัดการเส้นทางปกติ
    const handled = await routeAgentRequest(request, env);
    if (handled) return handled;

    // (ออปชัน) เสิร์ฟไฟล์จาก ASSETS ถ้ามี binding
    try {
      if ((env as any).ASSETS?.fetch) {
        let res = await (env as any).ASSETS.fetch(request);
        if (res.status === 404 && request.method === "GET" && !url.pathname.startsWith("/api")) {
          res = await (env as any).ASSETS.fetch(new Request(url.origin + "/index.html"));
        }
        return res;
      }
    } catch {
      // ignore
    }

    // return (
    //   // Route the request to our agent or return 404 if not found
    //   (await routeAgentRequest(request, env)) ||
    //   new Response("Not found", { status: 404 })
    // );

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
