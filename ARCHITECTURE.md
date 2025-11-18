# MCP Integration Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agents Starter Application                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Chat Agent (Cloudflare Workers)       │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │         onChatMessage Handler                      │ │  │
│  │  │                                                    │ │  │
│  │  │  • Process incoming messages                      │ │  │
│  │  │  • Merge local tools + MCP tools                  │ │  │
│  │  │  • Stream responses with AI model                 │ │  │
│  │  │  • Execute tool calls                             │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  │                         │                                │  │
│  │                         ▼                                │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │            Tool Execution Layer                    │ │  │
│  │  │                                                    │ │  │
│  │  │  ┌─────────────────┐  ┌──────────────────────┐   │ │  │
│  │  │  │  Local Tools    │  │  MCP Tools           │   │ │  │
│  │  │  │  • getWeather   │  │  (Dynamically Loaded)│   │ │  │
│  │  │  │  • getLocalTime │  │  from MCP Server     │   │ │  │
│  │  │  │  • search...    │  │  • tool1, tool2...   │   │ │  │
│  │  │  └─────────────────┘  └──────────────────────┘   │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  │                         │                                │  │
│  │                         ▼                                │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │    Message & Tool Processing (utils.ts)           │ │  │
│  │  │                                                    │ │  │
│  │  │  • cleanupMessages()                              │ │  │
│  │  │  • processToolCalls()                             │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘ │  │
│                         │                                       │
│                         ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              MCP Client Module                           │  │
│  │  (src/mcp-client.ts)                                     │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Core Functions                                 │  │  │
│  │  │  • connectToMCPServer(url)                      │  │  │
│  │  │  • listMCPTools()                               │  │  │
│  │  │  • callMCPTool(name, input)                     │  │  │
│  │  │  • getMCPClient()                               │  │  │
│  │  │  • convertMCPToolsToAIFormat()                  │  │  │
│  │  │  • disconnectMCPServer()                        │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                         │                               │  │
│  │                         ▼                               │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  SSE Transport Layer                            │  │  │
│  │  │  (SSEClientTransport from MCP SDK)              │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                         │                                       │
│                         ▼ HTTP/SSE                              │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ Server-Sent Events
                         │ Over HTTPS
                         │
                         ▼
        ┌─────────────────────────────────────┐
        │   MCP Server                        │
        │ (my-mcp-server.devteam-d3a...)     │
        │                                     │
        │  /sse endpoint                      │
        │  • Exposes tools                    │
        │  • Handles tool execution          │
        │  • Streams results                 │
        └─────────────────────────────────────┘
```

---

## Data Flow

### 1. User Message Flow

```
User Input
    │
    ▼
┌─────────────────────┐
│  Client (Browser)   │
│  app.tsx/client.tsx │
└─────────────────────┘
    │
    │ HTTP POST
    ▼
┌──────────────────────────┐
│  Cloudflare Workers      │
│  Agents Framework        │
│  routeAgentRequest()     │
└──────────────────────────┘
    │
    ▼ Chat endpoint
┌──────────────────────────────────┐
│  Chat.onChatMessage()            │
│  • Load tools (local + MCP)      │
│  • Process messages              │
│  • Call AI model                 │
└──────────────────────────────────┘
    │
    ├─── MCP Tool Call ─────────────────────────────┐
    │                                                 │
    ▼                                                 ▼
┌──────────────────────┐                   ┌────────────────────┐
│  Local Tool Execute  │                   │  MCP Tool Execute  │
│  (e.g., weather)     │                   │ (via SSE transport) │
└──────────────────────┘                   └────────────────────┘
    │                                           │
    └───────────┬────────────────────────────┬──┘
                │
                ▼
        ┌──────────────────┐
        │  Aggregate Result│
        │  Send to User    │
        └──────────────────┘
                │
                ▼
            Browser
```

### 2. MCP Connection Flow

```
Application Start
    │
    ▼
Environment Check
    │
    ├─ MCP_SERVER_URL loaded
    │
    ▼
User visits /mcp-connect
    │
    ▼
┌──────────────────────────────────┐
│  connectToMCPServer(serverUrl)   │
│  • Create SSEClientTransport     │
│  • Create MCP Client             │
│  • Call client.connect()         │
└──────────────────────────────────┘
    │
    ▼
SSE Connection to MCP Server
    │
    ├─ Success ──────┐
    │                 │
    │                 ▼
    │          ┌─────────────────┐
    │          │ Store Client    │
    │          │ Instance        │
    │          └─────────────────┘
    │                 │
    │                 ▼
    │          ┌──────────────────┐
    │          │ listMCPTools()   │
    │          │ Get tool list    │
    │          └──────────────────┘
    │                 │
    │                 ▼
    │          Return to User
    │
    └─ Failure ──────┐
                     │
                     ▼
              ┌──────────────────┐
              │ Log Error        │
              │ Return null      │
              │ Fallback Mode    │
              └──────────────────┘
```

### 3. Tool Execution Flow

```
Agent detects tool_use
    │
    ▼
┌─────────────────────────────────┐
│  Is tool local or MCP?          │
└─────────────────────────────────┘
    │
    ├─ Local Tool ────────────────┐
    │                              │
    │                              ▼
    │                       Execute locally
    │                       Get result
    │
    └─ MCP Tool ──────────────────┐
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │ callMCPTool()        │
                        │ • Prepare input      │
                        │ • Send via SSE       │
                        │ • Wait for response  │
                        └──────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │ MCP Server           │
                        │ • Execute tool       │
                        │ • Return result      │
                        └──────────────────────┘
                                   │
                                   ▼
                        Get result from stream
    │                              │
    └──────────────┬───────────────┘
                   │
                   ▼
        ┌─────────────────────────┐
        │ Process Tool Result     │
        │ Continue Agent Loop     │
        └─────────────────────────┘
                   │
                   ▼
        Send Result to User
