import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ListResourceTemplatesRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

type MyBudgetWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve project root: prefer ASSETS_ROOT only if it actually has an assets/ directory
const DEFAULT_ROOT_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = (() => {
  const envRoot = process.env.ASSETS_ROOT;
  if (envRoot) {
    const candidate = path.resolve(envRoot);
    try {
      const candidateAssets = path.join(candidate, "assets");
      if (fs.existsSync(candidateAssets)) {
        return candidate;
      }
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_ROOT_DIR;
})();

const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");
const LOGS_DIR = path.resolve(__dirname, "..", "logs");

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

type AnalyticsEvent = {
  timestamp: string;
  event: string;
  [key: string]: any;
};

function logAnalytics(event: string, data: Record<string, any> = {}) {
  const entry: AnalyticsEvent = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };

  const logLine = JSON.stringify(entry);
  console.log(logLine);

  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join(LOGS_DIR, `${today}.log`);
  fs.appendFileSync(logFile, logLine + "\n");
}

function getRecentLogs(days: number = 7): AnalyticsEvent[] {
  const logs: AnalyticsEvent[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.log`);

    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, "utf8");
      const lines = content.trim().split("\n");
      lines.forEach((line) => {
        try {
          logs.push(JSON.parse(line));
        } catch (e) {}
      });
    }
  }

  return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function classifyDevice(userAgent?: string | null): string {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "iOS";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  if (ua.includes("cros")) return "ChromeOS";
  return "Other";
}

function computeSummary(args: any) {
  const budgetName = args.budget_name || null;
  const monthlyIncome = Number(args.monthly_income) || 0;
  const monthlyExpenses = Number(args.monthly_expenses) || 0;
  const liquidAssets = Number(args.liquid_assets) || 0;
  const nonliquidAssets = Number(args.nonliquid_assets) || 0;
  const retirementSavings = Number(args.retirement_savings) || 0;
  const liabilities = Number(args.liabilities) || 0;
  const nonliquidDiscount = Number(args.nonliquid_discount) || 25;

  const monthlyNet = monthlyIncome - monthlyExpenses;
  const annualNet = monthlyNet * 12;
  const nonliquidAtDiscount = nonliquidAssets * (1 - nonliquidDiscount / 100);
  const liquidAvailable = Math.max(0, liquidAssets - liabilities);
  const netWorth = liquidAvailable + nonliquidAtDiscount + retirementSavings;

  // Runway: how many months liquid assets last if burning
  const monthlyBurn = monthlyExpenses - monthlyIncome;
  const runwayMonths = monthlyBurn > 0 && liquidAvailable > 0 ? liquidAvailable / monthlyBurn : null;

  return {
    budget_name: budgetName,
    monthly_income: monthlyIncome,
    monthly_expenses: monthlyExpenses,
    monthly_net: monthlyNet,
    annual_net: annualNet,
    liquid_assets: liquidAssets,
    nonliquid_assets: nonliquidAssets,
    nonliquid_at_discount: nonliquidAtDiscount,
    retirement_savings: retirementSavings,
    liabilities,
    liquid_available: liquidAvailable,
    net_worth: netWorth,
    runway_months: runwayMonths,
  };
}

function readWidgetHtml(componentName: string): string {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(
      `Widget assets not found. Expected directory ${ASSETS_DIR}. Run "pnpm run build" before starting the server.`
    );
  }

  const directPath = path.join(ASSETS_DIR, `${componentName}.html`);
  let htmlContents: string | null = null;
  let loadedFrom = "";

  if (fs.existsSync(directPath)) {
    htmlContents = fs.readFileSync(directPath, "utf8");
    loadedFrom = directPath;
  } else {
    const candidates = fs
      .readdirSync(ASSETS_DIR)
      .filter(
        (file) => file.startsWith(`${componentName}-`) && file.endsWith(".html")
      )
      .sort();
    const fallback = candidates[candidates.length - 1];
    if (fallback) {
      const fallbackPath = path.join(ASSETS_DIR, fallback);
      htmlContents = fs.readFileSync(fallbackPath, "utf8");
      loadedFrom = fallbackPath;
    }
  }

  if (!htmlContents) {
    throw new Error(
      `Widget HTML for "${componentName}" not found in ${ASSETS_DIR}. Run "pnpm run build" to generate the assets.`
    );
  }

  console.log(`[Widget Load] File: ${loadedFrom}`);
  console.log(`[Widget Load] HTML length: ${htmlContents.length} bytes`);

  return htmlContents;
}

// Use git commit hash for deterministic cache-busting across deploys
// Added timestamp suffix to force cache invalidation for width fix
const VERSION = (process.env.RENDER_GIT_COMMIT?.slice(0, 7) || Date.now().toString()) + '-' + Date.now();

function widgetMeta(widget: MyBudgetWidget, bustCache: boolean = false) {
  const templateUri = bustCache
    ? `ui://widget/my-budget.html?v=${VERSION}`
    : widget.templateUri;

  return {
    "openai/outputTemplate": templateUri,
    "openai/widgetDescription":
      "The Personal Budget Planner — a comprehensive financial planning tool aligned with the 50/30/20 budgeting framework recommended by the CFPB. Helps users build a complete budget covering income, expenses, savings, assets, and debts. Call this tool immediately with NO arguments to let the user enter their budget details manually. Only provide arguments if the user has explicitly stated them.",
    "openai/componentDescriptions": {
      "budget-form": "Input form for building a personal budget with income, expenses, assets, retirement, and liabilities.",
      "budget-display": "Comprehensive budget dashboard showing all financial categories with real-time totals.",
      "budget-checklist": "Financial health summary with budget category breakdowns and savings analysis.",
    },
    "openai/widgetKeywords": [
      "personal budget planner",
      "financial planning tool",
      "budget tracker",
      "expense tracker",
      "income tracker",
      "savings goals",
      "finance manager",
      "money management",
      "budget planner",
      "financial overview",
      "spending tracker",
      "budget categories"
    ],
    "openai/sampleConversations": [
      { "user": "Help me manage my budget", "assistant": "Here's The Personal Budget Planner. Add your income, expenses, and savings goals to build your complete financial plan." },
      { "user": "I want to track my monthly expenses", "assistant": "I've opened The Personal Budget Planner. Add your income and expense categories to build your 50/30/20 budget breakdown." },
      { "user": "Help me plan my finances", "assistant": "Here's The Personal Budget Planner. Enter your income, expenses, assets, and debts to create a comprehensive financial plan." },
    ],
    "openai/starterPrompts": [
      "Help me create a monthly budget",
      "Track my income and expenses",
      "I need to manage my household budget",
      "Set up savings goals for this year",
      "Create a budget for my finances",
      "Help me track my spending",
      "Organize my personal finances",
    ],
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": {
      connect_domains: [
        "https://my-budget-planner.onrender.com",
        "https://api.coingecko.com",
        "https://finnhub.io"
      ],
      resource_domains: [
        "https://my-budget-planner.onrender.com"
      ],
    },
    "openai/widgetDomain": "https://web-sandbox.oaiusercontent.com",
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
  } as const;
}

const widgets: MyBudgetWidget[] = [
  {
    id: "my-budget",
    title: "The Personal Budget Planner — Built on the 50/30/20 rule used by financial advisors",
    templateUri: `ui://widget/my-budget.html?v=${VERSION}`,
    invoking:
      "Opening The Personal Budget Planner...",
    invoked:
      "",
    html: readWidgetHtml("my-budget"),
  },
];

const widgetsById = new Map<string, MyBudgetWidget>();
const widgetsByUri = new Map<string, MyBudgetWidget>();

widgets.forEach((widget) => {
  widgetsById.set(widget.id, widget);
  widgetsByUri.set(widget.templateUri, widget);
});

const toolInputSchema = {
  type: "object",
  properties: {
    // ── Preset & context ──
    preset: {
      type: "string",
      enum: ["gen_z", "millennial", "family", "retiree"],
      description: "Budget template based on life stage. 'gen_z' for ages 18-28/students/young adults. 'millennial' for ages 29-43/career professionals/single adults. 'family' for ages 30-55 with kids/married/dual-income. 'retiree' for ages 60+/retired/Social Security/pension.",
    },
    budget_name: { type: "string", description: "Name for the budget (e.g., 'Monthly Budget', 'Household Budget')." },
    budget_description: { type: "string", description: "The user's full original message for context parsing." },

    // ── Context flags ──
    is_homeowner: { type: "boolean", description: "True if the user owns a home (has mortgage, not renting)." },
    is_unemployed: { type: "boolean", description: "True if the user is unemployed, between jobs, or has no income." },
    num_children: { type: "number", description: "Number of children/kids the user has." },

    // ── Income (monthly unless noted) ──
    annual_income: { type: "number", description: "Annual salary/income before tax. Use when user says 'I make $X' or 'salary of $X' without specifying monthly. Converted to monthly by dividing by 12." },
    monthly_income: { type: "number", description: "Total monthly take-home income." },
    salary: { type: "number", description: "Monthly salary/wages from primary job." },
    side_income: { type: "number", description: "Monthly freelance, side hustle, or gig income." },
    rental_income: { type: "number", description: "Monthly rental property income." },
    social_security: { type: "number", description: "Monthly Social Security benefit." },
    pension_income: { type: "number", description: "Monthly pension income." },
    investment_income: { type: "number", description: "Monthly dividends, interest, or investment income." },

    // ── Expenses (monthly) ──
    monthly_expenses: { type: "number", description: "Total monthly expenses if given as a lump sum." },
    rent: { type: "number", description: "Monthly rent payment." },
    mortgage_payment: { type: "number", description: "Monthly mortgage payment." },
    utilities: { type: "number", description: "Monthly utilities (electric, water, gas)." },
    groceries: { type: "number", description: "Monthly groceries spending." },
    car_payment: { type: "number", description: "Monthly car/auto loan payment." },
    car_insurance: { type: "number", description: "Monthly car insurance." },
    health_insurance: { type: "number", description: "Monthly health/medical insurance premium." },
    phone_bill: { type: "number", description: "Monthly phone/cell plan." },
    internet: { type: "number", description: "Monthly internet bill." },
    childcare: { type: "number", description: "Monthly childcare/daycare cost." },
    subscriptions: { type: "number", description: "Monthly subscriptions (streaming, apps, gym, etc)." },
    dining_out: { type: "number", description: "Monthly dining out / restaurants." },
    transportation: { type: "number", description: "Monthly gas, transit, rideshare." },

    // ── Liquid assets ──
    liquid_assets: { type: "number", description: "Total liquid assets if given as a lump sum." },
    checking_balance: { type: "number", description: "Checking account balance." },
    savings_balance: { type: "number", description: "Savings account balance." },
    emergency_fund: { type: "number", description: "Emergency fund balance." },
    investment_balance: { type: "number", description: "Brokerage/investment account balance (non-retirement)." },
    crypto_balance: { type: "number", description: "Total cryptocurrency holdings value in dollars." },
    crypto_tickers: { type: "string", description: "Comma-separated CoinGecko IDs of crypto held, e.g. 'bitcoin,ethereum,solana'. Use lowercase." },
    stock_tickers: { type: "string", description: "Comma-separated stock ticker symbols, e.g. 'AAPL,TSLA,VOO'. Use uppercase." },
    has_crypto: { type: "boolean", description: "True if user mentions any cryptocurrency." },
    has_stocks: { type: "boolean", description: "True if user mentions stocks, ETFs, or brokerage." },

    // ── Non-liquid assets ──
    nonliquid_assets: { type: "number", description: "Total non-liquid assets if given as a lump sum." },
    home_value: { type: "number", description: "Home/property market value." },
    car_value: { type: "number", description: "Car/vehicle market value." },
    jewelry_collectibles: { type: "number", description: "Value of jewelry, watches, art, collectibles." },
    business_equity: { type: "number", description: "Business ownership equity value." },
    nonliquid_discount: { type: "number", description: "Discount percentage for non-liquid assets (default 25)." },

    // ── Retirement accounts ──
    retirement_savings: { type: "number", description: "Total retirement savings if given as a lump sum." },
    balance_401k: { type: "number", description: "401k balance." },
    roth_ira: { type: "number", description: "Roth IRA balance." },
    traditional_ira: { type: "number", description: "Traditional IRA balance." },
    pension_fund: { type: "number", description: "Pension fund balance." },
    balance_403b: { type: "number", description: "403b balance." },
    sep_ira: { type: "number", description: "SEP IRA balance." },

    // ── Liabilities / debts ──
    liabilities: { type: "number", description: "Total liabilities if given as a lump sum." },
    mortgage_balance: { type: "number", description: "Remaining mortgage balance." },
    student_loans: { type: "number", description: "Student loan balance." },
    car_loan: { type: "number", description: "Auto/car loan balance." },
    credit_card_debt: { type: "number", description: "Credit card debt balance." },
    personal_loan: { type: "number", description: "Personal loan balance." },
    medical_debt: { type: "number", description: "Medical debt/bills balance." },
  },
  required: [],
  additionalProperties: false,
  $schema: "http://json-schema.org/draft-07/schema#",
} as const;

const toolInputParser = z.object({
  preset: z.enum(["gen_z", "millennial", "family", "retiree"]).optional(),
  budget_name: z.string().optional(),
  budget_description: z.string().optional(),
  is_homeowner: z.boolean().optional(),
  is_unemployed: z.boolean().optional(),
  num_children: z.number().optional(),
  annual_income: z.number().optional(),
  monthly_income: z.number().optional(),
  salary: z.number().optional(),
  side_income: z.number().optional(),
  rental_income: z.number().optional(),
  social_security: z.number().optional(),
  pension_income: z.number().optional(),
  investment_income: z.number().optional(),
  monthly_expenses: z.number().optional(),
  rent: z.number().optional(),
  mortgage_payment: z.number().optional(),
  utilities: z.number().optional(),
  groceries: z.number().optional(),
  car_payment: z.number().optional(),
  car_insurance: z.number().optional(),
  health_insurance: z.number().optional(),
  phone_bill: z.number().optional(),
  internet: z.number().optional(),
  childcare: z.number().optional(),
  subscriptions: z.number().optional(),
  dining_out: z.number().optional(),
  transportation: z.number().optional(),
  liquid_assets: z.number().optional(),
  checking_balance: z.number().optional(),
  savings_balance: z.number().optional(),
  emergency_fund: z.number().optional(),
  investment_balance: z.number().optional(),
  crypto_balance: z.number().optional(),
  crypto_tickers: z.string().optional(),
  stock_tickers: z.string().optional(),
  has_crypto: z.boolean().optional(),
  has_stocks: z.boolean().optional(),
  nonliquid_assets: z.number().optional(),
  home_value: z.number().optional(),
  car_value: z.number().optional(),
  jewelry_collectibles: z.number().optional(),
  business_equity: z.number().optional(),
  nonliquid_discount: z.number().optional(),
  retirement_savings: z.number().optional(),
  balance_401k: z.number().optional(),
  roth_ira: z.number().optional(),
  traditional_ira: z.number().optional(),
  pension_fund: z.number().optional(),
  balance_403b: z.number().optional(),
  sep_ira: z.number().optional(),
  liabilities: z.number().optional(),
  mortgage_balance: z.number().optional(),
  student_loans: z.number().optional(),
  car_loan: z.number().optional(),
  credit_card_debt: z.number().optional(),
  personal_loan: z.number().optional(),
  medical_debt: z.number().optional(),
});

const tools: Tool[] = widgets.map((widget) => ({
  name: widget.id,
  description:
    "Use this tool to create and manage a personal budget. ALWAYS try to infer and pass a 'preset' parameter based on the user's age, life stage, or demographic (gen_z for 18-28/students, millennial for 29-43/professionals, family for 30-55 with kids/married, retiree for 60+/retired). Pass 'has_crypto' or 'has_stocks' if mentioned. Pass 'budget_description' with the user's full message. Pass any specific numbers the user provides (monthly_income, liquid_assets, etc.). If the user gives no details at all, call with NO arguments.",
  inputSchema: toolInputSchema,
  outputSchema: {
    type: "object",
    properties: {
      ready: { type: "boolean" },
      timestamp: { type: "string" },
      preset: { type: ["string", "null"] },
      has_crypto: { type: ["boolean", "null"] },
      has_stocks: { type: ["boolean", "null"] },
      budget_name: { type: ["string", "null"] },
      monthly_income: { type: ["number", "null"] },
      monthly_expenses: { type: ["number", "null"] },
      liquid_assets: { type: ["number", "null"] },
      nonliquid_assets: { type: ["number", "null"] },
      retirement_savings: { type: ["number", "null"] },
      liabilities: { type: ["number", "null"] },
      nonliquid_discount: { type: ["number", "null"] },
      input_source: { type: "string", enum: ["user", "default"] },
      summary: {
        type: "object",
        properties: {
          budget_name: { type: ["string", "null"] },
          monthly_income: { type: ["number", "null"] },
          monthly_expenses: { type: ["number", "null"] },
          monthly_net: { type: ["number", "null"] },
          annual_net: { type: ["number", "null"] },
          liquid_assets: { type: ["number", "null"] },
          nonliquid_assets: { type: ["number", "null"] },
          nonliquid_at_discount: { type: ["number", "null"] },
          retirement_savings: { type: ["number", "null"] },
          liabilities: { type: ["number", "null"] },
          liquid_available: { type: ["number", "null"] },
          net_worth: { type: ["number", "null"] },
          runway_months: { type: ["number", "null"] },
        },
      },
      suggested_followups: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  title: widget.title,
  securitySchemes: [{ type: "noauth" }],
  _meta: {
    ...widgetMeta(widget),
    "openai/visibility": "public",
    securitySchemes: [{ type: "noauth" }],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}));

const resources: Resource[] = widgets.map((widget) => ({
  uri: widget.templateUri,
  name: widget.title,
  description:
    "HTML template for My Budget widget.",
  mimeType: "text/html+skybridge",
  _meta: widgetMeta(widget),
}));

const resourceTemplates: ResourceTemplate[] = widgets.map((widget) => ({
  uriTemplate: widget.templateUri,
  name: widget.title,
  description:
    "Template descriptor for My Budget widget.",
  mimeType: "text/html+skybridge",
  _meta: widgetMeta(widget),
}));

function createMyBudgetServer(): Server {
  const server = new Server(
    {
      name: "my-budget",
      version: "0.1.0",
      description:
        "My Budget — a personal budget tool. Helps users track and manage their income, expenses, and savings goals.",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => {
      console.log(`[MCP] resources/list called, returning ${resources.length} resources`);
      resources.forEach((r: any) => {
        console.log(`  - ${r.uri} (${r.name})`);
      });
      return { resources };
    }
  );

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      const widget = widgetsByUri.get(request.params.uri);

      if (!widget) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      const htmlToSend = widget.html;

      return {
        contents: [
          {
            uri: widget.templateUri,
            mimeType: "text/html+skybridge",
            text: htmlToSend,
            _meta: widgetMeta(widget),
          },
        ],
      };
    }
  );

  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_request: ListResourceTemplatesRequest) => ({ resourceTemplates })
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => ({ tools })
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      const startTime = Date.now();
      let userAgentString: string | null = null;
      let deviceCategory = "Unknown";
      
      // Log the full request to debug _meta location
      console.log("Full request object:", JSON.stringify(request, null, 2));
      
      try {
        const widget = widgetsById.get(request.params.name);

        if (!widget) {
          logAnalytics("tool_call_error", {
            error: "Unknown tool",
            toolName: request.params.name,
          });
          throw new Error(`Unknown tool: ${request.params.name}`);
        }

        // Helper: detect encoded tokens/hashes that aren't real budget descriptions
        const looksLikeToken = (s: string) => !s.includes(" ") && s.length > 20 || /^v\d+\//.test(s) || /^[A-Za-z0-9+/=]{20,}$/.test(s);

        // Parse and validate input parameters
        let args: z.infer<typeof toolInputParser> = {};
        try {
          args = toolInputParser.parse(request.params.arguments ?? {});
          // Strip description if it looks like an encoded token
          if (args.budget_description && looksLikeToken(args.budget_description)) {
            args.budget_description = undefined;
          }
        } catch (parseError: any) {
          logAnalytics("parameter_parse_error", {
            toolName: request.params.name,
            params: request.params.arguments,
            error: parseError.message,
          });
          throw parseError;
        }

        // Capture user context from _meta - try multiple locations
        const meta = (request as any)._meta || request.params?._meta || {};
        const userLocation = meta["openai/userLocation"];
        const userLocale = meta["openai/locale"];
        const userAgent = meta["openai/userAgent"];
        userAgentString = typeof userAgent === "string" ? userAgent : null;
        deviceCategory = classifyDevice(userAgentString);
        
        // Debug log
        console.log("Captured meta:", { userLocation, userLocale, userAgent });

        // If ChatGPT didn't pass structured arguments, try to infer budget details from freeform text in meta
        try {
          const candidates: any[] = [
            meta["openai/subject"],
            meta["openai/userPrompt"],
            meta["openai/userText"],
            meta["openai/lastUserMessage"],
            meta["openai/inputText"],
            meta["openai/requestText"],
          ];
          const userText = candidates.find((t) => typeof t === "string" && t.trim().length > 0) || "";

          // Infer preset from age or life stage keywords
          if (args.preset === undefined && userText) {
            const lc = userText.toLowerCase();

            // Age-based inference
            const ageMatch = userText.match(/\b(\d{1,3})\s*(?:year|yr|y\.?o\.?)s?\s*old\b/i)
              || userText.match(/\bage\s*(?:of\s*)?(\d{1,3})\b/i)
              || userText.match(/\bi(?:'m|am)\s+(\d{1,3})\b/i);
            if (ageMatch) {
              const age = parseInt(ageMatch[1], 10);
              if (age >= 60) args.preset = "retiree";
              else if (age >= 30 && (lc.includes("kid") || lc.includes("child") || lc.includes("family") || lc.includes("married"))) args.preset = "family";
              else if (age >= 29) args.preset = "millennial";
              else if (age >= 14) args.preset = "gen_z";
            }

            // Keyword-based inference (if age didn't match)
            if (args.preset === undefined) {
              if (/\bretir/i.test(lc) || /\bsocial\s+security\b/i.test(lc) || /\bpension\b/i.test(lc) || /\bsenior\b/i.test(lc) || /\belder/i.test(lc)) {
                args.preset = "retiree";
              } else if (/\bfamil/i.test(lc) || /\bkid/i.test(lc) || /\bchild/i.test(lc) || /\bparent/i.test(lc) || /\bdual[\s-]*income/i.test(lc) || /\bmarried/i.test(lc) || /\bcouple/i.test(lc) || /\bhousehold/i.test(lc)) {
                args.preset = "family";
              } else if (/\bmillennial/i.test(lc) || /\bmid[\s-]*career/i.test(lc) || /\bprofessional/i.test(lc) || /\bsingle\s+adult/i.test(lc)) {
                args.preset = "millennial";
              } else if (/\bgen[\s-]*z\b/i.test(lc) || /\bcollege/i.test(lc) || /\bstudent/i.test(lc) || /\byoung/i.test(lc) || /\bteen/i.test(lc) || /\bentry[\s-]*level/i.test(lc) || /\bstarting\s+out/i.test(lc) || /\bfirst\s+job/i.test(lc)) {
                args.preset = "gen_z";
              }
            }
          }

          // ── Helper: extract dollar amount from a match ──
          const parseDollars = (raw: string): number | null => {
            const cleaned = raw.replace(/[,$\s]/g, "").trim();
            let val = parseFloat(cleaned);
            if (!Number.isFinite(val)) return null;
            if (/k/i.test(raw)) val *= 1000;
            if (/m/i.test(raw) && val < 1000) val *= 1_000_000;
            return val;
          };

          // ── Context flags ──
          if (args.is_homeowner === undefined && userText) {
            if (/\b(?:own|bought|purchased)\s+(?:a\s+|my\s+)?(?:home|house|condo|property)\b/i.test(userText) || /\bhomeowner\b/i.test(userText) || /\bmortgage\b/i.test(userText)) {
              args.is_homeowner = true;
            }
          }
          if (args.is_unemployed === undefined && userText) {
            if (/\bunemploy/i.test(userText) || /\bbetween\s+jobs\b/i.test(userText) || /\blost\s+(?:my\s+)?job\b/i.test(userText) || /\bno\s+(?:income|job|work)\b/i.test(userText) || /\blaid\s+off\b/i.test(userText)) {
              args.is_unemployed = true;
            }
          }
          if (args.num_children === undefined && userText) {
            const kidMatch = userText.match(/\b(\d)\s*(?:kids?|children|child)\b/i) || userText.match(/\b(?:have|with)\s+(\d)\s+(?:kids?|children)\b/i);
            if (kidMatch) args.num_children = parseInt(kidMatch[1], 10);
          }

          // ── Crypto/stock flags + tickers ──
          if (args.has_crypto === undefined && userText) {
            if (/\bcrypto|bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge\b/i.test(userText)) {
              args.has_crypto = true;
            }
          }
          if (args.has_stocks === undefined && userText) {
            if (/\bstock|brokerage|etf|equity|shares|portfolio|invest/i.test(userText)) {
              args.has_stocks = true;
            }
          }
          if (args.crypto_tickers === undefined && userText) {
            const cryptoMap: Record<string, string> = { bitcoin: "bitcoin", btc: "bitcoin", ethereum: "ethereum", eth: "ethereum", solana: "solana", sol: "solana", dogecoin: "dogecoin", doge: "dogecoin", cardano: "cardano", ada: "cardano", xrp: "ripple" };
            const found = new Set<string>();
            for (const [kw, id] of Object.entries(cryptoMap)) {
              if (new RegExp(`\\b${kw}\\b`, "i").test(userText)) found.add(id);
            }
            if (found.size > 0) args.crypto_tickers = [...found].join(",");
          }
          if (args.stock_tickers === undefined && userText) {
            // Match $AAPL style or known tickers near "stock" context
            const tickerMatches = userText.match(/\$([A-Z]{1,5})\b/g);
            if (tickerMatches) {
              args.stock_tickers = tickerMatches.map((t: string) => t.replace("$", "")).join(",");
            }
          }

          // ── Budget name ──
          if (args.budget_name === undefined) {
            const nameMatch = userText.match(/(?:my\s+|a\s+|create\s+(?:a\s+)?)?(\w+(?:\s+\w+)?)\s+budget/i);
            if (nameMatch && nameMatch[1]) {
              args.budget_name = nameMatch[1].trim().replace(/^(?:my|a|create)\s*/i, "") + " Budget";
            }
          }

          // ── Income inference ──
          if (args.monthly_income === undefined && args.annual_income === undefined && args.salary === undefined) {
            const incomeMatch = userText.match(/(?:make|earn|income|salary|take\s+home)[^.]*?\$?([\d,]+(?:\.\d+)?)\s*(?:k|K)?\s*(?:\/?\s*(?:month|mo|monthly|per\s+month))/i);
            if (incomeMatch) {
              const val = parseDollars(incomeMatch[1]);
              if (val) args.monthly_income = val;
            } else {
              const annualMatch = userText.match(/(?:make|earn|income|salary)[^.]*?\$?([\d,]+(?:\.\d+)?)\s*(k|K)?/i);
              if (annualMatch) {
                let val = parseDollars(annualMatch[1] + (annualMatch[2] || ""));
                if (val && val > 10000) args.annual_income = val; // likely annual if > $10k
              }
            }
          }

          // ── Specific expense inference ──
          if (args.rent === undefined && userText) {
            const m = userText.match(/\brent[^.]*?\$\s*([\d,]+(?:\.\d+)?)\s*(?:k)?/i) || userText.match(/\$\s*([\d,]+)\s*(?:\/?\s*(?:mo|month))?\s*(?:in\s+)?rent/i);
            if (m) { const v = parseDollars(m[1]); if (v && v < 10000) args.rent = v; }
          }
          if (args.student_loans === undefined && userText) {
            const m = userText.match(/\bstudent\s+loan[^.]*?\$\s*([\d,]+(?:\.\d+)?)\s*(k|K)?/i);
            if (m) { const v = parseDollars(m[1] + (m[2] || "")); if (v) args.student_loans = v; }
          }
          if (args.credit_card_debt === undefined && userText) {
            const m = userText.match(/\bcredit\s+card[^.]*?\$\s*([\d,]+(?:\.\d+)?)\s*(k|K)?/i);
            if (m) { const v = parseDollars(m[1] + (m[2] || "")); if (v) args.credit_card_debt = v; }
          }

          // ── Liquid assets inference ──
          if (args.liquid_assets === undefined && args.savings_balance === undefined) {
            const liquidMatch = userText.match(/(?:savings?|bank|liquid|cash|checking)[^.]*?\$?([\d,]+(?:\.\d+)?)\s*(?:k|K)?/i);
            if (liquidMatch) {
              const val = parseDollars(liquidMatch[1] + (/k/i.test(liquidMatch[0]) ? "k" : ""));
              if (val && val > 100) args.liquid_assets = val;
            }
          }

          // ── Liability inference ──
          if (args.liabilities === undefined && !args.student_loans && !args.credit_card_debt && !args.mortgage_balance) {
            const debtMatch = userText.match(/(?:owe|debt|liabilit)[^.]*?\$?([\d,]+(?:\.\d+)?)\s*(?:k|K)?/i);
            if (debtMatch) {
              const val = parseDollars(debtMatch[1] + (/k/i.test(debtMatch[0]) ? "k" : ""));
              if (val && val > 100) args.liabilities = val;
            }
          }

          // ── Home value inference ──
          if (args.home_value === undefined && userText) {
            const m = userText.match(/\b(?:home|house|property)\s+(?:is\s+)?(?:worth|valued?\s+at)[^.]*?\$\s*([\d,]+(?:\.\d+)?)\s*(k|K|m|M)?/i);
            if (m) { const v = parseDollars(m[1] + (m[2] || "")); if (v && v > 10000) args.home_value = v; }
          }

          // ── 401k / retirement inference ──
          if (args.retirement_savings === undefined && args.balance_401k === undefined && userText) {
            const m = userText.match(/\b(?:401k|retirement|ira)[^.]*?\$\s*([\d,]+(?:\.\d+)?)\s*(k|K)?/i);
            if (m) { const v = parseDollars(m[1] + (m[2] || "")); if (v && v > 100) args.retirement_savings = v; }
          }

          // ── Store freeform text ──
          if (!args.budget_description && userText.length > 10 && !looksLikeToken(userText)) {
            args.budget_description = userText;
          }

        } catch (e) {
          console.warn("Parameter inference from meta failed", e);
        }


        const responseTime = Date.now() - startTime;

        // Check if we are using defaults (i.e. no arguments provided)
        const usedDefaults = Object.keys(args).length === 0;

        // Infer likely user query from parameters
        const inferredQuery = [] as string[];
        if (args.budget_name) inferredQuery.push(`Budget: ${args.budget_name}`);
        if (args.monthly_income) inferredQuery.push(`Income: $${args.monthly_income.toLocaleString()}/mo`);
        if (args.monthly_expenses) inferredQuery.push(`Expenses: $${args.monthly_expenses.toLocaleString()}/mo`);
        if (args.liquid_assets) inferredQuery.push(`Liquid: $${args.liquid_assets.toLocaleString()}`);
        if (args.nonliquid_assets) inferredQuery.push(`Non-liquid: $${args.nonliquid_assets.toLocaleString()}`);
        if (args.retirement_savings) inferredQuery.push(`Retirement: $${args.retirement_savings.toLocaleString()}`);
        if (args.liabilities) inferredQuery.push(`Liabilities: $${args.liabilities.toLocaleString()}`);

        logAnalytics("tool_call_success", {
          toolName: request.params.name,
          params: args,
          inferredQuery: inferredQuery.length > 0 ? inferredQuery.join(", ") : "My Budget",
          responseTime,

          device: deviceCategory,
          userLocation: userLocation
            ? {
                city: userLocation.city,
                region: userLocation.region,
                country: userLocation.country,
                timezone: userLocation.timezone,
              }
            : null,
          userLocale,
          userAgent,
        });

        // Use a stable template URI so toolOutput reliably hydrates the component
        const widgetMetadata = widgetMeta(widget, false);
        console.log(`[MCP] Tool called: ${request.params.name}, returning templateUri: ${(widgetMetadata as any)["openai/outputTemplate"]}`);

        // Build structured content once so we can log it and return it.
        const structured = {
          ready: true,
          timestamp: new Date().toISOString(),
          ...args,
          input_source: usedDefaults ? "default" : "user",
          summary: computeSummary(args),
          suggested_followups: [
            "Add your income sources",
            "Track your monthly expenses",
            "Add your assets and savings",
            "See your net worth and runway"
          ],
        } as const;

        // Embed the widget resource in _meta to mirror official examples and improve hydration reliability
        const metaForReturn = {
          ...widgetMetadata,
          "openai.com/widget": {
            type: "resource",
            resource: {
              uri: widget.templateUri,
              mimeType: "text/html+skybridge",
              text: widget.html,
              title: widget.title,
            },
          },
        } as const;

        console.log("[MCP] Returning outputTemplate:", (metaForReturn as any)["openai/outputTemplate"]);
        console.log("[MCP] Returning structuredContent:", structured);

        // Log success analytics
        try {
          // Check for "empty" result - when no main budget inputs are provided
          const hasMainInputs = args.budget_name || args.monthly_income || args.monthly_expenses || args.liquid_assets || args.liabilities;
          
          if (!hasMainInputs) {
             logAnalytics("tool_call_empty", {
               toolName: request.params.name,
               params: request.params.arguments || {},
               reason: "No budget details provided"
             });
          } else {
          logAnalytics("tool_call_success", {
            responseTime,
            params: request.params.arguments || {},
            inferredQuery: inferredQuery.join(", "),
            userLocation,
            userLocale,
            device: deviceCategory,
          });
          }
        } catch {}

        // TEXT SUPPRESSION: Return empty content array to prevent ChatGPT from adding
        // any text after the widget. The widget provides all necessary UI.
        // See: content: [] means no text content, only the widget is shown.
        return {
          content: [],  // Empty array = no text after widget
          structuredContent: structured,
          _meta: metaForReturn,  // Contains openai/resultCanProduceWidget: true
        };
      } catch (error: any) {
        logAnalytics("tool_call_error", {
          error: error.message,
          stack: error.stack,
          responseTime: Date.now() - startTime,
          device: deviceCategory,
          userAgent: userAgentString,
        });
        throw error;
      }
    }
  );

  return server;
}

type SessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();

const ssePath = "/mcp";
const postPath = "/mcp/messages";
const subscribePath = "/api/subscribe";
const stockPricePath = "/api/stock-price";
const analyticsPath = "/analytics";
const trackEventPath = "/api/track";
const healthPath = "/health";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";

async function handleStockPrice(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    res.writeHead(405).end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (!FINNHUB_API_KEY) {
    res.writeHead(500).end(JSON.stringify({ error: "Stock API not configured" }));
    return;
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const symbols = url.searchParams.get("symbols");
  if (!symbols) {
    res.writeHead(400).end(JSON.stringify({ error: "Missing symbols parameter" }));
    return;
  }

  try {
    const symbolList = symbols.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);
    const results: Record<string, number> = {};

    await Promise.all(symbolList.map(async (symbol) => {
      try {
        const resp = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.c && data.c > 0) results[symbol] = data.c; // "c" = current price
        }
      } catch {}
    }));

    res.writeHead(200).end(JSON.stringify(results));
  } catch (e) {
    console.error("Stock price fetch error:", e);
    res.writeHead(500).end(JSON.stringify({ error: "Failed to fetch stock prices" }));
  }
}


