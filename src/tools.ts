/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  inputSchema: z.object({ city: z.string() })
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  }
});

// Example of a tool that requires confirmation
const searchDatabase = tool({
  description: "Search the database for user records",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().optional()
  })
  // No execute function = requires confirmation
});

// Example of an auto-executing tool
const getCurrentTime = tool({
  description: "Get current server time",
  inputSchema: z.object({}),
  execute: async () => new Date().toISOString()
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  }
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to cancel")
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  }
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
  getCurrentTime,
  searchDatabase
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
// export const executions = {
//   getWeatherInformation: async ({ city }: { city: string }) => {
//     console.log(`Getting weather information for ${city}`);
//     return `The weather in ${city} is sunny`;
//   }
// };

export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log("getWeatherInformation--->>> ", city);
    // Use WEATHERAPI_KEY env var (set locally in .dev.vars or via your deployment secrets)
    const apiKey = process.env.WEATHERAPI_KEY || process.env.WEATHER_API_KEY;
    if (!apiKey) {
      console.error("WEATHERAPI_KEY is not set");
      return "Weather API key is not configured. Please set the WEATHERAPI_KEY environment variable.";
    }

    const endpoint = `https://api.weatherapi.com/v1/current.json?key=${encodeURIComponent(
      apiKey
    )}&q=${encodeURIComponent(city)}&aqi=no`;

    try {
      const res = await fetch(endpoint);
      console.log("Weather API response status:", res.status);
      if (!res.ok) {
        const body = await res.text();
        console.error("Weather API error", res.status, body);
        return `Error fetching weather for ${city}: ${res.status} ${res.statusText}`;
      }
      type WeatherApiResponse = {
        location?: { name?: string; region?: string; country?: string };
        current?: {
          condition?: { text?: string };
          temp_c?: number;
          temp_f?: number;
          wind_kph?: number;
          humidity?: number;
          precip_mm?: number;
        };
      };

      const data = (await res.json()) as WeatherApiResponse;

      const loc = data.location
        ? `${data.location.name || city}${data.location.region ? `, ${data.location.region}` : ""}${data.location.country ? `, ${data.location.country}` : ""}`
        : city;

      const current = data.current || {};
      const condition = current.condition?.text || "Unknown";
      const tempC = current.temp_c !== undefined ? `${current.temp_c}°C` : "N/A";
      const tempF = current.temp_f !== undefined ? `${current.temp_f}°F` : "N/A";
      const windKph = current.wind_kph !== undefined ? `${current.wind_kph} kph` : "N/A";
      const humidity = current.humidity !== undefined ? `${current.humidity}%` : "N/A";
      const precip = current.precip_mm !== undefined ? `${current.precip_mm} mm` : "N/A";

      return `Current weather in ${loc}: ${condition}, ${tempC} (${tempF}). Wind ${windKph}, humidity ${humidity}, precipitation ${precip}.`;
    } catch (error) {
      console.error("Error fetching weather information", error);
      return `Error fetching weather information for ${city}: ${error}`;
    }
  },
  //  searchDatabase: async ({
  //   query,
  //   limit
  // }: {
  //   query: string;
  //   limit?: number;
  // }) => {
  //   // Implementation for when the tool is confirmed
  //   const results = await db.search(query, limit);
  //   return results;
  // }
};