```

---

## File Structure

```
agents-starter/
├── src/
│   ├── server.ts                    # Main server handler (MODIFIED)
│   │   └── Added /mcp-connect endpoint
│   │
│   ├── mcp-client.ts                # NEW - MCP client library
│   │   ├── connectToMCPServer()
│   │   ├── listMCPTools()
│   │   ├── callMCPTool()
│   │   ├── getMCPClient()
│   │   ├── convertMCPToolsToAIFormat()
│   │   └── disconnectMCPServer()
│   │
│   ├── mcp-examples.ts              # NEW - Usage examples
│   │   ├── exampleBasicConnection()
│   │   ├── exampleListTools()
│   │   ├── exampleExecuteTool()
│   │   ├── exampleIntegrateWithAISDK()
│   │   ├── exampleMonitorToolUsage()
│   │   ├── exampleErrorHandling()
│   │   ├── exampleClientStateManagement()
│   │   └── exampleServerIntegration()
│   │
│   ├── mcp-tests.ts                 # NEW - Test suite
│   │   ├── testConnection()
│   │   ├── testListTools()
│   │   ├── testGetClient()
│   │   ├── interactiveToolExecutor()
│   │   ├── healthCheck()
│   │   ├── performanceTest()
│   │   └── validateConfiguration()
│   │
│   ├── tools.ts                     # Existing local tools
│   ├── utils.ts                     # Existing utilities
│   ├── shared.ts                    # Existing shared code
│   ├── client.tsx                   # Existing client code
│   └── ...
│
├── .dev.vars                        # MODIFIED - Added MCP_SERVER_URL
│
├── package.json                     # MODIFIED - Added @modelcontextprotocol/sdk
│
├── MCP_INTEGRATION.md               # NEW - Complete documentation
├── MCP_QUICKSTART.md                # NEW - Quick start guide
└── IMPLEMENTATION_SUMMARY.md        # NEW - This summary
```

---

## Configuration & Environment

```
┌─────────────────────────────────────┐
│  Environment Setup                  │
│  (.dev.vars for local development)  │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Configuration Variables:           │
│  • MCP_SERVER_URL                   │
│  • OPENAI_API_KEY                   │
│  • GATEWAY_BASE_URL                 │
│  • OPENAI_MODEL                     │
│  • MCP_PROXY_AUTH_TOKEN             │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Runtime                            │
│  • Load environment variables       │
│  • Initialize MCP client if needed  │
│  • Start agent                      │
└─────────────────────────────────────┘
```

---

## Error Handling Strategy

```
┌──────────────────────────┐
│  Error Occurs            │
└──────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│  Error Type?                         │
└──────────────────────────────────────┘
        │
        ├─ Connection Error
        │      │
        │      ▼
        │  ┌────────────────────────┐
        │  │ Log error              │
        │  │ Return null            │
        │  │ Fallback to local only │
        │  └────────────────────────┘
        │
        ├─ Tool Execution Error
        │      │
        │      ▼
        │  ┌────────────────────────┐
        │  │ Retry with backoff     │
        │  │ (up to 3 attempts)     │
        │  │ Log all attempts       │
        │  │ Return error to user   │
        │  └────────────────────────┘
        │
        └─ Unknown Error
               │
               ▼
            ┌────────────────────────┐
            │ Catch as generic error │
            │ Log full stack         │
            │ Return to user         │
            │ Suggest debugging      │
            └────────────────────────┘
```

---

## Deployment Architecture

```
Development
    │
    ├─ .dev.vars (local env)
    │
    ├─ npm run start
    │
    └─ http://localhost:8787
        (Vite dev server)


Production (Cloudflare Workers)
    │
    ├─ wrangler secret set MCP_SERVER_URL ...
    │
    ├─ npm run deploy
    │
    └─ https://your-domain.workers.dev
        (Production endpoint)


MCP Server
    │
    ├─ Hosted at /sse endpoint
    │
    └─ Accessible via HTTPS/SSE
        (No CORS required for Workers)
```

---

## Security Model

```
┌────────────────────────────────────────┐
│  Security Layers                       │
└────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────┐
│  1. Environment Isolation              │
│     • MCP_SERVER_URL in secrets        │
│     • API Keys stored securely         │
│     • No secrets in code               │
└────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────┐
│  2. HTTPS/TLS                          │
│     • SSE over HTTPS only              │
│     • Encrypted in transit             │
│     • Certificate validation           │
└────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────┐
│  3. Tool Authorization                 │
│     • Validate tool names              │
│     • Validate input schemas           │
│     • Check tool existence             │
└────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────┐
│  4. Error Handling                     │
│     • No sensitive info in errors      │
│     • Graceful degradation             │
│     • Fallback to local tools          │
└────────────────────────────────────────┘
```

---

## Performance Optimization

```
┌──────────────────────────────┐
│  Performance Strategies      │
└──────────────────────────────┘
        │
        ├─ Connection Pooling
        │  └─ Reuse MCP client instance
        │
        ├─ Lazy Loading
        │  └─ Connect on first use
        │
        ├─ Caching
        │  └─ Cache tool list
        │
        ├─ Parallel Execution
        │  └─ Run tools concurrently
        │
        ├─ Error Backoff
        │  └─ Exponential backoff on retry
        │
        └─ Resource Management
           └─ Clean disconnect on shutdown
```

This architecture ensures:
- ✅ Scalability
- ✅ Reliability
- ✅ Security
- ✅ Performance
- ✅ Maintainability