const ANALYTICS_PASSWORD = process.env.ANALYTICS_PASSWORD || "changeme123";

function checkAnalyticsAuth(req: IncomingMessage): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
  const [username, password] = credentials.split(":");

  return username === "admin" && password === ANALYTICS_PASSWORD;
}

function humanizeEventName(event: string): string {
  const eventMap: Record<string, string> = {
    // Server-side
    tool_call_success: "Tool Call (Success)",
    tool_call_error: "Tool Call (Error)",
    tool_call_empty: "Tool Call (Empty)",
    parameter_parse_error: "Parameter Parse Error",
    // Budget management
    widget_new_budget: "New Budget",
    widget_open_budget: "Open Budget",
    widget_save_budget: "Save Budget",
    widget_delete_budget: "Delete Budget",
    widget_reset: "Reset Budget",
    widget_back_to_home: "Back to Home",
    // Item management
    widget_add_item: "Add Item",
    widget_add_preset_item: "Add Preset Item",
    widget_delete_item: "Delete Item",
    // Crypto
    widget_refresh_crypto: "Refresh Crypto Prices",
    widget_refresh_prices: "Refresh Prices (Crypto + Stock)",
    // Footer buttons
    widget_subscribe_click: "Subscribe (Click)",
    widget_donate_click: "Donate (Click)",
    widget_feedback_click: "Feedback (Click)",
    widget_print_click: "Print (Click)",
    // Feedback & rating
    widget_enjoy_vote: "Enjoy Vote",
    widget_user_feedback: "Feedback (Submitted)",
    widget_app_enjoyment_vote: "Enjoy Vote (Legacy)",
    // Related apps
    widget_related_app_click: "Related App (Click)",
    // Subscriptions
    widget_notify_me_subscribe: "Email Subscribe",
    widget_notify_me_subscribe_error: "Email Subscribe (Error)",
    // Errors
    widget_crash: "Widget Crash",
  };
  return eventMap[event] || event.replace(/^widget_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatEventDetails(log: AnalyticsEvent): string {
  const excludeKeys = ["timestamp", "event"];
  const details: Record<string, any> = {};
  
  Object.keys(log).forEach((key) => {
    if (!excludeKeys.includes(key)) {
      details[key] = log[key];
    }
  });
  
  if (Object.keys(details).length === 0) {
    return "—";
  }
  
  return JSON.stringify(details, null, 0);
}

type AlertEntry = {
  id: string;
  level: "warning" | "critical";
  message: string;
};

function evaluateAlerts(logs: AnalyticsEvent[]): AlertEntry[] {
  const alerts: AlertEntry[] = [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  // 1. Tool Call Failures
  const toolErrors24h = logs.filter(
    (l) =>
      l.event === "tool_call_error" &&
      new Date(l.timestamp).getTime() >= dayAgo
  ).length;

  if (toolErrors24h > 5) {
    alerts.push({
      id: "tool-errors",
      level: "critical",
      message: `Tool failures in last 24h: ${toolErrors24h} (>5 threshold)`,
    });
  }

  // 2. Parameter Parsing Errors
  const parseErrorsWeek = logs.filter(
    (l) =>
      l.event === "parameter_parse_error" &&
      new Date(l.timestamp).getTime() >= weekAgo
  ).length;

  if (parseErrorsWeek > 3) {
    alerts.push({
      id: "parse-errors",
      level: "warning",
      message: `Parameter parse errors in last 7d: ${parseErrorsWeek} (>3 threshold)`,
    });
  }

  // 3. Empty Result Sets (or equivalent for calculator - e.g. missing inputs)
  const successCalls = logs.filter(
    (l) => l.event === "tool_call_success" && new Date(l.timestamp).getTime() >= weekAgo
  );
  const emptyResults = logs.filter(
    (l) => l.event === "tool_call_empty" && new Date(l.timestamp).getTime() >= weekAgo
  ).length;

  const totalCalls = successCalls.length + emptyResults;
  if (totalCalls > 0 && (emptyResults / totalCalls) > 0.2) {
    alerts.push({
      id: "empty-results",
      level: "warning",
      message: `Empty result rate ${((emptyResults / totalCalls) * 100).toFixed(1)}% (>20% threshold)`,
    });
  }

  // 4. Widget Load Failures (Crashes)
  const widgetCrashes = logs.filter(
    (l) => l.event === "widget_crash" && new Date(l.timestamp).getTime() >= dayAgo
  ).length;

  if (widgetCrashes > 0) {
    alerts.push({
      id: "widget-crash",
      level: "critical",
      message: `Widget crashes in last 24h: ${widgetCrashes} (Fix immediately)`,
    });
  }

  // 5. Buttondown Subscription Failures
  const recentSubs = logs.filter(
    (l) =>
      (l.event === "widget_notify_me_subscribe" ||
        l.event === "widget_notify_me_subscribe_error") &&
      new Date(l.timestamp).getTime() >= weekAgo
  );

  const subFailures = recentSubs.filter(
    (l) => l.event === "widget_notify_me_subscribe_error"
  ).length;

  const failureRate =
    recentSubs.length > 0 ? subFailures / recentSubs.length : 0;

  if (recentSubs.length >= 5 && failureRate > 0.1) {
    alerts.push({
      id: "buttondown-failures",
      level: "warning",
      message: `Buttondown failure rate ${(failureRate * 100).toFixed(
        1
      )}% over last 7d (${subFailures}/${recentSubs.length})`,
    });
  }

  return alerts;
}

function generateAnalyticsDashboard(logs: AnalyticsEvent[], alerts: AlertEntry[]): string {
  const errorLogs = logs.filter((l) => l.event.includes("error"));
  const successLogs = logs.filter((l) => l.event === "tool_call_success");
  const parseLogs = logs.filter((l) => l.event === "parameter_parse_error");
  const widgetEvents = logs.filter((l) => l.event.startsWith("widget_"));

  const avgResponseTime =
    successLogs.length > 0
      ? (successLogs.reduce((sum, l) => sum + (l.responseTime || 0), 0) /
          successLogs.length).toFixed(0)
      : "N/A";

  // --- Prompt-level analytics (from tool calls) ---
  const paramUsage: Record<string, number> = {};
  const incomeRanges: Record<string, number> = {};
  const expenseRanges: Record<string, number> = {};
  
  const bucketAmount = (val: number): string => {
    if (val <= 2000) return "$0–2K";
    if (val <= 5000) return "$2K–5K";
    if (val <= 10000) return "$5K–10K";
    if (val <= 20000) return "$10K–20K";
    return "$20K+";
  };
  
  successLogs.forEach((log) => {
    if (log.params) {
      Object.keys(log.params).forEach((key) => {
        if (log.params[key] !== undefined) {
          paramUsage[key] = (paramUsage[key] || 0) + 1;
        }
      });
      if (log.params.monthly_income) {
        const bucket = bucketAmount(log.params.monthly_income);
        incomeRanges[bucket] = (incomeRanges[bucket] || 0) + 1;
      }
      if (log.params.monthly_expenses) {
        const bucket = bucketAmount(log.params.monthly_expenses);
        expenseRanges[bucket] = (expenseRanges[bucket] || 0) + 1;
      }
    }
  });

  // Budget names (top 10)
  const budgetNameDist: Record<string, number> = {};
  successLogs.forEach((log) => {
    if (log.params?.budget_name) {
      const name = log.params.budget_name;
      budgetNameDist[name] = (budgetNameDist[name] || 0) + 1;
    }
  });

  // --- In-app analytics (from widget events) ---
  // Budget management actions
  const budgetActions: Record<string, number> = {};
  const budgetActionEvents = ["widget_new_budget", "widget_open_budget", "widget_save_budget", "widget_delete_budget", "widget_reset", "widget_back_to_home"];
  budgetActionEvents.forEach(e => { budgetActions[humanizeEventName(e)] = 0; });
  
  // Item management actions
  const itemActions: Record<string, number> = {};
  const itemActionEvents = ["widget_add_item", "widget_add_preset_item", "widget_delete_item"];
  itemActionEvents.forEach(e => { itemActions[humanizeEventName(e)] = 0; });

  // Items added by section (income, expenses, assets, etc.)
  const addsBySection: Record<string, number> = {};
  const deletesBySection: Record<string, number> = {};
  
  // Preset items used
  const presetUsage: Record<string, number> = {};

  // Footer button clicks
  const footerClicks: Record<string, number> = {};
  const footerEvents = ["widget_subscribe_click", "widget_donate_click", "widget_feedback_click", "widget_print_click"];
  footerEvents.forEach(e => { footerClicks[humanizeEventName(e)] = 0; });

  // Related app clicks
  const relatedAppClicks: Record<string, number> = {};

  // Enjoy votes
  let enjoyUp = 0;
  let enjoyDown = 0;

  // Feedback with votes
  const feedbackLogs: AnalyticsEvent[] = [];
  
  // Crypto refresh count
  let cryptoRefreshCount = 0;

  // All widget interactions (catch-all)
  const allWidgetCounts: Record<string, number> = {};

  widgetEvents.forEach((log) => {
    const humanName = humanizeEventName(log.event);
    allWidgetCounts[humanName] = (allWidgetCounts[humanName] || 0) + 1;

    // Budget management
    if (budgetActionEvents.includes(log.event)) {
      budgetActions[humanName] = (budgetActions[humanName] || 0) + 1;
    }
    // Item management
    if (itemActionEvents.includes(log.event)) {
      itemActions[humanName] = (itemActions[humanName] || 0) + 1;
    }
    // Track adds/deletes by section
    if (log.event === "widget_add_item" || log.event === "widget_add_preset_item") {
      const section = log.section || "unknown";
      addsBySection[section] = (addsBySection[section] || 0) + 1;
    }
    if (log.event === "widget_delete_item") {
      const section = log.section || "unknown";
      deletesBySection[section] = (deletesBySection[section] || 0) + 1;
    }
    // Preset usage
    if (log.event === "widget_add_preset_item" && log.presetName) {
      presetUsage[log.presetName] = (presetUsage[log.presetName] || 0) + 1;
    }
    // Footer
    if (footerEvents.includes(log.event)) {
      footerClicks[humanName] = (footerClicks[humanName] || 0) + 1;
    }
    // Related apps
    if (log.event === "widget_related_app_click") {
      const app = log.app || "Unknown";
      relatedAppClicks[app] = (relatedAppClicks[app] || 0) + 1;
    }
    // Enjoy votes
    if (log.event === "widget_enjoy_vote" || log.event === "widget_app_enjoyment_vote") {
      if (log.vote === "up") enjoyUp++;
      else if (log.vote === "down") enjoyDown++;
    }
    // Feedback
    if (log.event === "widget_user_feedback") {
      feedbackLogs.push(log);
    }
    // Crypto
    if (log.event === "widget_refresh_crypto") {
      cryptoRefreshCount++;
    }
  });

  const totalEnjoyVotes = enjoyUp + enjoyDown;
  const enjoyPct = totalEnjoyVotes > 0 ? ((enjoyUp / totalEnjoyVotes) * 100).toFixed(0) : "—";

  // Daily call volume (last 7 days)
  const dailyCounts: Record<string, { toolCalls: number; widgetEvents: number; errors: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    dailyCounts[key] = { toolCalls: 0, widgetEvents: 0, errors: 0 };
  }
  logs.forEach(l => {
    const day = l.timestamp?.split("T")[0];
    if (dailyCounts[day]) {
      if (l.event === "tool_call_success") dailyCounts[day].toolCalls++;
      if (l.event.startsWith("widget_")) dailyCounts[day].widgetEvents++;
      if (l.event.includes("error")) dailyCounts[day].errors++;
    }
  });

  // Helper to render a simple table
  const renderTable = (headers: string[], rows: string[][], emptyMsg: string) => {
    if (rows.length === 0) return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody><tr><td colspan="${headers.length}" style="text-align:center;color:#9ca3af;">${emptyMsg}</td></tr></tbody></table>`;
    return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My Budget Analytics</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; color: #1f2937; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #1a1a1a; margin-bottom: 6px; font-size: 28px; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 14px; }
    .section-title { font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 28px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .card { background: white; border-radius: 10px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; }
    .card h2 { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .card .value { font-size: 36px; font-weight: 800; color: #1a1a1a; line-height: 1.1; }
    .card .value .unit { font-size: 14px; font-weight: 500; color: #9ca3af; }
    .card.error .value { color: #dc2626; }
    .card.success .value { color: #16a34a; }
    .card.warning .value { color: #ea580c; }
    .card.info .value { color: #2563eb; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    th { font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; background: #f9fafb; }
    td { color: #374151; }
    tr:last-child td { border-bottom: none; }
    .error-row { background: #fef2f2; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #374151; }
    .timestamp { color: #9ca3af; font-size: 12px; white-space: nowrap; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-red { background: #fef2f2; color: #dc2626; }
    .badge-blue { background: #dbeafe; color: #2563eb; }
    .badge-orange { background: #fff7ed; color: #ea580c; }
    .bar { height: 8px; border-radius: 4px; background: #e5e7eb; overflow: hidden; margin-top: 4px; }
    .bar-fill { height: 100%; border-radius: 4px; }
    .pct { font-size: 11px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 My Budget Analytics</h1>
    <p class="subtitle">Last 7 days · ${logs.length} total events · Auto-refresh 60s</p>

    <!-- ========== ALERTS ========== -->
    ${alerts.length > 0 ? `
    <div class="card" style="margin-bottom:20px; border-left: 4px solid ${alerts.some(a => a.level === "critical") ? "#dc2626" : "#ea580c"};">
      <h2>⚠️ Active Alerts</h2>
      <ul style="padding-left:16px;margin:4px 0 0;">
        ${alerts.map(a => `<li style="margin-bottom:4px;"><span class="badge ${a.level === "critical" ? "badge-red" : "badge-orange"}">${a.level.toUpperCase()}</span> ${a.message}</li>`).join("")}
      </ul>
    </div>` : ""}

    <!-- ========== OVERVIEW CARDS ========== -->
    <div class="section-title">📈 Overview</div>
    <div class="grid">
      <div class="card success">
        <h2>Tool Calls (Prompt)</h2>
        <div class="value">${successLogs.length}</div>
      </div>
      <div class="card info">
        <h2>Widget Events (In-App)</h2>
        <div class="value">${widgetEvents.length}</div>
      </div>
      <div class="card error">
        <h2>Errors</h2>
        <div class="value">${errorLogs.length}</div>
      </div>
      <div class="card">
        <h2>Avg Response</h2>
        <div class="value">${avgResponseTime}<span class="unit">ms</span></div>
      </div>
      <div class="card ${totalEnjoyVotes > 0 ? (parseInt(enjoyPct) >= 70 ? "success" : parseInt(enjoyPct) >= 40 ? "warning" : "error") : ""}">
        <h2>Satisfaction</h2>
        <div class="value">${enjoyPct}${totalEnjoyVotes > 0 ? '<span class="unit">%</span>' : ""}</div>
        <div class="pct">${enjoyUp} 👍 / ${enjoyDown} 👎 (${totalEnjoyVotes} votes)</div>
      </div>
    </div>

    <!-- ========== DAILY VOLUME ========== -->
    <div class="card" style="margin-bottom:20px;">
      <h2>📅 Daily Volume (7 Days)</h2>
      ${renderTable(
        ["Date", "Tool Calls", "Widget Events", "Errors"],
        Object.entries(dailyCounts).map(([day, c]) => [
          `<span class="timestamp">${day}</span>`,
          String(c.toolCalls),
          String(c.widgetEvents),
          c.errors > 0 ? `<span style="color:#dc2626;font-weight:600;">${c.errors}</span>` : "0"
        ]),
        "No data"
      )}
    </div>

    <!-- ========== PROMPT ANALYTICS ========== -->
    <div class="section-title">🔍 Prompt Analytics (What's Being Called)</div>
    <div class="grid-3">
      <div class="card">
        <h2>💰 Income Ranges</h2>
        ${renderTable(
          ["Range", "Count", "%"],
          Object.entries(incomeRanges).sort((a, b) => b[1] - a[1]).map(([range, count]) => {
            const pct = successLogs.length > 0 ? ((count / successLogs.length) * 100).toFixed(0) : "0";
            return [range, String(count), `${pct}%`];
          }),
          "No data yet"
        )}
      </div>
      <div class="card">
        <h2>💸 Expense Ranges</h2>
        ${renderTable(
          ["Range", "Count", "%"],
          Object.entries(expenseRanges).sort((a, b) => b[1] - a[1]).map(([range, count]) => {
            const pct = successLogs.length > 0 ? ((count / successLogs.length) * 100).toFixed(0) : "0";
            return [range, String(count), `${pct}%`];
          }),
          "No data yet"
        )}
      </div>
      <div class="card">
        <h2>Parameter Usage</h2>
        ${renderTable(
          ["Parameter", "Used", "%"],
          Object.entries(paramUsage).sort((a, b) => b[1] - a[1]).map(([p, c]) => [
            `<code>${p}</code>`,
            String(c),
            successLogs.length > 0 ? `${((c / successLogs.length) * 100).toFixed(0)}%` : "0%"
          ]),
          "No data yet"
        )}
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2>📋 Budget Names</h2>
        ${renderTable(
          ["Name", "Count"],
          Object.entries(budgetNameDist).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([d, c]) => [d, String(c)]),
          "No data yet"
        )}
      </div>
    </div>

    <!-- ========== IN-APP ANALYTICS ========== -->
    <div class="section-title">🖱️ In-App Actions (After Tool Call)</div>
    <div class="grid-3">
      <div class="card">
        <h2>📂 Budget Management</h2>
        ${renderTable(
          ["Action", "Count"],
          Object.entries(budgetActions).sort((a, b) => b[1] - a[1]).map(([a, c]) => [a, String(c)]),
          "No actions yet"
        )}
      </div>
      <div class="card">
        <h2>📝 Item Actions</h2>
        ${renderTable(
          ["Action", "Count"],
          Object.entries(itemActions).sort((a, b) => b[1] - a[1]).map(([a, c]) => [a, String(c)]),
          "No item actions yet"
        )}
        ${cryptoRefreshCount > 0 ? `<div style="margin-top:8px;padding:8px 10px;background:#f0fdf4;border-radius:8px;font-size:12px;">🪙 Crypto refreshes: <strong>${cryptoRefreshCount}</strong></div>` : ""}
      </div>
      <div class="card">
        <h2>📊 Items Added by Section</h2>
        ${(() => {
          const sections = [...new Set([...Object.keys(addsBySection), ...Object.keys(deletesBySection)])];
          const sectionIcon = (s: string) => s === "income" ? "💰" : s === "expenses" ? "💸" : s === "assets" ? "🏦" : s === "nonLiquidAssets" ? "🏠" : s === "retirement" ? "🏛️" : s === "liabilities" ? "⚠️" : "📌";
          const rows = sections.sort((a, b) => (addsBySection[b] || 0) - (addsBySection[a] || 0)).map(s => {
            const added = addsBySection[s] || 0;
            const deleted = deletesBySection[s] || 0;
            const net = added - deleted;
            const color = net >= 0 ? "#16a34a" : "#dc2626";
            const sign = net >= 0 ? "+" : "";
            return [sectionIcon(s) + " " + s, String(added), String(deleted), '<span style="color:' + color + ';font-weight:600;">' + sign + net + '</span>'];
          });
          return renderTable(["Section", "Added", "Deleted", "Net"], rows, "No items added yet");
        })()}
      </div>
    </div>

    <div class="grid-3">
      <div class="card">
        <h2>⭐ Top Preset Items</h2>
        ${renderTable(
          ["Preset", "Times Used"],
          Object.entries(presetUsage).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([p, c]) => [p, String(c)]),
          "No presets used yet"
        )}
      </div>
      <div class="card">
        <h2>🔗 Footer Buttons</h2>
        ${renderTable(
          ["Button", "Clicks"],
          Object.entries(footerClicks).sort((a, b) => b[1] - a[1]).map(([b, c]) => [b, String(c)]),
          "No clicks yet"
        )}
      </div>
      <div class="card">
        <h2>🔗 Related App Clicks</h2>
        ${renderTable(
          ["App", "Clicks"],
          Object.entries(relatedAppClicks).sort((a, b) => b[1] - a[1]).map(([a, c]) => [a, String(c)]),
          "No clicks yet"
        )}
      </div>
    </div>

    <!-- ========== USER EXPERIENCE ========== -->
    <div class="section-title">❤️ User Experience & Feedback</div>
    <div class="grid-2" style="margin-bottom:20px;">
      <div class="card">
        <h2>Enjoy Vote Breakdown</h2>
        <div style="display:flex;gap:20px;align-items:center;margin-bottom:12px;">
          <div style="text-align:center;">
            <div style="font-size:32px;font-weight:800;color:#16a34a;">${enjoyUp}</div>
            <div style="font-size:12px;color:#6b7280;">👍 Thumbs Up</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:32px;font-weight:800;color:#dc2626;">${enjoyDown}</div>
            <div style="font-size:12px;color:#6b7280;">👎 Thumbs Down</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:32px;font-weight:800;color:#2563eb;">${totalEnjoyVotes}</div>
            <div style="font-size:12px;color:#6b7280;">Total Votes</div>
          </div>
        </div>
        ${totalEnjoyVotes > 0 ? `
        <div class="bar" style="height:12px;">
          <div class="bar-fill" style="width:${enjoyPct}%;background:linear-gradient(90deg,#16a34a,#22c55e);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
          <span class="pct">👍 ${enjoyPct}%</span>
          <span class="pct">👎 ${100 - parseInt(enjoyPct)}%</span>
        </div>` : '<p style="color:#9ca3af;font-size:13px;margin-top:8px;">No votes yet</p>'}
      </div>
      <div class="card">
        <h2>Feedback Submissions</h2>
        ${feedbackLogs.length > 0 ? renderTable(
          ["Date", "Vote", "Feedback", "Budget"],
          feedbackLogs.slice(0, 15).map(l => [
            `<span class="timestamp">${new Date(l.timestamp).toLocaleString()}</span>`,
            l.enjoymentVote === "up" ? '<span class="badge badge-green">👍</span>' : l.enjoymentVote === "down" ? '<span class="badge badge-red">👎</span>' : "—",
            `<div style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${l.feedback || "—"}</div>`,
            l.budgetName || "—"
          ]),
          "No feedback yet"
        ) : '<p style="color:#9ca3af;font-size:13px;">No feedback submitted yet</p>'}
      </div>
    </div>

    <!-- ========== QUERIES LOG ========== -->
    <div class="section-title">📋 Recent Queries</div>
    <div class="card" style="margin-bottom:20px;">
      ${renderTable(
        ["Date", "Query", "Location", "Locale"],
        successLogs.slice(0, 25).map(l => [
          `<span class="timestamp">${new Date(l.timestamp).toLocaleString()}</span>`,
          `<div style="max-width:350px;overflow:hidden;text-overflow:ellipsis;">${l.inferredQuery || "—"}</div>`,
          l.userLocation ? `${l.userLocation.city || ""}${l.userLocation.region ? ", " + l.userLocation.region : ""}${l.userLocation.country ? ", " + l.userLocation.country : ""}`.replace(/^, /, "") : "—",
          l.userLocale || "—"
        ]),
        "No queries yet"
      )}
    </div>

    <!-- ========== ALL WIDGET EVENTS ========== -->
    <div class="section-title">📊 All Widget Interactions (Aggregated)</div>
    <div class="card" style="margin-bottom:20px;">
      ${renderTable(
        ["Event", "Count"],
        Object.entries(allWidgetCounts).sort((a, b) => b[1] - a[1]).map(([a, c]) => [a, String(c)]),
        "No widget events yet"
      )}
    </div>

    <!-- ========== RAW EVENT LOG ========== -->
    <div class="section-title">🔎 Recent Events (Last 50)</div>
    <div class="card" style="margin-bottom:20px;">
      <table>
        <thead><tr><th>Time</th><th>Event</th><th>Details</th></tr></thead>
        <tbody>
          ${logs.slice(0, 50).map(log => `
            <tr class="${log.event.includes("error") ? "error-row" : ""}">
              <td class="timestamp">${new Date(log.timestamp).toLocaleString()}</td>
              <td><strong>${humanizeEventName(log.event)}</strong></td>
              <td style="font-size:12px;max-width:500px;overflow:hidden;text-overflow:ellipsis;">${formatEventDetails(log)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  </div>
  <script>setTimeout(() => location.reload(), 60000);</script>
</body>
</html>`;
}

async function handleAnalytics(req: IncomingMessage, res: ServerResponse) {
  if (!checkAnalyticsAuth(req)) {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="Analytics Dashboard"',
      "Content-Type": "text/plain",
    });
    res.end("Authentication required");
    return;
  }

  try {
    const logs = getRecentLogs(7);
    const alerts = evaluateAlerts(logs);
    alerts.forEach((alert) =>
      console.warn("[ALERT]", alert.id, alert.message)
    );
    const html = generateAnalyticsDashboard(logs, alerts);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } catch (error) {
    console.error("Analytics error:", error);
    res.writeHead(500).end("Failed to generate analytics");
  }
}

async function handleTrackEvent(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405).end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    const { event, data } = JSON.parse(body);

    if (!event) {
      res.writeHead(400).end(JSON.stringify({ error: "Missing event name" }));
      return;
    }

    logAnalytics(`widget_${event}`, data || {});

    res.writeHead(200).end(JSON.stringify({ success: true }));
  } catch (error) {
    console.error("Track event error:", error);
    res.writeHead(500).end(JSON.stringify({ error: "Failed to track event" }));
  }
}

// Buttondown API integration
async function subscribeToButtondown(email: string, topicId: string, topicName: string) {
  const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;
  
  console.log("[Buttondown] subscribeToButtondown called", { email, topicId, topicName });
  console.log("[Buttondown] API key present:", !!BUTTONDOWN_API_KEY, "length:", BUTTONDOWN_API_KEY?.length ?? 0);

  if (!BUTTONDOWN_API_KEY) {
    throw new Error("BUTTONDOWN_API_KEY not set in environment variables");
  }

  const metadata: Record<string, any> = {
    topicName,
    source: "my-budget",
    subscribedAt: new Date().toISOString(),
  };

  const requestBody = {
    email_address: email,
    tags: [topicId],
    metadata,
  };

  console.log("[Buttondown] Sending request body:", JSON.stringify(requestBody));

  const response = await fetch("https://api.buttondown.email/v1/subscribers", {
    method: "POST",
    headers: {
      "Authorization": `Token ${BUTTONDOWN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  console.log("[Buttondown] Response status:", response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = "Failed to subscribe";
    
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (errorData.code) {
        errorMessage = `Error: ${errorData.code}`;
      }
    } catch {
      errorMessage = errorText;
    }
    
    throw new Error(errorMessage);
  }

  return await response.json();
}

// Update existing subscriber with new topic
async function updateButtondownSubscriber(email: string, topicId: string, topicName: string) {
  const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;
  
  if (!BUTTONDOWN_API_KEY) {
    throw new Error("BUTTONDOWN_API_KEY not set in environment variables");
  }

  // First, get the subscriber ID
  const searchResponse = await fetch(`https://api.buttondown.email/v1/subscribers?email=${encodeURIComponent(email)}`, {
    method: "GET",
    headers: {
      "Authorization": `Token ${BUTTONDOWN_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!searchResponse.ok) {
    throw new Error("Failed to find subscriber");
  }

  const subscribers = await searchResponse.json();
  if (!subscribers.results || subscribers.results.length === 0) {
    throw new Error("Subscriber not found");
  }

  const subscriber = subscribers.results[0];
  const subscriberId = subscriber.id;

  // Update the subscriber with new tag and metadata
  const existingTags = subscriber.tags || [];
  const existingMetadata = subscriber.metadata || {};

  // Add new topic to tags if not already there
  const updatedTags = existingTags.includes(topicId) ? existingTags : [...existingTags, topicId];

  // Add new topic to metadata (Buttondown requires string values)
  const topicKey = `topic_${topicId}`;
  const topicData = JSON.stringify({
    name: topicName,
    subscribedAt: new Date().toISOString(),
  });
  
  const updatedMetadata = {
    ...existingMetadata,
    [topicKey]: topicData,
    source: "my-budget",
  };

  const updateRequestBody = {
    tags: updatedTags,
    metadata: updatedMetadata,
  };

  console.log("[Buttondown] updateButtondownSubscriber called", { email, topicId, topicName, subscriberId });
  console.log("[Buttondown] Sending update request body:", JSON.stringify(updateRequestBody));

  const updateResponse = await fetch(`https://api.buttondown.email/v1/subscribers/${subscriberId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Token ${BUTTONDOWN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateRequestBody),
  });

  console.log("[Buttondown] Update response status:", updateResponse.status, updateResponse.statusText);

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    throw new Error(`Failed to update subscriber: ${errorText}`);
  }

  return await updateResponse.json();
}

async function handleSubscribe(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405).end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    const parsed = JSON.parse(body);
    const email = parsed.email;
    const topicId = parsed.topicId || "my-budget";
    const topicName = parsed.topicName || "My Budget Updates";
    if (!email || !email.includes("@")) {
      res.writeHead(400).end(JSON.stringify({ error: "Invalid email address" }));
      return;
    }

    const BUTTONDOWN_API_KEY_PRESENT = !!process.env.BUTTONDOWN_API_KEY;
    if (!BUTTONDOWN_API_KEY_PRESENT) {
      res.writeHead(500).end(JSON.stringify({ error: "Server misconfigured: BUTTONDOWN_API_KEY missing" }));
      return;
    }

    try {
      await subscribeToButtondown(email, topicId, topicName);
      res.writeHead(200).end(JSON.stringify({ 
        success: true, 
        message: "Successfully subscribed! You'll receive budget tips and updates." 
      }));
    } catch (subscribeError: any) {
      const rawMessage = String(subscribeError?.message ?? "").trim();
      const msg = rawMessage.toLowerCase();
      const already = msg.includes('already subscribed') || msg.includes('already exists') || msg.includes('already on your list') || msg.includes('subscriber already exists') || msg.includes('already');

      if (already) {
        console.log("Subscriber already on list, attempting update", { email, topicId, message: rawMessage });
        try {
          await updateButtondownSubscriber(email, topicId, topicName);
          res.writeHead(200).end(JSON.stringify({ 
            success: true, 
            message: "You're now subscribed to this topic!" 
          }));
        } catch (updateError: any) {
          console.warn("Update subscriber failed, returning graceful success", {
            email,
            topicId,
            error: updateError?.message,
          });
          logAnalytics("widget_notify_me_subscribe_error", {
            stage: "update",
            email,
            error: updateError?.message,
          });
          res.writeHead(200).end(JSON.stringify({
            success: true,
            message: "You're already subscribed! We'll keep you posted.",
          }));
        }
        return;
      }

      logAnalytics("widget_notify_me_subscribe_error", {
        stage: "subscribe",
        email,
        error: rawMessage || "unknown_error",
      });
      throw subscribeError;
    }
  } catch (error: any) {
    console.error("Subscribe error:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    logAnalytics("widget_notify_me_subscribe_error", {
      stage: "handler",
      email: undefined,
      error: error.message || "unknown_error",
    });
    res.writeHead(500).end(JSON.stringify({ 
      error: error.message || "Failed to subscribe. Please try again." 
    }));
  }
}

// AI-powered budget parsing using OpenAI
async function handleParseBudgetAI(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  
  if (req.method !== "POST") {
    res.writeHead(405).end("Method not allowed");
    return;
  }

  try {
    const body = await new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });

    const { text } = JSON.parse(body);
    
    if (!text || typeof text !== "string") {
      res.writeHead(400).end(JSON.stringify({ error: "Missing 'text' field" }));
      return;
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      console.log("[Parse Budget] No OPENAI_API_KEY, using fallback parsing");
      const items = fallbackParseBudgetText(text);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items, source: "fallback" }));
      return;
    }

    const systemPrompt = `You are a budget assistant that extracts financial information from natural language descriptions.

Extract all budget items (income, expenses, assets, liabilities) from the user's text and return them as a JSON array.

Each item should have:
- category: "income" | "expense" | "asset" | "liability"
- name: descriptive name (e.g., "Salary", "Rent", "Savings Account")
- amount: numeric dollar amount
- frequency: "monthly" | "yearly" | "one_time"

Rules:
1. Only extract what the user explicitly mentions - do NOT infer or auto-add items
2. Parse dollar amounts like "$5k" to 5000, "$120,000" to 120000
3. Default to "monthly" frequency if not specified for income/expenses
4. Default to "one_time" frequency for assets/liabilities

Return ONLY valid JSON array, no explanation.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Parse Budget] OpenAI API error:", response.status, errorText);
      const items = fallbackParseBudgetText(text);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items, source: "fallback" }));
      return;
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || "[]";
    
    let items;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      items = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[Parse Budget] Failed to parse AI response:", content);
      items = fallbackParseBudgetText(text);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items, source: "fallback" }));
      return;
    }

    console.log("[Parse Budget] AI parsed entries:", items.length);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ items, source: "ai" }));

  } catch (error: any) {
    console.error("[Parse Budget] Error:", error);
    res.writeHead(500).end(JSON.stringify({ error: error.message || "Failed to parse budget" }));
  }
}

// Fallback parsing when OpenAI is not available
function fallbackParseBudgetText(text: string): any[] {
  const items: any[] = [];
  const lower = text.toLowerCase();
  
  // Try to extract income
  const incomeMatch = lower.match(/(?:make|earn|income|salary)[^.]*?\$?([\d,]+(?:\.\d+)?)\s*(?:k)?/i);
  if (incomeMatch) {
    let val = parseFloat(incomeMatch[1].replace(/,/g, ""));
    if (/k/i.test(incomeMatch[0])) val *= 1000;
    items.push({ category: "income", name: "Salary", amount: val, frequency: "monthly" });
  }
  
  // Try to extract expenses
  const expenseMatch = lower.match(/(?:spend|expense|rent|mortgage|bills?)[^.]*?\$?([\d,]+(?:\.\d+)?)\s*(?:k)?/i);
  if (expenseMatch) {
    let val = parseFloat(expenseMatch[1].replace(/,/g, ""));
    if (/k/i.test(expenseMatch[0])) val *= 1000;
    const name = /rent/i.test(expenseMatch[0]) ? "Rent" : /mortgage/i.test(expenseMatch[0]) ? "Mortgage" : "Monthly Expenses";
    items.push({ category: "expense", name, amount: val, frequency: "monthly" });
  }
  
  // Try to extract savings/assets
  const savingsMatch = lower.match(/(?:savings?|bank|cash)[^.]*?\$?([\d,]+(?:\.\d+)?)\s*(?:k)?/i);
  if (savingsMatch) {
    let val = parseFloat(savingsMatch[1].replace(/,/g, ""));
    if (/k/i.test(savingsMatch[0])) val *= 1000;
    if (val > 100) items.push({ category: "asset", name: "Savings", amount: val, frequency: "one_time" });
  }
  
  // Try to extract debt/liabilities
  const debtMatch = lower.match(/(?:owe|debt|loan|liabilit)[^.]*?\$?([\d,]+(?:\.\d+)?)\s*(?:k)?/i);
  if (debtMatch) {
    let val = parseFloat(debtMatch[1].replace(/,/g, ""));
    if (/k/i.test(debtMatch[0])) val *= 1000;
    if (val > 100) items.push({ category: "liability", name: "Debt", amount: val, frequency: "one_time" });
  }
  
  return items;
}

async function handleSseRequest(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const server = createMyBudgetServer();
  const transport = new SSEServerTransport(postPath, res);
  const sessionId = transport.sessionId;

  sessions.set(sessionId, { server, transport });

  transport.onclose = async () => {
    sessions.delete(sessionId);
    await server.close();
  };

  transport.onerror = (error) => {
    console.error("SSE transport error", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    console.error("Failed to start SSE session", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    res.writeHead(400).end("Missing sessionId query parameter");
    return;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    res.writeHead(404).end("Unknown session");
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Failed to process message", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to process message");
    }
  }
}

const portEnv = Number(process.env.PORT ?? 8000);
const port = Number.isFinite(portEnv) ? portEnv : 8000;

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (
      req.method === "OPTIONS" &&
      (url.pathname === ssePath || url.pathname === postPath)
    ) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/.well-known/openai-apps-challenge") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("vucLzgCxCt9--0ZLAZ5QB5av-VfkDh3QlHhyuIfPvoM");
      return;
    }

    if (req.method === "GET" && url.pathname === healthPath) {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("OK");
      return;
    }

    if (req.method === "GET" && url.pathname === ssePath) {
      await handleSseRequest(res);
      return;
    }

    if (req.method === "POST" && url.pathname === postPath) {
      await handlePostMessage(req, res, url);
      return;
    }

    if (url.pathname === subscribePath) {
      await handleSubscribe(req, res);
      return;
    }

    if (url.pathname === analyticsPath) {
      await handleAnalytics(req, res);
      return;
    }

    if (url.pathname === trackEventPath) {
      await handleTrackEvent(req, res);
      return;
    }

    if (url.pathname === stockPricePath) {
      await handleStockPrice(req, res);
      return;
    }

    // AI-powered budget parsing endpoint
    if (req.method === "POST" && url.pathname === "/api/parse-budget") {
      await handleParseBudgetAI(req, res);
      return;
    }

    if (req.method === "OPTIONS" && url.pathname === "/api/parse-budget") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      });
      res.end();
      return;
    }

    // Serve alias for legacy loader path -> our main widget HTML
    if (req.method === "GET" && url.pathname === "/assets/my-budget.html") {
      const mainAssetPath = path.join(ASSETS_DIR, "my-budget.html");
      console.log(`[Debug Legacy] Request: ${url.pathname}, Main Path: ${mainAssetPath}, Exists: ${fs.existsSync(mainAssetPath)}`);
      if (fs.existsSync(mainAssetPath) && fs.statSync(mainAssetPath).isFile()) {
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        });
        fs.createReadStream(mainAssetPath).pipe(res);
        return;
      }
    }

    // Serve static assets from /assets directory
    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      const assetPath = path.join(ASSETS_DIR, url.pathname.slice(8));
      if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
        const ext = path.extname(assetPath).toLowerCase();
        const contentTypeMap: Record<string, string> = {
          ".js": "application/javascript",
          ".css": "text/css",
          ".html": "text/html",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".svg": "image/svg+xml"
        };
        const contentType = contentTypeMap[ext] || "application/octet-stream";
        res.writeHead(200, { 
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache"
        });

        fs.createReadStream(assetPath).pipe(res);
        return;
      }
    }

    res.writeHead(404).end("Not Found");
  }
);

httpServer.on("clientError", (err: Error, socket) => {
  console.error("HTTP client error", err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

function startMonitoring() {
  // Check alerts every hour
  setInterval(() => {
    try {
      const logs = getRecentLogs(7);
      const alerts = evaluateAlerts(logs);
      
      if (alerts.length > 0) {
        console.log("\n=== 🚨 ACTIVE ALERTS 🚨 ===");
        alerts.forEach(alert => {
          console.log(`[ALERT] [${alert.level.toUpperCase()}] ${alert.message}`);
        });
        console.log("===========================\n");
      }
    } catch (e) {
      console.error("Monitoring check failed:", e);
    }
  }, 60 * 60 * 1000); // 1 hour
}

httpServer.listen(port, () => {
  startMonitoring();
  console.log(`My Budget MCP server listening on http://localhost:${port}`);
  console.log(`  SSE stream: GET http://localhost:${port}${ssePath}`);
  console.log(
    `  Message post endpoint: POST http://localhost:${port}${postPath}?sessionId=...`
  );
});
