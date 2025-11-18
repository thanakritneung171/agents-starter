# MCP Integration - Developer Reference Card

## Quick Reference

### Import Statements
```typescript
// Main MCP functions
import { 
  connectToMCPServer, 
  listMCPTools, 
  callMCPTool,
  getMCPClient,
  convertMCPToolsToAIFormat,
  disconnectMCPServer
} from "./mcp-client";

// Examples
import { examples } from "./mcp-examples";

// Tests
import { testSuite } from "./mcp-tests";
```

---

## Core Functions

### 1. Connect to MCP Server
```typescript
const client = await connectToMCPServer(
  "https://my-mcp-server.devteam-d3a.workers.dev/sse"
);

if (client) {
  console.log("Connected!");
} else {
  console.log("Connection failed");
}
```

**Returns:** `Client | null`

---

### 2. List Available Tools
```typescript
const tools = await listMCPTools();

tools.forEach(tool => {
  console.log(`${tool.name}: ${tool.description}`);
  console.log(`Input: ${JSON.stringify(tool.inputSchema)}`);
});
```

**Returns:** `Tool[]`

---

### 3. Call a Tool
```typescript
const result = await callMCPTool("search", {
  query: "weather",
  limit: 10
});

console.log(result);
```

**Parameters:**
- `toolName` (string)
- `toolInput` (Record<string, unknown>)

**Returns:** Tool execution result

---

### 4. Get Current Client
```typescript
const client = getMCPClient();

if (client) {
  console.log("Client is active");
} else {
  console.log("Client not connected");
}
```

**Returns:** `Client | null`

---

### 5. Convert to AI SDK Format
```typescript
const aiTools = await convertMCPToolsToAIFormat();

const allTools = {
  ...localTools,
  ...aiTools
};
```

**Returns:** `Record<string, any>` (AI SDK compatible tools)

---

### 6. Disconnect
```typescript
await disconnectMCPServer();
console.log("Disconnected");
```

**Returns:** `Promise<void>`

---

## Common Patterns

### Pattern 1: Basic Connection + List Tools
```typescript
async function setupMCP() {
  const client = await connectToMCPServer(serverUrl);
  if (!client) throw new Error("Connection failed");
  
  const tools = await listMCPTools();
  console.log(`Available: ${tools.map(t => t.name).join(", ")}`);
  
  return tools;
}
```

### Pattern 2: Safe Tool Execution
```typescript
async function safeCallTool(name, input, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callMCPTool(name, input);
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      } else throw error;
    }
  }
}
```

### Pattern 3: Tool Integration
```typescript
const allTools = {
  ...localTools,
  ...this.mcp.getAITools()  // Auto-loaded
};

const response = await streamText({
  tools: allTools,
  // ... rest of config
});
```

### Pattern 4: Error Handling
```typescript
try {
  const tools = await listMCPTools();
} catch (error) {
  console.error("MCP Error:", error);
  // Fallback to local tools only
}
```

### Pattern 5: Connection Check
```typescript
async function isMCPAvailable() {
  try {
    const tools = await listMCPTools();
    return tools.length > 0;
  } catch {
    return false;
  }
}
```

---

## Configuration

### Environment Variables
```bash
# Required
MCP_SERVER_URL=https://my-mcp-server.devteam-d3a.workers.dev/sse

# Optional
MCP_PROXY_AUTH_TOKEN=your-token
```

### Set in .dev.vars
```
MCP_SERVER_URL=https://my-mcp-server.devteam-d3a.workers.dev/sse
```

### Set in Production
```bash
wrangler secret set MCP_SERVER_URL https://your-mcp-server.com/sse
```

---

## API Endpoints

### GET /mcp-connect
Test connection and list tools

**curl:**
```bash
curl http://localhost:8787/mcp-connect
```

**Response:**
```json
{
  "success": true,
  "message": "Connected to MCP server",
  "serverUrl": "https://...",
  "toolsAvailable": 5,
  "tools": [
    {
      "name": "tool_name",
      "description": "Tool description"
    }
  ]
}
```

---

## Testing

### Test Connection
```typescript
import { testSuite } from "./src/mcp-tests";

await testSuite.connection();
```

### List Tools Test
```typescript
await testSuite.listTools();
```

### Health Check
```typescript
await testSuite.healthCheck();
```

### Performance Test
```typescript
await testSuite.performance();
```

### Run All Tests
```typescript
await testSuite.all();
```

---

