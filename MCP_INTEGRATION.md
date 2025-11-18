# MCP (Model Context Protocol) Integration Guide

This document explains how to use the Model Context Protocol (MCP) integration in the agents-starter project to connect to your MCP server at `https://my-mcp-server.devteam-d3a.workers.dev/sse`.

## Overview

The MCP integration allows your AI agent to:
- Connect to remote MCP servers via SSE (Server-Sent Events)
- Access tools provided by the MCP server
- Seamlessly integrate MCP tools with existing AI SDK tools
- Execute MCP tools as part of the agent's workflow

## Configuration

### 1. Set Environment Variable

Add the MCP server URL to your `.dev.vars` file:

```env
MCP_SERVER_URL=https://my-mcp-server.devteam-d3a.workers.dev/sse
```

The default value is already set, but you can override it with your own MCP server URL.

### 2. Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_SERVER_URL` | SSE endpoint of your MCP server | `https://my-mcp-server.devteam-d3a.workers.dev/sse` |
| `MCP_PROXY_AUTH_TOKEN` | Authentication token for MCP proxy (if needed) | Set in `.dev.vars` |

## API Endpoints

### Connect to MCP Server

**Endpoint:** `GET /mcp-connect`

**Description:** Establishes a connection to the configured MCP server and lists available tools.

**Response:**
```json
{
  "success": true,
  "message": "Connected to MCP server",
  "serverUrl": "https://my-mcp-server.devteam-d3a.workers.dev/sse",
  "toolsAvailable": 5,
  "tools": [
    {
      "name": "tool_name",
      "description": "Tool description"
    }
  ]
}
```

**Usage:**
```bash
curl http://localhost:8787/mcp-connect
```

## Using MCP Tools in Your Agent

### Option 1: Automatic Integration

The agent automatically loads MCP tools through the existing `this.mcp.getAITools()` call in the `onChatMessage` method:

```typescript
const allTools = {
  ...tools,                    // Local tools
  ...this.mcp.getAITools()    // MCP tools automatically included
};
```

### Option 2: Manual Tool Management

You can also manually manage MCP tools using the utility functions:

```typescript
import { 
  connectToMCPServer, 
  listMCPTools, 
  callMCPTool,
  convertMCPToolsToAIFormat 
} from "./mcp-client";

// Connect to MCP server
const client = await connectToMCPServer("https://your-mcp-server.com/sse");

// List available tools
const tools = await listMCPTools();

// Convert to AI SDK format
const aiTools = await convertMCPToolsToAIFormat();

// Call a specific tool
const result = await callMCPTool("tool_name", { param: "value" });
```

## MCP Client API

### `connectToMCPServer(serverUrl: string): Promise<Client | null>`

Establishes a connection to an MCP server.

**Parameters:**
- `serverUrl` (string): The SSE endpoint URL of the MCP server

**Returns:** The MCP Client instance or null if connection failed

**Example:**
```typescript
const client = await connectToMCPServer("https://my-mcp-server.devteam-d3a.workers.dev/sse");
if (client) {
  console.log("Connected!");
}
```

### `listMCPTools(): Promise<Tool[]>`

Lists all available tools from the connected MCP server.

**Returns:** Array of Tool objects with name, description, and input schema

**Example:**
```typescript
const tools = await listMCPTools();
console.log(`Available tools: ${tools.map(t => t.name).join(", ")}`);
```

### `callMCPTool(toolName: string, toolInput: Record<string, unknown>)`

Calls a tool on the MCP server.

**Parameters:**
- `toolName` (string): The name of the tool to call
- `toolInput` (object): The input arguments for the tool

**Returns:** The tool execution result

**Example:**
```typescript
const result = await callMCPTool("search", { query: "weather" });
```

### `convertMCPToolsToAIFormat(): Promise<Record<string, any>>`

Converts MCP tools to the AI SDK format for seamless integration.

**Returns:** Object mapping tool names to AI SDK tool definitions

**Example:**
```typescript
const aiTools = await convertMCPToolsToAIFormat();
const allTools = { ...localTools, ...aiTools };
```

### `getMCPClient(): Client | null`

Returns the current MCP client instance.

**Returns:** The active MCP Client or null if not connected

### `disconnectMCPServer(): Promise<void>`

Closes the connection to the MCP server.

**Example:**
```typescript
await disconnectMCPServer();
console.log("Disconnected from MCP server");
```

## Error Handling

### Connection Errors

If the connection to the MCP server fails:

```typescript
const client = await connectToMCPServer(serverUrl);
if (!client) {
  console.error("Failed to connect to MCP server");
  // Fallback to local tools only
}
```

### Tool Execution Errors

If a tool execution fails:

```typescript
try {
  const result = await callMCPTool("tool_name", input);
} catch (error) {
  console.error("Tool execution failed:", error);
  // Handle error appropriately
}
```

## Testing

### Test the Connection

```bash
# Start the development server
npm run start

# In another terminal, test the connection
curl http://localhost:8787/mcp-connect
```

### Run Tests

```bash
npm run test
```

## Troubleshooting

### Issue: Connection refused

**Solution:** Ensure the MCP server is running and accessible at the configured URL.

```bash
# Check if the server is up
curl https://my-mcp-server.devteam-d3a.workers.dev/sse
```

### Issue: Tools not appearing in agent

**Possible causes:**
1. MCP client not connected
2. Tools not properly exposed by MCP server
3. Tool conversion not happening

**Solution:** Check the browser console and server logs for error messages.

### Issue: CORS errors

**Solution:** If you're accessing the MCP server from a different origin, ensure the MCP server has appropriate CORS headers configured.

## Advanced Usage

### Custom Tool Wrapper

Create a wrapper to add custom logic to MCP tools:

```typescript
import { callMCPTool } from "./mcp-client";

export async function executeToolWithLogging(toolName: string, input: any) {
  console.log(`Executing MCP tool: ${toolName}`);
  console.log(`Input: ${JSON.stringify(input)}`);
  
  const result = await callMCPTool(toolName, input);
  
  console.log(`Result: ${JSON.stringify(result)}`);
  return result;
}
```

### Monitoring Tool Usage

Track which MCP tools are being used:

```typescript
import { listMCPTools } from "./mcp-client";

export async function logAvailableTools() {
  const tools = await listMCPTools();
  tools.forEach(tool => {
    console.log(`- ${tool.name}: ${tool.description}`);
  });
}
```

## Resources

- [Model Context Protocol (MCP) Specification](https://modelcontextprotocol.io)
- [AI SDK Documentation](https://sdk.vercel.ai)
- [Agents Documentation](https://agents.js.org)

## Support

For issues or questions about MCP integration:
1. Check the troubleshooting section above
2. Review server logs for detailed error messages
3. Verify MCP server configuration and accessibility
4. Check network connectivity to the MCP server
