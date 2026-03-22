import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { appendFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const LOG_FILE = join(dirname(fileURLToPath(import.meta.url)), "api.log");

async function logCall(fullUrl: string): Promise<void> {
  const line = `${new Date().toISOString()} ${fullUrl}\n`;
  await appendFile(LOG_FILE, line);
}

const API_KEY = process.env.THINGNARIO_API_KEY;

if (!API_KEY) {
  console.error("Missing required environment variable: THINGNARIO_API_KEY");
  process.exit(1);
}

const BASE = "https://api.thingnario.com/v2";

async function thingnarioGet(
  url: string,
  params: Record<string, string | undefined> = {}
): Promise<unknown> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.set(key, value);
  }
  const fullUrl = searchParams.toString() ? `${url}?${searchParams}` : url;
  await logCall(fullUrl);
  const res = await fetch(fullUrl, {
    headers: { "X-API-Key": API_KEY! },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Thingnario API error ${res.status}: ${text}`);
  }
  return res.json();
}

function toText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const server = new McpServer({
  name: "thingnario",
  version: "1.0.0",
});

// ── Plants ────────────────────────────────────────────────────────────────────

server.registerTool(
  "get-plants",
  {
    description: "List all solar plants accessible to the authenticated account.",
    inputSchema: {},
  },
  async () => {
    const data = await thingnarioGet(`${BASE}/plants`);
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

server.registerTool(
  "get-plant",
  {
    description: "Get detailed static information for a single solar plant.",
    inputSchema: {
      plant_no: z.string().describe("Plant identifier number, e.g. 'DEMO-01'"),
    },
  },
  async ({ plant_no }) => {
    const data = await thingnarioGet(`${BASE}/plants/${plant_no}`);
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

server.registerTool(
  "get-plants-summary",
  {
    description:
      "Get a summary (current status, daily/monthly production totals) for one or more plants. " +
      "plant_nos accepts a comma-separated list of up to 256 plant numbers.",
    inputSchema: {
      plant_nos: z
        .string()
        .describe("Comma-separated plant numbers, e.g. 'DEMO-01,DEMO-02' (max 256)"),
    },
  },
  async ({ plant_nos }) => {
    const data = await thingnarioGet(`${BASE}/plants/${plant_nos}/summary`);
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

// ── Plant / Device Data ───────────────────────────────────────────────────────

server.registerTool(
  "get-plant-data",
  {
    description:
      "Get histogram/time-series data for a single plant. " +
      "Constraints: intra-day intervals (live/1m/5m/15m/30m) max 7-day span; " +
      "historical raw data max 10-min span; max 30-day lookback.",
    inputSchema: {
      plant_no: z.string().describe("Plant number, e.g. 'DEMO-01'"),
      time_start: z
        .string()
        .describe("Start of time range in ISO-8601 format, e.g. '2026-03-01T00:00:00+08:00'"),
      time_end: z
        .string()
        .describe("End of time range in ISO-8601 format, e.g. '2026-03-17T23:59:59+08:00'"),
      interval: z
        .enum(["live", "1m", "5m", "15m", "30m", "1h", "1d", "1M"])
        .describe(
          "Data resolution: live, 1m, 5m, 15m, 30m, 1h, 1d, or 1M. " +
            "Intra-day intervals require time span ≤ 7 days."
        ),
    },
  },
  async ({ plant_no, time_start, time_end, interval }) => {
    const data = await thingnarioGet(`${BASE}/plants/${plant_no}/data`, {
      time_start,
      time_end,
      interval,
    });
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

server.registerTool(
  "get-inverter-data",
  {
    description:
      "Get histogram/time-series data for one or more inverter devices. " +
      "device_nos accepts a comma-separated list. " +
      "Same time-range constraints as get-plant-data.",
    inputSchema: {
      device_nos: z
        .string()
        .describe("Comma-separated inverter device numbers, e.g. 'INV001,INV002'"),
      time_start: z.string().describe("Start of time range in ISO-8601 format"),
      time_end: z.string().describe("End of time range in ISO-8601 format"),
      interval: z
        .enum(["live", "1m", "5m", "15m", "30m", "1h", "1d", "1M"])
        .describe("Data resolution interval"),
    },
  },
  async ({ device_nos, time_start, time_end, interval }) => {
    const data = await thingnarioGet(`${BASE}/inverters/${device_nos}/data`, {
      time_start,
      time_end,
      interval,
    });
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

server.registerTool(
  "get-meter-data",
  {
    description:
      "Get histogram/time-series data for one or more meter devices. " +
      "Same time-range and interval constraints as get-plant-data.",
    inputSchema: {
      device_nos: z.string().describe("Comma-separated meter device numbers"),
      time_start: z.string().describe("Start of time range in ISO-8601 format"),
      time_end: z.string().describe("End of time range in ISO-8601 format"),
      interval: z
        .enum(["live", "1m", "5m", "15m", "30m", "1h", "1d", "1M"])
        .describe("Data resolution interval"),
    },
  },
  async ({ device_nos, time_start, time_end, interval }) => {
    const data = await thingnarioGet(`${BASE}/meters/${device_nos}/data`, {
      time_start,
      time_end,
      interval,
    });
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

server.registerTool(
  "get-stringmeter-data",
  {
    description:
      "Get histogram/time-series data for one or more string meter devices. " +
      "Same time-range and interval constraints as get-plant-data.",
    inputSchema: {
      device_nos: z.string().describe("Comma-separated string meter device numbers"),
      time_start: z.string().describe("Start of time range in ISO-8601 format"),
      time_end: z.string().describe("End of time range in ISO-8601 format"),
      interval: z
        .enum(["live", "1m", "5m", "15m", "30m", "1h", "1d", "1M"])
        .describe("Data resolution interval"),
    },
  },
  async ({ device_nos, time_start, time_end, interval }) => {
    const data = await thingnarioGet(`${BASE}/stringmeters/${device_nos}/data`, {
      time_start,
      time_end,
      interval,
    });
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

// ── Events ────────────────────────────────────────────────────────────────────

server.registerTool(
  "get-plant-events",
  {
    description:
      "Get events (alarms, status changes) for one or more plants within a time range.",
    inputSchema: {
      plant_nos: z
        .string()
        .describe("Comma-separated plant numbers, e.g. 'DEMO-01,DEMO-02'"),
      time_start: z.string().describe("Start of time range in ISO-8601 format"),
      time_end: z.string().describe("End of time range in ISO-8601 format"),
    },
  },
  async ({ plant_nos, time_start, time_end }) => {
    const data = await thingnarioGet(`${BASE}/plants/${plant_nos}/events`, {
      time_start,
      time_end,
    });
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

// ── Tickets ───────────────────────────────────────────────────────────────────

server.registerTool(
  "get-tickets",
  {
    description: "List all maintenance/support tickets.",
    inputSchema: {},
  },
  async () => {
    const data = await thingnarioGet(`${BASE}/tickets`);
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

server.registerTool(
  "get-ticket-items",
  {
    description:
      "Get the line items / detail records for one or more tickets. " +
      "ticket_ids accepts a comma-separated list.",
    inputSchema: {
      ticket_ids: z
        .string()
        .describe("Comma-separated ticket IDs, e.g. 'T001,T002'"),
    },
  },
  async ({ ticket_ids }) => {
    const data = await thingnarioGet(`${BASE}/tickets/${ticket_ids}/items`);
    return { content: [{ type: "text", text: toText(data) }] };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
