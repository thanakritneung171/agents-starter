import { type ToolSet } from "ai";

/**
 * Generate a system prompt for tool calling with Workers AI
 * Includes instructions for the model to use tools in a structured format
 */
export function generateToolCallingSystemPrompt(
  allTools: ToolSet,
  baseSystemPrompt: string
): string {
  const toolList = Object.entries(allTools)
    .map(([name, tool]) => {
      const description = (tool as any).description || "No description";
      const schema = (tool as any).inputSchema ? JSON.stringify((tool as any).inputSchema, null, 2) : "{}";
      return `
<tool name="${name}">
  <description>${description}</description>
  <input_schema>
${schema.split('\n').map(line => '    ' + line).join('\n')}
  </input_schema>
</tool>`;
    })
    .join("\n");

  return `${baseSystemPrompt}

You have access to the following tools:
${toolList}

When you need to use a tool, format your response with the following XML structure:
<tool_use>
  <invoke name="tool_name">
    <parameter name="param1">value1</parameter>
    <parameter name="param2">value2</parameter>
  </invoke>
</tool_use>

You can call multiple tools in sequence. After each tool call, you will receive the result, and you can call more tools if needed.
Always respond in the same language as the user's input. If the user writes in Thai, respond in Thai. If the user writes in English, respond in English.`;
}

/**
 * Interface for parsed tool calls
 */
interface ToolCall {
  name: string;
  parameters: Record<string, any>;
}

/**
 * Parse tool calls from model response
 * Looks for XML structured tool invocations
 */
export function parseToolCalls(response: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  
  // Match <tool_use> blocks with <invoke name="..."> inside
  const toolUsePattern = /<tool_use>([\s\S]*?)<\/tool_use>/g;
  const invokePattern = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/;
  const paramPattern = /<parameter\s+name="([^"]+)">([^<]*)<\/parameter>/g;
  
  let match;
  while ((match = toolUsePattern.exec(response)) !== null) {
    const toolUseContent = match[1];
    const invokeMatch = invokePattern.exec(toolUseContent);
    
    if (invokeMatch) {
      const toolName = invokeMatch[1];
      const paramContent = invokeMatch[2];
      
      const parameters: Record<string, any> = {};
      let paramMatch;
      while ((paramMatch = paramPattern.exec(paramContent)) !== null) {
        const paramName = paramMatch[1];
        const paramValue = paramMatch[2];
        
        // Try to parse as JSON, otherwise use as string
        try {
          parameters[paramName] = JSON.parse(paramValue);
        } catch {
          parameters[paramName] = paramValue;
        }
      }
      
      toolCalls.push({
        name: toolName,
        parameters,
      });
    }
  }
  
  return toolCalls;
}

/**
 * Execute tool calls from the parsed tool list
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  allTools: ToolSet
): Promise<Array<{ toolName: string; result: string }>> {
  const results: Array<{ toolName: string; result: string }> = [];
  
  for (const call of toolCalls) {
    const tool = (allTools as any)[call.name];
    
    if (!tool) {
      results.push({
        toolName: call.name,
        result: `Error: Tool "${call.name}" not found`,
      });
      continue;
    }
    
    if (typeof tool.execute !== "function") {
      results.push({
        toolName: call.name,
        result: `Tool "${call.name}" exists but requires confirmation from user`,
      });
      continue;
    }
    
    try {
      const result = await tool.execute(call.parameters, {});
      results.push({
        toolName: call.name,
        result: typeof result === "string" ? result : JSON.stringify(result),
      });
    } catch (error) {
      results.push({
        toolName: call.name,
        result: `Error executing "${call.name}": ${(error as Error).message}`,
      });
    }
  }
  
  return results;
}

/**
 * Remove tool calls from response text
 */
export function removeToolCallsFromResponse(response: string): string {
  return response.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, "").trim();
}

/**
 * Build a prompt for the next iteration with tool results
 */
export function buildToolResultsPrompt(
  results: Array<{ toolName: string; result: string }>,
  previousResponse: string
): string {
  if (results.length === 0) {
    return `${previousResponse}\n\nNo tools were used.`;
  }
  
  const resultsList = results
    .map((r) => `<tool_result name="${r.toolName}">\n${r.result}\n</tool_result>`)
    .join("\n\n");
  
  return `${previousResponse}

Tool results:
${resultsList}

Based on these tool results, please provide your final answer. Continue to use tools if needed.`;
}
