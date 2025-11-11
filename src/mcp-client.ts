/**
 * MCP (Model Context Protocol) Client Manager
 * Handles connections to MCP servers and tool integration
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

let mcpClient: Client | null = null;

/**
 * Initialize connection to an MCP server
 * @param serverUrl - The URL of the MCP server SSE endpoint
 * @returns The initialized MCP client or null if connection failed
 */
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

/**
 * Get the current MCP client instance
 */
export function getMCPClient(): Client | null {
  return mcpClient;
}

/**
 * List all available tools from the MCP server
 */
export async function listMCPTools(): Promise<Tool[]> {
  if (!mcpClient) {
    throw new Error("MCP client not connected");
  }

  const response = await mcpClient.listTools();
  return response.tools;
}

/**
 * Call a tool on the MCP server
 * @param toolName - The name of the tool to call
 * @param toolInput - The input arguments for the tool
 */
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

/**
 * Disconnect from the MCP server
 */
export async function disconnectMCPServer(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
    console.log("✓ Disconnected from MCP server");
  }
}

/**
 * Convert MCP tools to AI SDK format
 * This allows MCP tools to be used with the AI SDK
 */
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