## Debugging

### Enable Detailed Logging
```typescript
const client = await connectToMCPServer(serverUrl);
console.log("Client connected:", client !== null);

const tools = await listMCPTools();
console.log("Available tools:", tools.map(t => t.name));

const result = await callMCPTool(name, input);
console.log("Result:", result);
```

### Check Client Status
```typescript
const client = getMCPClient();
console.log({
  isConnected: client !== null,
  hasClient: !!client
});
```

### Validate Configuration
```typescript
console.log("MCP_SERVER_URL:", process.env.MCP_SERVER_URL);
console.log("Config valid:", !!process.env.MCP_SERVER_URL);
```

---

## Error Handling

### Connection Errors
```typescript
try {
  const client = await connectToMCPServer(url);
  if (!client) {
    console.error("Failed to connect");
  }
} catch (error) {
  console.error("Connection error:", error);
}
```

### Tool Execution Errors
```typescript
try {
  const result = await callMCPTool(name, input);
} catch (error) {
  console.error(`Tool ${name} failed:`, error);
  // Fallback or retry
}
```

### Network Errors
```typescript
try {
  const tools = await listMCPTools();
} catch (error) {
  if (error.message.includes("network")) {
    console.error("Network issue - MCP server unreachable");
  }
}
```

---

## Performance Tips

1. **Reuse Client**
   ```typescript
   const client = getMCPClient();
   if (!client) {
     await connectToMCPServer(url);
   }
   ```

2. **Cache Tool List**
   ```typescript
   let toolsCache = null;
   
   async function getTools() {
     if (!toolsCache) {
       toolsCache = await listMCPTools();
     }
     return toolsCache;
   }
   ```

3. **Parallel Execution**
   ```typescript
   const results = await Promise.all([
     callMCPTool("tool1", input1),
     callMCPTool("tool2", input2),
     callMCPTool("tool3", input3)
   ]);
   ```

4. **Exponential Backoff**
   ```typescript
   const delay = Math.pow(2, attemptNumber) * 1000;
   await new Promise(r => setTimeout(r, delay));
   ```

---

## Type Definitions

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPClient {
  connect(transport: SSEClientTransport): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<ListToolsResult>;
  callTool(request: CallToolRequest): Promise<CallToolResult>;
}

type ToolResult = {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  url?: string;
};
```

---

## Common Tasks

### Task: Use MCP Tool in Agent
```typescript
const allTools = {
  ...tools,
  ...this.mcp.getAITools()
};

// Tools automatically available in AI model
```

### Task: Manually Execute Tool
```typescript
const result = await callMCPTool("search", {
  query: "information I need"
});
console.log(result);
```

### Task: Check Available Tools
```typescript
const tools = await listMCPTools();
console.table(tools.map(t => ({ 
  name: t.name, 
  description: t.description 
})));
```

### Task: Handle Tool Errors
```typescript
try {
  const result = await callMCPTool(name, input);
} catch (error) {
  console.error("Tool failed:", error);
  // Use fallback or retry
}
```

### Task: Monitor Tool Usage
```typescript
const startTime = Date.now();
const result = await callMCPTool(name, input);
console.log(`Tool took ${Date.now() - startTime}ms`);
```

---

## Deployment Checklist

- [ ] Set `MCP_SERVER_URL` in Cloudflare secrets
- [ ] Test with `/mcp-connect` endpoint
- [ ] Verify tools are accessible
- [ ] Check error handling works
- [ ] Monitor performance
- [ ] Set up alerts

---

## Quick Links

| Resource | Link |
|----------|------|
| Full Docs | `MCP_INTEGRATION.md` |
| Quick Start | `MCP_QUICKSTART.md` |
| Examples | `src/mcp-examples.ts` |
| Tests | `src/mcp-tests.ts` |
| Architecture | `ARCHITECTURE.md` |
| Next Steps | `NEXT_STEPS.md` |

---

## Troubleshooting Matrix

| Issue | Solution |
|-------|----------|
| Connection refused | Check MCP_SERVER_URL is correct and server is running |
| No tools available | Verify MCP server is properly configured |
| Tool execution fails | Check input matches schema, review MCP server logs |
| CORS errors | Ensure MCP server has proper CORS headers |
| Type errors | Update TypeScript types if using custom tools |
| Performance issues | Check network latency, consider caching |

---

**Last Updated:** November 11, 2025
**Version:** 1.0.0
**Status:** ✅ Production Ready
