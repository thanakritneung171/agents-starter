# MCP Integration - Quick Start

## What's Implemented

Your agents-starter project now has full Model Context Protocol (MCP) integration! This allows your AI agent to connect to and use tools from your MCP server at `https://my-mcp-server.devteam-d3a.workers.dev/sse`.

## Files Added/Modified

### New Files
1. **`src/mcp-client.ts`** - Core MCP client library
   - Connection management
   - Tool listing and execution
   - Format conversion for AI SDK integration

2. **`src/mcp-examples.ts`** - Practical usage examples
   - Basic connection
   - Tool listing and execution
   - Error handling and retry logic
   - State management
   - Server integration patterns

3. **`MCP_INTEGRATION.md`** - Comprehensive documentation
   - Configuration guide
   - API reference
   - Troubleshooting tips

### Modified Files
1. **`package.json`** - Added `@modelcontextprotocol/sdk` dependency
2. **`src/server.ts`** - Added `/mcp-connect` endpoint
3. **`.dev.vars`** - Added `MCP_SERVER_URL` configuration

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Test the Connection
```bash
# Start dev server
npm run start

# In another terminal, test MCP connection
curl http://localhost:8787/mcp-connect
```

### 3. Use MCP Tools in Your Agent

MCP tools are automatically integrated! They'll be available alongside your regular tools:

```typescript
const allTools = {
  ...tools,              // Your local tools
  ...this.mcp.getAITools()  // MCP tools automatically included
};
```

## Available MCP Functions

### `connectToMCPServer(serverUrl: string)`
Establish connection to an MCP server
```typescript
const client = await connectToMCPServer("https://your-mcp-server.com/sse");
```

### `listMCPTools()`
Get all available tools from the MCP server
```typescript
const tools = await listMCPTools();
```

### `callMCPTool(toolName, toolInput)`
Execute a tool on the MCP server
```typescript
const result = await callMCPTool("search", { query: "weather" });
```

### `convertMCPToolsToAIFormat()`
Convert MCP tools to AI SDK format
```typescript
const aiTools = await convertMCPToolsToAIFormat();
```

## Configuration

Set the MCP server URL in `.dev.vars`:
```env
MCP_SERVER_URL=https://my-mcp-server.devteam-d3a.workers.dev/sse
```

## API Endpoints

### GET /mcp-connect
Test connection and list available tools
```bash
curl http://localhost:8787/mcp-connect
```

Response:
```json
{
  "success": true,
  "message": "Connected to MCP server",
  "serverUrl": "https://...",
  "toolsAvailable": 5,
  "tools": [
    { "name": "tool1", "description": "..." }
  ]
}
```

## Deployment

To deploy with MCP support to Cloudflare Workers:

```bash
# Set the environment variable in Cloudflare
wrangler secret set MCP_SERVER_URL https://my-mcp-server.devteam-d3a.workers.dev/sse

# Deploy
npm run deploy
```

## Troubleshooting

**Connection refused?**
- Ensure the MCP server is running and accessible
- Check the MCP_SERVER_URL is correct

**CORS errors?**
- Ensure the MCP server has proper CORS headers configured
- Check network connectivity

**Tools not appearing?**
- Verify the MCP server is returning tools
- Check browser console for errors
- Review server logs

## Next Steps

1. **Read the full guide**: See `MCP_INTEGRATION.md`
2. **Explore examples**: Check `src/mcp-examples.ts` for patterns
3. **Test tools**: Use the `/mcp-connect` endpoint to see available tools
4. **Build features**: Integrate MCP tools into your agent logic

## Documentation Files

- **MCP_INTEGRATION.md** - Complete guide with API reference
- **src/mcp-client.ts** - Core implementation with comments
- **src/mcp-examples.ts** - Usage examples and patterns

## Support

For issues or questions:
1. Check the troubleshooting section in `MCP_INTEGRATION.md`
2. Review examples in `src/mcp-examples.ts`
3. Check server logs for detailed error messages
4. Verify MCP server configuration
