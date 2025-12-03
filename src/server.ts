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
  type ToolSet,
} from "ai";

import { createOpenAI } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import { connectToMCPServer } from "./mcp-client";
import {
  generateToolCallingSystemPrompt,
  parseToolCalls,
  removeToolCallsFromResponse,
  executeToolCalls,
  buildToolResultsPrompt,
} from "./workers-ai-tools";

/**
 * =======================
 *   PROVIDER HELPERS
 * =======================
 */

// โหมดเลือก provider จาก ENV
type ProviderKind = "openai" | "workers";

/** อ่าน provider จาก ENV (ค่า default = openai) */
function getProvider(env: Env): ProviderKind {
  const v = ((env as any).AI_PROVIDER as string | undefined)?.toLowerCase();
  if (v === "workers") return "workers";
  return "openai";
}

/** client OpenAI (ผ่าน Cloudflare Gateway หรือ api.openai.com ตรง ๆ ก็ได้) */
function getOpenAIClient(env: Env) {
  return createOpenAI({
    apiKey: (env as any).OPENAI_API_KEY as string,
    baseURL: ((env as any).GATEWAY_BASE_URL as string) || undefined,
  });
}

/** คืน model สำหรับโหมด OpenAI (ใช้กับ streamText) */
function getOpenAIModel(env: Env) {
  const modelName =
    ((env as any).OPENAI_MODEL as string) || "gpt-4.1-mini";
  return getOpenAIClient(env)(modelName);
}

/**
 * Workers AI: เรียกผ่าน binding env.AI โดยตรง
 * - สมมติว่าตั้ง model ไว้ใน ENV: WORKERS_MODEL
 * - ตัวอย่างค่า: @cf/meta/llama-3-8b-instruct (รองรับ multilingual/Thai)
 *   หรือ   @cf/deepseek-ai/deepseek-r1-distill-qwen-32b
 */
