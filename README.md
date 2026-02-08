# My Budget - ChatGPT MCP Connector

A Model Context Protocol (MCP) server that provides an interactive personal budget widget for ChatGPT. Track and manage your income, expenses, and savings goals in one place.

**[Privacy Policy](PRIVACY.md)** | **[OpenAI Apps SDK](https://developers.openai.com/apps-sdk)**

## Features

- 💰 Track income, expenses, and savings goals in one place
- 📊 Budget overview with progress tracking per category
- 🤖 AI-powered budget description parsing (describe your budget in plain English)
- 📅 Monthly and yearly budget views
- 💾 Save and manage multiple budgets
- 🖨️ Print-friendly output

## Budget Types

- **Monthly Budget** — Track income and expenses on a monthly basis
- **Yearly Budget** — Annual financial planning with savings goals
- **Custom Budget** — Flexible budget categories tailored to your needs

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
pnpm install
```

### Build the Widget

```bash
pnpm run build
```

### Run Locally

```bash
pnpm start
```

Server runs on `http://localhost:8000`. **Note:** HTTP endpoints are for local development only.

### Deploy to Render.com

1. Push this repo to GitHub
2. Connect to Render.com
3. Create new Web Service from this repo
4. Render will auto-detect `render.yaml` and deploy

## How to Use in ChatGPT

1. Open ChatGPT in **Developer Mode**
2. Add MCP Connector with your deployed HTTPS URL (e.g. `https://my-budget-xxxx.onrender.com`)
3. Say: **"Help me manage my budget"** or **"Create a monthly budget"**
4. The interactive widget appears!

### Example Prompts

- "Help me create a monthly budget"
- "Track my income and expenses"
- "I need to manage my household budget"
- "Set up savings goals for this year"
- "Organize my personal finances"

## Tech Stack

- **MCP SDK** - Model Context Protocol for ChatGPT integration
- **Node.js + TypeScript** - Server runtime
- **Server-Sent Events (SSE)** - Real-time communication
- **React** - Widget UI components
- **Lucide Icons** - Beautiful icons

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
OPENAI_API_KEY=your_openai_key    # For AI-powered budget parsing
BUTTONDOWN_API_KEY=your_api_key   # For email subscriptions
ANALYTICS_PASSWORD=your_password  # For /analytics dashboard
```

## Privacy & Data Use

See the full **[Privacy Policy](PRIVACY.md)** for complete details.

- **What we collect:** When the widget runs inside ChatGPT, our server receives location (city/region/country), locale, device/browser fingerprint, inferred budget query, and log timestamps via the MCP `_meta` object.
- **How we use it:** These fields feed the `/analytics` dashboard only. We do not sell, rent, or share this data.
- **Server log retention:** Analytics logs are stored for **30 days** in the `/logs` directory and then automatically rotated and deleted.
- **Local budget data:** Your budget details are cached in browser `localStorage` and persist indefinitely — data is only removed when you manually delete a saved budget or use the "Reset" button.
- **Deletion requests:** Email **support@layer3labs.io** with the approximate UTC date/time of your session. We will delete associated server logs within 7 business days.

## Monitoring & Alerts

- Visit `/analytics` (Basic Auth protected) to review the live dashboard.
- Automated alerts trigger for:
  - **Tool failures**: >5 per day (critical)
  - **Parameter parse errors**: >3 per week (warning)
  - **Empty results**: >20% of calls (warning)
  - **Widget crashes**: Any occurrence (critical)
  - **Buttondown failures**: >10% failure rate (warning)

## Security

- **Production (HTTPS required)**: The OpenAI Apps SDK requires HTTPS end-to-end. Render.com provides HTTPS by default for all `env: node` web services — no extra configuration needed. All external API calls and CSP `connect_domains` in the codebase use `https://`.
- **Local development only**: `http://localhost:8000` is strictly for local testing and will **not** work with the ChatGPT MCP connector, which requires HTTPS.
- Widget runs in a sandboxed iframe with strict CSP

## Support

For questions, bug reports, or support:
- **Email**: support@layer3labs.io

**Note:** GitHub issues are not monitored for support requests. Please use email for all inquiries.

## License

MIT