async function callWorkersAI(env: Env, prompt: string): Promise<string> {
  const modelId =
    ((env as any).WORKERS_MODEL as string) ||
    "@cf/meta/llama-3-8b-instruct";

  // If a gateway URL is configured, prefer calling the Cloudflare AI Gateway
  // Expected env vars (set in .dev.vars or wrangler secrets):
  // - GATEWAY_WORKERS_URL: full endpoint for workers-ai model (you can include model id or omit and use modelId)
  // - GATEWAY_AUTH_TOKEN: bearer token to use with the gateway (CF_TOKEN)
  const configuredGateway = ((env as any).GATEWAY_WORKER_AI_URL as string) + (env as any).WORKERS_MODEL||
    ((env as any).GATEWAY_BASE_URL as string
      ? `${(env as any).GATEWAY_BASE_URL.replace(/\/+$/,'')}/workers-ai/${modelId}`
      : undefined);

  const gatewayToken =
    ((env as any).GATEWAY_AUTH_TOKEN as string) ||
    ((env as any).OPENAI_API_KEY as string) ||
    undefined;

  if (configuredGateway) {
    const url = configuredGateway;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (gatewayToken) headers["Authorization"] = `Bearer ${gatewayToken}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt }),
    });

    let data: any;
    try {
      data = await res.json();
    } catch (e) {
      const text = await res.text();
      throw new Error(`Gateway returned non-JSON response: ${res.status} ${text}`);
    }

    if (!res.ok) {
      throw new Error(`Gateway call failed: ${res.status} ${JSON.stringify(data)}`);
    }

    // Accept a few shapes returned by the gateway
    if (typeof data === "string") return data;
    if (data?.response) return data.response;
    if (data?.result?.response) return data.result.response;
    if (data?.result && typeof data.result === "string") return data.result;

    return JSON.stringify(data);
  }

  // Fallback: use the Workers AI binding (env.AI)
  const ai = (env as any).AI as any;
  if (!ai || typeof ai.run !== "function") {
    throw new Error(
      "Workers AI binding 'AI' is not configured and no gateway is set. Please add AI binding in wrangler.toml or set GATEWAY_WORKERS_URL"
    );
  }

  // NOTE: แนะนำใช้รูปแบบ text-generation ทั่วไป: { prompt }
  const result = await ai.run(modelId, {
    prompt,
  });

  // รูปแบบผลลัพธ์ของ Workers AI text-generation: รองรับหลายรูปแบบ
  if (typeof result === "string") return result;
  if (result?.response) return result.response;
  if (result?.result?.response) return result.result.response;

  return JSON.stringify(result);
}

/**
 * Process user message through Workers AI with tool calling support
 * Handles:
 * 1. Tool invocation and execution
 * 2. Thai language responses
 * 3. Multiple tool calls in conversation loop
 */
async function processMessageWithWorkersAI(
  env: Env,
  userMessage: string,
  systemPrompt: string,
  allTools: ToolSet,
  maxToolIterations: number = 2
): Promise<{ text: string; toolsUsed: string[] }> {
  const toolsUsed: string[] = [];
  const baseSystemPrompt = generateToolCallingSystemPrompt(allTools, systemPrompt);

  let currentPrompt = `${baseSystemPrompt}\n\nUser: ${userMessage}`;
  let iteration = 0;

  while (iteration < maxToolIterations) {
    // Call Workers AI model
    const modelResponse = await callWorkersAI(env, currentPrompt);

    // Parse tool calls from response
    const toolCalls = parseToolCalls(modelResponse);

    // If no tool calls found, return the response
    if (toolCalls.length === 0) {
      return {
        text: modelResponse,
        toolsUsed,
      };
    }

    // Track which tools were used
    toolCalls.forEach((call) => {
      if (!toolsUsed.includes(call.name)) {
        toolsUsed.push(call.name);
      }
    });

    // Execute all tool calls
    const toolResults = await executeToolCalls(toolCalls, allTools);

    // Clean response and prepare for next iteration
    const cleanResponse = removeToolCallsFromResponse(modelResponse);
    currentPrompt = buildToolResultsPrompt(toolResults, cleanResponse);

    iteration++;
  }

  // Return final response after iterations
  const finalResponse = await callWorkersAI(env, currentPrompt);
  return {
    text: finalResponse,
    toolsUsed,
  };
}

// -------- Helper functions end --------

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const provider = getProvider(this.env);

    // ---------- MCP init ----------
    const mcpServerUrl =
      ((this.env as any).MCP_SERVER_URL as string) ||
      "https://my-mcp-server.devteam-d3a.workers.dev/sse";
    let mcpAITools: Record<string, any> = {};

    try {
      await connectToMCPServer(mcpServerUrl);
      await this.mcp.connect(mcpServerUrl);
      //console.log(`✓ MCP server connected for this chat session`);
      mcpAITools = this.mcp.getAITools() || {};
    } catch (error) {
      //console.error(`✗ Failed to connect MCP server or load tools: ${error}`);
      mcpAITools = {};
    }

    const allTools = {
      ...tools,
      ...this.mcp.getAITools(),
      ...mcpAITools,
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls
        const cleanedMessages = cleanupMessages(this.messages);

        // Human-in-the-loop tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions,
        });

        const systemPrompt = `You are a helpful assistant that can do various tasks.
**IMPORTANT: Always respond in the same language as the user's question. If user writes in Thai, respond in Thai. If user writes in English, respond in English. Follow the user's language preference.**

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`;

        // Get the last user message for tool calling
        const lastMessage = processedMessages[processedMessages.length - 1];
        const userInput =
          "parts" in lastMessage && lastMessage.parts
            ? lastMessage.parts
                .map((p: any) =>
                  p.type === "text" ? p.text : JSON.stringify(p)
                )
                .join("\n")
            : (lastMessage as any).content ?? "";

        // -------------------------------
        //   โหมด 1: OpenAI + streamText
        // -------------------------------
        if (provider === "openai") {
          const result = streamText({
            system: systemPrompt,
            messages: convertToModelMessages(processedMessages),
            model: getOpenAIModel(this.env),
            tools: allTools,
            onFinish:
              onFinish as unknown as StreamTextOnFinishCallback<
                typeof allTools
              >,
            stopWhen: stepCountIs(10),
          });

          writer.merge(result.toUIMessageStream());
          return;
        }

        // -------------------------------
        //   โหมด 2: Workers AI พร้อม Tool Calling
        //   - รองรับเรียกใช้ tools
        //   - รองรับภาษาไทย
        // -------------------------------
        try {
          const { text: answer, toolsUsed } =
            await processMessageWithWorkersAI(
              this.env,
              userInput,
              systemPrompt,
              allTools,
              2 // max iterations for tool calling loop
            );

          // ส่งผลลัพธ์ไปยัง UI stream
          const id = generateId();
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: answer });
          writer.write({ type: "text-end", id });

          // Log tools that were used
          if (toolsUsed.length > 0) {
            console.log(`✓ Tools used: ${toolsUsed.join(", ")}`);
          }

          // call onFinish แบบ manual
          await onFinish({
            text: answer,
            toolCalls: [],
          } as any);
        } catch (err) {
          console.error("Workers AI error:", err);
          writer.write({
            type: "error",
            errorText:
              "Sorry, there was an error while calling Workers AI: " +
              (err as Error).message,
          });
        }
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
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`,
          },
        ],
        metadata: {
          createdAt: new Date(),
        },
      },
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // map process.env ให้ libs ที่อ้าง process.env ยังทำงานได้
    if (!(globalThis as any).process) {
      (globalThis as any).process = { env } as any;
    }

    // --- ทดสอบ Workers AI แบบง่าย ---
    if (url.pathname === "/workers-test") {
      try {
        const text = await callWorkersAI(
          env,
          "Reply exactly: pong-from-workers-ai"
        );
        return Response.json({
          ok: true,
          provider: "workers",
          model:
            ((env as any).WORKERS_MODEL as string) ||
            "@cf/meta/llama-3-8b-instruct",
          text,
        });
      } catch (e) {
        return Response.json(
          { ok: false, error: (e as Error).message },
          { status: 500 }
        );
      }
    }

    // --- ทดสอบ OpenAI key / Gateway ---
    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!(env as any).OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey,
        gatewayConfigured: !!(env as any).GATEWAY_BASE_URL,
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

    // เสิร์ฟไฟล์ static จาก ASSETS ถ้ามี binding
    try {
      if ((env as any).ASSETS?.fetch) {
        let res = await (env as any).ASSETS.fetch(request);
        if (
          res.status === 404 &&
          request.method === "GET" &&
          !url.pathname.startsWith("/api")
        ) {
          res = await (env as any).ASSETS.fetch(
            new Request(url.origin + "/index.html")
          );
        }
        return res;
      }
    } catch {
      // ignore
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
