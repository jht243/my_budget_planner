import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, X, Trash2, Save, RotateCcw, Home, Printer,
  DollarSign, TrendingUp, TrendingDown, PiggyBank, Building2,
  Landmark, AlertTriangle, ChevronDown, ChevronUp, Edit2, Check,
  Wallet, Clock, ArrowUpRight, ArrowDownRight, RefreshCw, Search, Loader2, GripVertical,
  Mail, Heart, MessageSquare, ThumbsUp, ThumbsDown
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Data Types ───────────────────────────────────────────────────────────────

type Frequency = "monthly" | "yearly" | "one_time";
type AssetType = "manual" | "crypto" | "stock";

interface BudgetItem {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  totalValue: number;
  monthlyValue: number;
  quantity?: number;
  notes?: string;
  assetType?: AssetType;
  ticker?: string; // CoinGecko ID for crypto
  livePrice?: number; // last fetched price per unit
}

interface Budget {
  id: string;
  name: string;
  income: BudgetItem[];
  expenses: BudgetItem[];
  assets: BudgetItem[];
  nonLiquidAssets: BudgetItem[];
  retirement: BudgetItem[];
  liabilities: BudgetItem[];
  nonLiquidDiscount: number;
  lastPriceRefresh?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "MY_BUDGET_DATA";
const BUDGETS_LIST_KEY = "MY_BUDGET_LIST";
const generateId = () => Math.random().toString(36).substr(2, 9);

const COLORS = {
  primary: "#1B4332",
  primaryDark: "#0F2B1F",
  primaryLight: "#2D6A4F",
  accent: "#40916C",
  accentLight: "#E8F5E9",
  bg: "#F5F5F0",
  card: "#FFFFFF",
  border: "#E5E7EB",
  borderLight: "#F0F0F0",
  textMain: "#1A1A1A",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  income: "#059669",
  incomeBg: "#ECFDF5",
  expense: "#DC2626",
  expenseBg: "#FEF2F2",
  asset: "#2563EB",
  assetBg: "#EFF6FF",
  nonLiquid: "#7C3AED",
  nonLiquidBg: "#F5F3FF",
  retirement: "#0891B2",
  retirementBg: "#ECFEFF",
  liability: "#EA580C",
  liabilityBg: "#FFF7ED",
  positive: "#059669",
  negative: "#DC2626",
  warning: "#D97706",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const fmtExact = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPrice = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const emptyBudget = (): Budget => ({
  id: generateId(),
  name: "My Budget Plan",
  income: [],
  expenses: [],
  assets: [],
  nonLiquidAssets: [],
  retirement: [],
  liabilities: [],
  nonLiquidDiscount: 25,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const emptyItem = (freq: Frequency = "monthly"): BudgetItem => ({
  id: generateId(),
  name: "",
  amount: 0,
  frequency: freq,
  totalValue: 0,
  monthlyValue: 0,
});

const computeValues = (amount: number, frequency: Frequency): { totalValue: number; monthlyValue: number } => {
  switch (frequency) {
    case "monthly": return { totalValue: amount * 12, monthlyValue: amount };
    case "yearly": return { totalValue: amount, monthlyValue: Math.round((amount / 12) * 100) / 100 };
    case "one_time": return { totalValue: amount, monthlyValue: 0 };
  }
};

// ─── API Base URL ─────────────────────────────────────────────────────────────
// When served from the server, relative URLs work. When opened as a local file
// or embedded in an iframe on a different origin, fall back to production.
const API_BASE = (() => {
  try {
    if (typeof window !== "undefined" && window.location.protocol === "file:") {
      return "https://my-budget-planner.onrender.com";
    }
    // If served from the server itself, relative is fine
    return "";
  } catch { return ""; }
})();

// ─── Analytics ────────────────────────────────────────────────────────────────

const trackEvent = (event: string, data?: Record<string, any>) => {
  fetch(`${API_BASE}/api/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, data: data || {} }),
  }).catch(() => {});
};

// ─── CoinGecko API ───────────────────────────────────────────────────────────

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

interface CoinSearchResult {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
}

const searchCoins = async (query: string): Promise<CoinSearchResult[]> => {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(`${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.coins || []).slice(0, 8).map((c: any) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      thumb: c.thumb,
    }));
  } catch { return []; }
};

const fetchCryptoPrices = async (ids: string[]): Promise<Record<string, number>> => {
  if (ids.length === 0) return {};
  try {
    const res = await fetch(`${COINGECKO_BASE}/simple/price?ids=${ids.join(",")}&vs_currencies=usd`);
    if (!res.ok) return {};
    const data = await res.json();
    const prices: Record<string, number> = {};
    for (const id of ids) {
      if (data[id]?.usd) prices[id] = data[id].usd;
    }
    return prices;
  } catch { return {}; }
};

// Finnhub free API key (free tier, 60 calls/min — same client-side pattern as CoinGecko)
const FINNHUB_KEY = "d652ethr01qqbln5kjjgd652ethr01qqbln5kjk0";

const fetchStockPrices = async (symbols: string[]): Promise<Record<string, number>> => {
  if (symbols.length === 0) return {};
  const results: Record<string, number> = {};
  await Promise.all(symbols.map(async (symbol) => {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.c && data.c > 0) results[symbol] = data.c;
    } catch {}
  }));
  return results;
};

// Helper: monthly recurring item
const mi = (name: string, amount: number, freq: Frequency = "monthly"): BudgetItem => ({
  id: generateId(), name, amount, frequency: freq,
  totalValue: freq === "monthly" ? amount * 12 : freq === "yearly" ? amount : amount,
  monthlyValue: freq === "monthly" ? amount : freq === "yearly" ? Math.round(amount / 12) : 0,
});
// Helper: one-time / asset item
const mia = (name: string, amount: number): BudgetItem => ({
  id: generateId(), name, amount, frequency: "one_time", totalValue: amount, monthlyValue: 0,
});

// Sources: BLS Consumer Expenditure Survey 2024, Motley Fool avg monthly expenses 2024,
// Bankrate household budget 2024, SSA avg benefits 2024, Census/BLS income by age.
const BUDGET_PRESETS: { key: string; label: string; emoji: string; desc: string; budget: Omit<Budget, "id" | "createdAt" | "updatedAt"> }[] = [
  {
    // Gen Z: ~22-28, median salary ~$40k, ~$2,800/mo after tax
    key: "gen_z", label: "Gen Z", emoji: "📱", desc: "Starting out, side hustles & subscriptions",
    budget: {
      name: "Gen Z Budget",
      income: [mi("Part-time / Full-time Job", 2400), mi("Freelance / Side Hustle", 500), mi("Tips / Gig Work", 200)],
      expenses: [mi("Rent (shared)", 950), mi("Groceries", 350), mi("Phone Plan", 80), mi("Streaming (Netflix, Spotify)", 30), mi("Dining Out", 200), mi("Uber / Transit", 120), mi("Gym Membership", 40), mi("Subscriptions (apps)", 25), mi("Clothing", 75), mi("Entertainment", 100)],
      assets: [mia("Savings Account", 2500), mia("Venmo / Cash App Balance", 300), mia("Crypto", 500)],
      nonLiquidAssets: [mia("Laptop", 1200), mia("Phone", 800)],
      retirement: [mia("Roth IRA", 3000)],
      liabilities: [mia("Student Loans", 28000), mia("Credit Card Balance", 2500), mi("Buy Now Pay Later", 50)],
      nonLiquidDiscount: 50,
    },
  },
  {
    // Millennial: ~29-43, median salary ~$65k, ~$4,200/mo after tax
    key: "millennial", label: "Millennial", emoji: "💼", desc: "Career growth, building wealth",
    budget: {
      name: "Millennial Budget",
      income: [mi("Salary", 4200), mi("Bonus", 5000, "yearly"), mi("Side Project / Freelance", 400)],
      expenses: [mi("Rent / Mortgage", 1500), mi("Groceries", 450), mi("Car Payment", 500), mi("Car Insurance", 150), mi("Utilities", 200), mi("Phone Plan", 85), mi("Internet", 70), mi("Streaming Services", 45), mi("Dining Out", 250), mi("Gym", 50), mi("Pet Expenses", 100), mi("Travel Fund", 200)],
      assets: [mia("Checking Account", 4000), mia("Savings Account", 12000), mia("Brokerage Account", 15000), mia("Crypto Portfolio", 3000)],
      nonLiquidAssets: [mia("Car", 18000), mia("Furniture & Electronics", 5000)],
      retirement: [mia("401k", 35000), mia("Roth IRA", 12000)],
      liabilities: [mia("Student Loans", 22000), mia("Credit Card Balance", 4500), mia("Car Loan", 15000)],
      nonLiquidDiscount: 30,
    },
  },
  {
    // Family: dual income, 35-54, combined ~$94k pre-tax → ~$6,500/mo after tax
    key: "family", label: "Family", emoji: "👨‍👩‍👧‍👦", desc: "Dual income, kids, home ownership",
    budget: {
      name: "Family Budget",
      income: [mi("Salary (Primary)", 4000), mi("Salary (Spouse)", 3200), mi("Child Tax Credit", 250)],
      expenses: [mi("Mortgage", 2100), mi("Property Tax", 4800, "yearly"), mi("Homeowner's Insurance", 1800, "yearly"), mi("Groceries", 700), mi("Utilities", 380), mi("Childcare / Daycare", 1200), mi("Kids Activities", 150), mi("Car Payment", 550), mi("Car Insurance", 200), mi("Gas", 180), mi("Phone Plans", 140), mi("Internet", 75), mi("Streaming", 50), mi("Dining Out", 250), mi("Clothing", 170), mi("Medical / Copays", 100), mi("School Supplies", 50)],
      assets: [mia("Checking Account", 6000), mia("Joint Savings", 25000), mia("529 College Fund", 18000), mia("Brokerage Account", 30000)],
      nonLiquidAssets: [mia("Home Equity", 120000), mia("Car (Primary)", 22000), mia("Car (Spouse)", 15000)],
      retirement: [mia("401k (Primary)", 65000), mia("401k (Spouse)", 40000), mia("Roth IRA", 15000)],
      liabilities: [mia("Mortgage Balance", 280000), mia("Car Loan", 18000), mia("Credit Card", 6000), mia("Medical Bills", 2000)],
      nonLiquidDiscount: 20,
    },
  },
  {
    // Retiree: 65+, avg SS ~$1,907/mo, spending ~$4,600/mo
    key: "retiree", label: "Retiree", emoji: "🏖️", desc: "Fixed income, low debt, enjoying life",
    budget: {
      name: "Retiree Budget",
      income: [mi("Social Security", 1900), mi("Pension", 1500), mi("Retirement Withdrawals", 1200), mi("Rental Income", 800)],
      expenses: [mi("Mortgage / Rent", 1200), mi("Utilities", 300), mi("Groceries", 500), mi("Medicare / Health Insurance", 340), mi("Prescriptions", 150), mi("Car Insurance", 120), mi("Gas", 100), mi("Phone", 60), mi("Internet / Cable", 90), mi("Dining Out", 200), mi("Travel / Vacations", 300), mi("Hobbies", 100), mi("Gifts / Donations", 150)],
      assets: [mia("Checking Account", 8000), mia("Savings Account", 45000), mia("CDs / Bonds", 50000), mia("Brokerage Account", 80000)],
      nonLiquidAssets: [mia("Home", 300000), mia("Car", 15000), mia("Jewelry / Collectibles", 10000)],
      retirement: [mia("401k / IRA", 250000), mia("Pension Fund", 150000), mia("Annuity", 75000)],
      liabilities: [mia("Mortgage Balance", 85000), mia("Medical Bills", 3000)],
      nonLiquidDiscount: 20,
    },
  },
];

// Migrate old items that don't have amount/frequency fields
const migrateItem = (item: any): BudgetItem => {
  if (item.amount !== undefined && item.frequency !== undefined) return item;
  // Infer from old totalValue/monthlyValue
  if (item.monthlyValue && item.monthlyValue > 0) {
    return { ...item, amount: item.monthlyValue, frequency: "monthly" as Frequency };
  }
  return { ...item, amount: item.totalValue || 0, frequency: "one_time" as Frequency };
};

const migrateBudget = (b: any): Budget => ({
  ...b,
  income: (b.income || []).map(migrateItem),
  expenses: (b.expenses || []).map(migrateItem),
  assets: (b.assets || []).map(migrateItem),
  nonLiquidAssets: (b.nonLiquidAssets || []).map(migrateItem),
  retirement: (b.retirement || []).map(migrateItem),
  liabilities: (b.liabilities || []).map(migrateItem),
});

const loadBudgets = (): Budget[] => {
  try {
    const data = localStorage.getItem(BUDGETS_LIST_KEY);
    if (data) return JSON.parse(data).map(migrateBudget);
  } catch {}
  return [];
};

const saveBudgets = (budgets: Budget[]) => {
  try { localStorage.setItem(BUDGETS_LIST_KEY, JSON.stringify(budgets)); } catch {}
};

const loadCurrentBudget = (): Budget | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return migrateBudget(JSON.parse(data));
  } catch {}
  return null;
};

const saveCurrentBudget = (budget: Budget) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(budget)); } catch {}
};

// ─── Presets ──────────────────────────────────────────────────────────────────

interface Preset {
  name: string;
  emoji: string;
  persistent?: boolean;
  assetType?: AssetType;
}

const PRESETS: Record<string, Preset[]> = {
  income: [
    { name: "Work Salary", emoji: "💼" },
    { name: "Freelance Income", emoji: "💻" },
    { name: "Rental Income", emoji: "🏠" },
    { name: "Investment Dividends", emoji: "📈" },
    { name: "Government Benefits", emoji: "🏛️" },
    { name: "Side Business", emoji: "🏪" },
    { name: "Pension", emoji: "🧓" },
  ],
  expenses: [
    { name: "Rent", emoji: "🏠" },
    { name: "Mortgage Payment", emoji: "🏦" },
    { name: "Utilities", emoji: "💡" },
    { name: "Groceries", emoji: "🛒" },
    { name: "Car Payment", emoji: "🚗" },
    { name: "Insurance", emoji: "🛡️" },
    { name: "Subscriptions", emoji: "📺" },
    { name: "Phone Bill", emoji: "📱" },
    { name: "Internet", emoji: "🌐" },
    { name: "Gas/Transportation", emoji: "⛽" },
  ],
  assets: [
    { name: "Checking Account", emoji: "🏦" },
    { name: "Savings Account", emoji: "💰" },
    { name: "Stocks/Brokerage", emoji: "📊", persistent: true, assetType: "stock" },
    { name: "Crypto", emoji: "₿" },
    { name: "401k/Retirement", emoji: "🧓" },
    { name: "Emergency Fund", emoji: "🆘" },
    { name: "CD/Bonds", emoji: "📜" },
  ],
  nonLiquidAssets: [
    { name: "Home Value", emoji: "🏡" },
    { name: "Car Value", emoji: "🚗" },
    { name: "Jewelry/Watches", emoji: "💎" },
    { name: "Art/Collectibles", emoji: "🎨" },
    { name: "Business Equity", emoji: "🏢" },
    { name: "Furniture/Electronics", emoji: "🪑" },
  ],
  retirement: [
    { name: "401k", emoji: "🏦" },
    { name: "Roth IRA", emoji: "📊" },
    { name: "Traditional IRA", emoji: "📈" },
    { name: "Pension Fund", emoji: "🧓" },
    { name: "SEP IRA", emoji: "💼" },
    { name: "403b", emoji: "🏫" },
  ],
  liabilities: [
    { name: "Mortgage", emoji: "🏦" },
    { name: "Car Loan", emoji: "🚗" },
    { name: "Student Loans", emoji: "🎓" },
    { name: "Credit Card Debt", emoji: "💳" },
    { name: "Personal Loan", emoji: "🤝" },
    { name: "Medical Debt", emoji: "🏥" },
    { name: "Personal Expenses", emoji: "🛍️" },
  ],
};

// ─── Section Header ───────────────────────────────────────────────────────────

const SectionHeader = ({ title, icon, color, bgColor, total, monthlyTotal, count, isOpen, onToggle }: {
  title: string; icon: React.ReactNode; color: string; bgColor: string; total: number; monthlyTotal?: number; count: number; isOpen: boolean; onToggle: () => void;
}) => (
  <button onClick={onToggle} style={{
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px", border: "none", borderRadius: 12, cursor: "pointer",
    backgroundColor: bgColor, transition: "all 0.2s",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <div style={{ textAlign: "left" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textMain }}>{title}</div>
        <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{count} item{count !== 1 ? "s" : ""}</div>
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color }}>{fmt(total)}</div>
        {monthlyTotal !== undefined && <div style={{ fontSize: 11, color: COLORS.textSecondary }}>{fmt(monthlyTotal)}/mo</div>}
      </div>
      {isOpen ? <ChevronUp size={18} color={COLORS.textSecondary} /> : <ChevronDown size={18} color={COLORS.textSecondary} />}
    </div>
  </button>
);

// ─── Input Mode Types ─────────────────────────────────────────────────────────
// "recurring" = Income, Expenses, recurring Liabilities → Amount + Frequency (monthly/yearly)
// "asset" = Assets → Value + optional Quantity
// "value_only" = Non-Liquid Assets → just Value

type InputMode = "recurring" | "asset" | "value_only";

// ─── Editable Item Row ────────────────────────────────────────────────────────

// ─── Crypto Search Dropdown ───────────────────────────────────────────────────

const CoinSearchDropdown = ({ onSelect, inputStyle }: {
  onSelect: (coin: CoinSearchResult) => void;
  inputStyle: React.CSSProperties;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CoinSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length < 2) { setResults([]); setShowDropdown(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const coins = await searchCoins(val);
      setResults(coins);
      setShowDropdown(coins.length > 0);
      setLoading(false);
    }, 300);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: COLORS.textMuted }} />
        <input
          style={{ ...inputStyle, paddingLeft: 28 }}
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          placeholder="Search crypto (e.g. bitcoin)"
        />
        {loading && <Loader2 size={14} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: COLORS.textMuted, animation: "spin 1s linear infinite" }} />}
      </div>
      {showDropdown && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          backgroundColor: COLORS.card, borderRadius: 8, border: `1px solid ${COLORS.border}`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 200, overflowY: "auto", marginTop: 2,
        }}>
          {results.map(coin => (
            <button key={coin.id} onClick={() => { onSelect(coin); setQuery(""); setShowDropdown(false); setResults([]); }} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
              border: "none", backgroundColor: "transparent", cursor: "pointer", textAlign: "left",
              fontSize: 13, color: COLORS.textMain, borderBottom: `1px solid ${COLORS.borderLight}`,
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = COLORS.assetBg; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              <img src={coin.thumb} alt="" style={{ width: 20, height: 20, borderRadius: 10 }} />
              <span style={{ fontWeight: 600 }}>{coin.name}</span>
              <span style={{ color: COLORS.textMuted, fontSize: 11, textTransform: "uppercase" }}>{coin.symbol}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Stock Ticker Input ──────────────────────────────────────────────────────

const StockTickerInput = ({ draft, setDraft, inputStyle, color }: {
  draft: BudgetItem;
  setDraft: React.Dispatch<React.SetStateAction<BudgetItem>>;
  inputStyle: React.CSSProperties;
  color: string;
}) => {
  const [fetching, setFetching] = useState(false);
  const [tickerInput, setTickerInput] = useState(draft.ticker || "");
  const [priceInput, setPriceInput] = useState(draft.livePrice ? String(draft.livePrice) : "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalcAmount = (price: number, qty: number) => Math.round(price * qty * 100) / 100;

  // Debounced price lookup when ticker changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const symbol = tickerInput.trim();
    if (symbol.length < 1) {
      setDraft(d => ({ ...d, ticker: undefined, livePrice: undefined, name: "" }));
      return;
    }
    setDraft(d => ({ ...d, ticker: symbol, name: symbol }));
    if (symbol.length < 2) return;

    debounceRef.current = setTimeout(async () => {
      setFetching(true);
      try {
        const prices = await fetchStockPrices([symbol]);
        if (prices[symbol]) {
          const price = prices[symbol];
          setPriceInput(String(price));
          setDraft(d => {
            const newAmount = d.quantity ? recalcAmount(price, d.quantity) : price;
            return { ...d, livePrice: price, amount: newAmount };
          });
        }
      } catch {}
      setFetching(false);
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [tickerInput]);

  const hasTicker = tickerInput.trim().length >= 1;

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Ticker Symbol</label>
      <input style={{ ...inputStyle, textTransform: "uppercase" }} value={tickerInput}
        onChange={e => setTickerInput(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ""))}
        placeholder="e.g. AAPL, TSLA, VOO" autoFocus />
      {fetching && <div style={{ fontSize: 11, color: "#2563EB", marginTop: 4 }}>Looking up {tickerInput}...</div>}

      {hasTicker && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Price / Share</label>
            <input style={inputStyle} type="number" step="any" value={priceInput}
              onChange={e => {
                setPriceInput(e.target.value);
                const price = parseFloat(e.target.value) || 0;
                const qty = draft.quantity || 0;
                setDraft(d => ({ ...d, livePrice: price || undefined, amount: qty > 0 && price > 0 ? recalcAmount(price, qty) : price }));
              }}
              placeholder="$0.00" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Shares</label>
            <input style={inputStyle} type="number" step="any" value={draft.quantity || ""}
              onChange={e => {
                const qty = parseFloat(e.target.value) || 0;
                const price = parseFloat(priceInput) || 0;
                const newAmount = qty > 0 && price > 0 ? recalcAmount(price, qty) : draft.amount;
                setDraft(d => ({ ...d, quantity: qty || undefined, amount: newAmount }));
              }}
              placeholder="Qty" />
          </div>
        </div>
      )}

      {hasTicker && draft.livePrice && draft.quantity && draft.quantity > 0 && (
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6, display: "flex", justifyContent: "space-between", padding: "6px 10px", backgroundColor: "#2563EB10", borderRadius: 8, border: "1px solid #2563EB30" }}>
          <span>📈 {draft.ticker} × {draft.quantity}</span>
          <span><strong style={{ color }}>{fmt(draft.amount)}</strong></span>
        </div>
      )}
    </div>
  );
};

// ─── Editable Item Row (continued) ───────────────────────────────────────────

const ItemRow = ({ item, onUpdate, onDelete, inputMode, color }: {
  item: BudgetItem; onUpdate: (u: Partial<BudgetItem>) => void; onDelete: () => void; inputMode: InputMode; color: string;
}) => {
  const isNew = !item.amount;
  const [editing, setEditing] = useState(isNew);
  const [draft, setDraft] = useState(item);

  useEffect(() => { setDraft(item); }, [item]);

  const save = () => {
    const freq = draft.frequency || (inputMode === "recurring" ? "monthly" : "one_time");
    let amount = draft.amount;
    // For crypto/stock with quantity + livePrice, compute amount
    if ((draft.assetType === "crypto" || draft.assetType === "stock") && draft.ticker && draft.livePrice && draft.quantity) {
      amount = Math.round(draft.livePrice * draft.quantity * 100) / 100;
    }
    const computed = computeValues(amount, freq);
    onUpdate({ ...draft, amount, frequency: freq, ...computed });
    setEditing(false);
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
    fontSize: 13, width: "100%", boxSizing: "border-box", fontFamily: "inherit",
    outline: "none",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: "none" as const, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: 24,
  };

  const freqLabel = (f: Frequency) => f === "monthly" ? "/mo" : f === "yearly" ? "/yr" : "";

  const handleCoinSelect = async (coin: CoinSearchResult) => {
    setDraft(d => ({ ...d, name: coin.name, assetType: "crypto" as AssetType, ticker: coin.id }));
    // Auto-fetch live price
    try {
      const prices = await fetchCryptoPrices([coin.id]);
      if (prices[coin.id]) {
        setDraft(d => {
          const price = prices[coin.id];
          const newAmount = d.quantity ? Math.round(price * d.quantity * 100) / 100 : d.amount;
          return { ...d, livePrice: price, amount: newAmount };
        });
      }
    } catch {}
  };

  if (editing) {
    return (
      <div style={{ padding: "10px 12px", backgroundColor: COLORS.card, borderRadius: 10, border: `1px solid ${COLORS.border}`, marginBottom: 6 }}>
        {inputMode === "asset" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setDraft(d => ({ ...d, assetType: "crypto" as AssetType }))}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${draft.assetType === "crypto" ? "#F7931A" : COLORS.border}`,
                backgroundColor: draft.assetType === "crypto" ? "#F7931A15" : "transparent",
                color: draft.assetType === "crypto" ? "#F7931A" : COLORS.textSecondary,
                fontSize: 11, fontWeight: 600, cursor: "pointer" }}>₿ Crypto</button>
            <button onClick={() => setDraft(d => ({ ...d, assetType: "stock" as AssetType, ticker: undefined, livePrice: undefined }))}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${draft.assetType === "stock" ? "#2563EB" : COLORS.border}`,
                backgroundColor: draft.assetType === "stock" ? "#2563EB15" : "transparent",
                color: draft.assetType === "stock" ? "#2563EB" : COLORS.textSecondary,
                fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📈 Stock</button>
            <button onClick={() => setDraft(d => ({ ...d, assetType: undefined, ticker: undefined, livePrice: undefined }))}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${!draft.assetType || draft.assetType === "manual" ? color : COLORS.border}`,
                backgroundColor: !draft.assetType || draft.assetType === "manual" ? `${color}15` : "transparent",
                color: !draft.assetType || draft.assetType === "manual" ? color : COLORS.textSecondary,
                fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Manual</button>
          </div>
        )}

        {inputMode === "asset" && draft.assetType === "crypto" && !draft.ticker && (
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Search Cryptocurrency</label>
            <CoinSearchDropdown onSelect={handleCoinSelect} inputStyle={inputStyle} />
          </div>
        )}

        {inputMode === "asset" && draft.assetType === "crypto" && draft.ticker && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", backgroundColor: "#F7931A10", borderRadius: 8, border: "1px solid #F7931A30", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#F7931A" }}>₿ {draft.name}</span>
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>({draft.ticker})</span>
              <button onClick={() => setDraft(d => ({ ...d, ticker: undefined, name: "", livePrice: undefined }))} style={{ marginLeft: "auto", padding: 2, border: "none", background: "none", cursor: "pointer", color: COLORS.textMuted, display: "flex" }}><X size={14} /></button>
            </div>
            <div style={{ marginBottom: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Quantity</label>
              <input style={inputStyle} type="number" step="any" value={draft.quantity || ""} onChange={e => {
                const qty = parseFloat(e.target.value) || 0;
                const newAmount = draft.livePrice ? Math.round(draft.livePrice * qty * 100) / 100 : draft.amount;
                setDraft(d => ({ ...d, quantity: qty || undefined, amount: newAmount }));
              }} placeholder="How many?" autoFocus />
            </div>
            {draft.livePrice ? (
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <span>Price: <strong>{fmtPrice(draft.livePrice)}</strong>/unit</span>
                {draft.quantity ? <span>Total: <strong style={{ color }}>{fmt(draft.livePrice * draft.quantity)}</strong></span> : null}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>Fetching price...</div>
            )}
          </div>
        )}

        {inputMode === "asset" && draft.assetType === "stock" && <StockTickerInput draft={draft} setDraft={setDraft} inputStyle={inputStyle} color={color} />}

        {(inputMode !== "asset" || !draft.assetType || draft.assetType === "manual") && (
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Name</label>
            <input autoFocus={!draft.name} style={inputStyle} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Description" />
          </div>
        )}

        {inputMode === "recurring" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Amount</label>
              <input autoFocus={!!draft.name} style={inputStyle} type="number" value={draft.amount || ""} onChange={e => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })} placeholder="$0" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Frequency</label>
              <select style={selectStyle} value={draft.frequency || "monthly"} onChange={e => setDraft({ ...draft, frequency: e.target.value as Frequency })}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="one_time">One-time</option>
              </select>
            </div>
          </div>
        )}

        {inputMode === "asset" && (!draft.assetType || draft.assetType === "manual") && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Value</label>
              <input autoFocus={!!draft.name} style={inputStyle} type="number" value={draft.amount || ""} onChange={e => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })} placeholder="$0" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Quantity (optional)</label>
              <input style={inputStyle} type="number" step="any" value={draft.quantity || ""} onChange={e => setDraft({ ...draft, quantity: parseFloat(e.target.value) || undefined })} placeholder="Qty" />
            </div>
          </div>
        )}

        {inputMode === "value_only" && (
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Value</label>
            <input autoFocus={!!draft.name} style={inputStyle} type="number" value={draft.amount || ""} onChange={e => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })} placeholder="$0" />
          </div>
        )}

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button onClick={() => { if (!item.name && !item.amount) { onDelete(); } else { setDraft(item); setEditing(false); } }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, backgroundColor: "white", fontSize: 12, cursor: "pointer", color: COLORS.textSecondary }}>Cancel</button>
          <button onClick={save} style={{ padding: "6px 12px", borderRadius: 6, border: "none", backgroundColor: color, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 6px 10px 4px", backgroundColor: COLORS.card, borderRadius: 10,
      border: `1px solid ${COLORS.borderLight}`, marginBottom: 4, transition: "all 0.15s",
    }}>
      <div className="drag-handle" style={{ padding: "4px 4px", cursor: "grab", color: COLORS.textMuted, display: "flex", flexShrink: 0 }}>
        <GripVertical size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.textMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
          {item.assetType === "crypto" && <span style={{ fontSize: 11, color: "#F7931A", fontWeight: 700 }}>₿</span>}
          {item.assetType === "stock" && <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 700 }}>📈</span>}
          {item.name || "Unnamed"}
        </div>
        <div style={{ fontSize: 11, color: COLORS.textSecondary, display: "flex", gap: 8, marginTop: 2 }}>
          {item.quantity !== undefined && item.quantity > 0 && <span>Qty: {item.quantity}</span>}
          {(item.assetType === "crypto" || item.assetType === "stock") && item.livePrice && <span>@ {fmtPrice(item.livePrice)}</span>}
          {inputMode === "recurring" && item.frequency !== "one_time" && <span>{fmt(item.amount)}{freqLabel(item.frequency)}</span>}
          {inputMode === "recurring" && item.frequency === "yearly" && item.monthlyValue > 0 && <span>({fmt(item.monthlyValue)}/mo)</span>}
          {inputMode === "recurring" && item.frequency === "monthly" && <span>({fmt(item.totalValue)}/yr)</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color, whiteSpace: "nowrap" }}>{fmtExact(item.totalValue)}</div>
        <button onClick={() => setEditing(true)} style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: COLORS.textMuted, display: "flex" }}><Edit2 size={14} /></button>
        <button onClick={onDelete} style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: COLORS.textMuted, display: "flex" }}><Trash2 size={14} /></button>
      </div>
    </div>
  );
};

// ─── Budget Section ───────────────────────────────────────────────────────────

const BudgetSection = ({ title, icon, color, bgColor, items, onUpdate, onAdd, onAddPreset, onDelete, onReorder, inputMode, presets, footer }: {
  title: string; icon: React.ReactNode; color: string; bgColor: string;
  items: BudgetItem[]; onUpdate: (id: string, u: Partial<BudgetItem>) => void;
  onAdd: () => void; onAddPreset: (name: string, assetType?: AssetType) => void; onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  inputMode: InputMode; presets?: Preset[]; footer?: React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const total = items.reduce((s, i) => s + i.totalValue, 0);
  const showMonthly = inputMode === "recurring";
  const monthlyTotal = showMonthly ? items.reduce((s, i) => s + i.monthlyValue, 0) : undefined;

  // Filter out presets that already exist as items
  const existingNames = new Set(items.map(i => i.name.toLowerCase()));
  const availablePresets = (presets || []).filter(p => p.persistent || !existingNames.has(p.name.toLowerCase()));

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  };
  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) onReorder(dragIdx, idx);
    setDragIdx(null);
    setOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  return (
    <div style={{ marginBottom: 12 }}>
      <SectionHeader title={title} icon={icon} color={color} bgColor={bgColor}
        total={total} monthlyTotal={monthlyTotal} count={items.length} isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div style={{ padding: "10px 12px 12px", border: `1px solid ${color}20`, borderRadius: "0 0 12px 12px", marginTop: -2 }}>
          {items.map((item, idx) => (
            <div key={item.id} draggable onDragStart={e => handleDragStart(e, idx)} onDragOver={e => handleDragOver(e, idx)}
              onDrop={e => handleDrop(e, idx)} onDragEnd={handleDragEnd}
              style={{ opacity: dragIdx === idx ? 0.4 : 1, borderTop: overIdx === idx && dragIdx !== null && dragIdx !== idx ? `2px solid ${color}` : "2px solid transparent", transition: "opacity 0.15s" }}>
              <ItemRow item={item} color={color}
                onUpdate={u => onUpdate(item.id, u)} onDelete={() => onDelete(item.id)}
                inputMode={inputMode} />
            </div>
          ))}

          {/* Quick add chips + custom */}
          <div style={{ marginTop: 12, marginBottom: 6 }}>
            {availablePresets.length > 0 && (
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6, paddingLeft: 2 }}>Quick add:</div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {availablePresets.map(p => (
                <button key={p.name} onClick={() => onAddPreset(p.name, p.assetType)} style={{
                  padding: "6px 12px", borderRadius: 20, border: `1px solid ${color}30`,
                  backgroundColor: `${bgColor}`, color: color, fontSize: 12, fontWeight: 500,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                  transition: "all 0.15s",
                }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.backgroundColor = `${color}15`; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.backgroundColor = bgColor; }}
                >
                  <span>{p.emoji}</span> {p.name}
                </button>
              ))}
              <button onClick={onAdd} style={{
                padding: "6px 12px", borderRadius: 20, border: `1px dashed ${color}50`,
                backgroundColor: "transparent", color: color, fontSize: 12, fontWeight: 500,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                transition: "all 0.15s",
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.backgroundColor = `${color}10`; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <Plus size={14} /> Custom
              </button>
            </div>
          </div>
          {footer}
        </div>
      )}
    </div>
  );
};

// ─── Summary Section ──────────────────────────────────────────────────────────

const SummarySection = ({ budget }: { budget: Budget }) => {
  const totalMonthlyIncome = budget.income.reduce((s, i) => s + i.monthlyValue, 0);
  const totalMonthlyExpenses = budget.expenses.reduce((s, i) => s + i.monthlyValue, 0);
  const totalMonthlyLiabilityPayments = budget.liabilities.reduce((s, i) => s + i.monthlyValue, 0);
  const monthlyNet = totalMonthlyIncome - totalMonthlyExpenses - totalMonthlyLiabilityPayments;
  const annualNet = monthlyNet * 12;

  const totalLiquidAssets = budget.assets.reduce((s, i) => s + i.totalValue, 0);
  const totalNonLiquidAssets = budget.nonLiquidAssets.reduce((s, i) => s + i.totalValue, 0);
  const totalRetirement = budget.retirement.reduce((s, i) => s + i.totalValue, 0);
  const nonLiquidAtDiscount = totalNonLiquidAssets * (1 - budget.nonLiquidDiscount / 100);

  // Separate one-time liabilities (lump sums owed) from recurring liabilities (monthly payments)
  const oneTimeLiabilities = budget.liabilities.filter(i => i.frequency === "one_time").reduce((s, i) => s + i.totalValue, 0);
  const totalLiabilities = budget.liabilities.reduce((s, i) => s + i.totalValue, 0);

  const liquidAfterLiabilities = totalLiquidAssets - oneTimeLiabilities;
  const netWorth = liquidAfterLiabilities + nonLiquidAtDiscount + totalRetirement;

  // Runway: how many months liquid assets (minus one-time debts) last at current burn rate
  const monthlyBurn = totalMonthlyExpenses + totalMonthlyLiabilityPayments - totalMonthlyIncome;
  const liquidForRunway = Math.max(0, liquidAfterLiabilities);
  const runwayMonths = monthlyBurn > 0 && liquidForRunway > 0 ? liquidForRunway / monthlyBurn : null;
  const runwayYears = runwayMonths ? runwayMonths / 12 : null;

  // Extended runway: liquid + non-liquid at discount
  const extendedForRunway = liquidForRunway + nonLiquidAtDiscount;
  const extRunwayMonths = monthlyBurn > 0 && extendedForRunway > 0 ? extendedForRunway / monthlyBurn : null;
  const extRunwayYears = extRunwayMonths ? extRunwayMonths / 12 : null;

  // Growth: annual savings rate
  const savingsRate = totalMonthlyIncome > 0 ? (monthlyNet / totalMonthlyIncome) * 100 : 0;

  const isPositive = monthlyNet >= 0;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        backgroundColor: isPositive ? COLORS.incomeBg : COLORS.expenseBg,
        borderRadius: 16, padding: "20px 16px", marginBottom: 12,
        border: `1px solid ${isPositive ? COLORS.income : COLORS.expense}20`,
      }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Left: Cash Flow */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Monthly Cash Flow
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: isPositive ? COLORS.positive : COLORS.negative }}>
                {monthlyNet >= 0 ? "+" : ""}{fmt(monthlyNet)}
              </span>
              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>/mo</span>
            </div>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 10 }}>
              {annualNet >= 0 ? "+" : ""}{fmt(annualNet)} /year
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, color: COLORS.textMuted }}>Income</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.income }}>{fmt(totalMonthlyIncome)}/mo</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: COLORS.textMuted }}>Expenses</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.expense }}>{fmt(totalMonthlyExpenses)}/mo</div>
              </div>
              {totalMonthlyLiabilityPayments > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>Liabilities</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.liability }}>{fmt(totalMonthlyLiabilityPayments)}/mo</div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Runway or Growth */}
          {runwayMonths !== null ? (
            <div style={{ borderLeft: `1px solid ${isPositive ? COLORS.income : COLORS.expense}20`, paddingLeft: 16, minWidth: 120 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <Clock size={14} color={COLORS.expense} />
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.expense, textTransform: "uppercase" }}>Runway</span>
              </div>
              <div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>Liquid only</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.expense }}>
                  {runwayYears! >= 1 ? `${runwayYears!.toFixed(1)} yrs` : `${Math.round(runwayMonths)} mo`}
                </div>
              </div>
              {extRunwayMonths !== null && nonLiquidAtDiscount > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>+ Non-liquid sold</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.nonLiquid }}>
                    {extRunwayYears! >= 1 ? `${extRunwayYears!.toFixed(1)} yrs` : `${Math.round(extRunwayMonths)} mo`}
                  </div>
                </div>
              )}
            </div>
          ) : isPositive && monthlyNet > 0 ? (
            <div style={{ borderLeft: `1px solid ${COLORS.income}20`, paddingLeft: 16, minWidth: 120 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <ArrowUpRight size={14} color={COLORS.income} />
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.income, textTransform: "uppercase" }}>Growth</span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMain }}>
                <strong>{fmt(annualNet)}</strong>/yr
              </div>
              <div style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 4 }}>
                2yr: +{fmt(annualNet * 2)}<br/>5yr: +{fmt(annualNet * 5)}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Asset Breakdown — compact single card */}
      <div style={{
        backgroundColor: COLORS.card, borderRadius: 12, padding: "16px",
        border: `1px solid ${COLORS.border}`, marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
          Asset Breakdown
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: COLORS.textSecondary }}>Liquid assets</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.asset }}>{fmtExact(totalLiquidAssets)}</span>
          </div>
          {oneTimeLiabilities > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 12 }}>
              <span style={{ fontSize: 12, color: COLORS.textMuted }}>− One-time debts</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.liability }}>−{fmtExact(oneTimeLiabilities)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>= Liquid available</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: liquidAfterLiabilities >= 0 ? COLORS.positive : COLORS.negative }}>{fmtExact(liquidAfterLiabilities)}</span>
          </div>

          <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, marginTop: 4, paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: COLORS.textSecondary }}>Non-liquid (at {budget.nonLiquidDiscount}% discount)</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.nonLiquid }}>{fmtExact(nonLiquidAtDiscount)}</span>
          </div>

          {totalRetirement > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>401k / Retirement</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.retirement }}>{fmtExact(totalRetirement)}</span>
            </div>
          )}

          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textMain }}>Net Worth</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: netWorth >= 0 ? COLORS.positive : COLORS.negative }}>{fmtExact(netWorth)}</span>
          </div>
        </div>
      </div>

      {/* ─── Runway Projection Chart ──────────────────────────────── */}
      {(() => {
        const projectionYears = 20;
        // Liquid line starts at liquid available, extended starts at full net worth
        const startLiquid = Math.max(0, liquidAfterLiabilities);
        const startExt = Math.max(0, netWorth);
        const data: { year: number; liquid: number; extended: number }[] = [];

        // Monthly burn is the net outflow (positive = spending more than earning)
        const annualBurn = monthlyBurn * 12; // monthlyBurn > 0 means money going out

        let balLiquid = startLiquid;
        let balExtended = startExt;
        let liquidHitZero = false;
        let extHitZero = false;

        for (let yr = 0; yr <= projectionYears; yr++) {
          data.push({
            year: yr,
            liquid: Math.round(Math.max(0, balLiquid)),
            extended: nonLiquidAtDiscount > 0 || totalRetirement > 0 ? Math.round(Math.max(0, balExtended)) : 0,
          });
          if (monthlyBurn > 0) {
            // Burning: subtract annual burn
            balLiquid -= annualBurn;
            balExtended -= annualBurn;
          } else {
            // Growing: add annual net (which is positive)
            balLiquid += annualNet;
            balExtended += annualNet;
          }
          // Once both hit zero, stop adding more points
          if (balLiquid <= 0) liquidHitZero = true;
          if (balExtended <= 0) extHitZero = true;
          if (liquidHitZero && extHitZero) break;
        }

        // Find zero-crossing year for liquid
        const liquidZeroYear = monthlyBurn > 0 ? data.find((d, i) => i > 0 && d.liquid === 0)?.year : null;
        const extZeroYear = monthlyBurn > 0 ? data.find((d, i) => i > 0 && d.extended === 0)?.year : null;

        const maxVal = Math.max(...data.map(d => Math.max(d.liquid, d.extended)));
        const minVal = Math.min(...data.map(d => Math.min(d.liquid, d.extended)));

        const formatYAxis = (val: number) => {
          if (Math.abs(val) >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
          if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(0)}K`;
          return `$${val}`;
        };

        return (
          <div style={{
            backgroundColor: COLORS.card, borderRadius: 12, padding: "16px",
            border: `1px solid ${COLORS.border}`, marginBottom: 12,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
              {monthlyBurn > 0 ? "Runway Projection" : "Wealth Projection"} — {projectionYears} Years
            </div>
            <div style={{ height: 240, width: "100%", fontSize: 11 }}>
              <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradLiquid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={monthlyBurn > 0 ? COLORS.expense : COLORS.income} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={monthlyBurn > 0 ? COLORS.expense : COLORS.income} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradExtended" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.nonLiquid} stopOpacity={0.1} />
                      <stop offset="95%" stopColor={COLORS.nonLiquid} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: COLORS.textSecondary, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: COLORS.border }}
                    tickFormatter={(v) => `Yr ${v}`}
                  />
                  <YAxis
                    tick={{ fill: COLORS.textSecondary, fontSize: 11 }}
                    tickFormatter={formatYAxis}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const liq = payload.find(p => p.dataKey === "liquid")?.value as number;
                        const ext = payload.find(p => p.dataKey === "extended")?.value as number;
                        return (
                          <div style={{ backgroundColor: "white", padding: 12, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", border: `1px solid ${COLORS.border}`, fontSize: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 6, color: COLORS.textMain }}>Year {label}</div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
                              <span style={{ color: monthlyBurn > 0 ? COLORS.expense : COLORS.income, fontWeight: 600 }}>Liquid</span>
                              <span style={{ fontWeight: 700, color: liq >= 0 ? COLORS.positive : COLORS.negative }}>{fmt(liq)}</span>
                            </div>
                            {nonLiquidAtDiscount > 0 && (
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                <span style={{ color: COLORS.nonLiquid, fontWeight: 600 }}>+ Non-liquid</span>
                                <span style={{ fontWeight: 700, color: ext >= 0 ? COLORS.positive : COLORS.negative }}>{fmt(ext)}</span>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {nonLiquidAtDiscount > 0 && (
                    <Area type="monotone" dataKey="extended" stroke={COLORS.nonLiquid} fill="url(#gradExtended)" strokeWidth={2} strokeDasharray="5 5" name="Extended" />
                  )}
                  <Area type="monotone" dataKey="liquid" stroke={monthlyBurn > 0 ? COLORS.expense : COLORS.income} fill="url(#gradLiquid)" strokeWidth={2} name="Liquid" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8, fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 16, height: 3, backgroundColor: monthlyBurn > 0 ? COLORS.expense : COLORS.income, borderRadius: 2 }} />
                <span style={{ color: COLORS.textSecondary }}>Liquid assets</span>
              </div>
              {nonLiquidAtDiscount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 16, height: 3, backgroundColor: COLORS.nonLiquid, borderRadius: 2, borderTop: "1px dashed" }} />
                  <span style={{ color: COLORS.textSecondary }}>+ Non-liquid sold</span>
                </div>
              )}
            </div>
            {monthlyBurn > 0 && (liquidZeroYear || extZeroYear) && (
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, backgroundColor: `${COLORS.expense}08`, fontSize: 11, color: COLORS.textSecondary }}>
                {liquidZeroYear && <div>Liquid assets depleted at <strong style={{ color: COLORS.expense }}>year {liquidZeroYear}</strong></div>}
                {extZeroYear && nonLiquidAtDiscount > 0 && <div>All assets depleted at <strong style={{ color: COLORS.nonLiquid }}>year {extZeroYear}</strong></div>}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// ─── Hydration ────────────────────────────────────────────────────────────────

const hydrateFromInitialData = (data: any): Budget | null => {
  if (!data || typeof data !== "object") return null;
  // Check if there's anything to hydrate
  const keys = Object.keys(data).filter(k => k !== "ready" && k !== "timestamp" && k !== "input_source" && k !== "summary" && k !== "suggested_followups");
  if (keys.length === 0) return null;

  console.log("[Hydration] Applying initialData:", data);

  // ── Helper: find or add an item by name in a section ──
  const findOrAdd = (arr: BudgetItem[], name: string, amount: number, freq: Frequency = "one_time"): BudgetItem[] => {
    const existing = arr.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.amount = amount;
      Object.assign(existing, computeValues(amount, existing.frequency));
      return arr;
    }
    const item = freq === "one_time" ? mia(name, amount) : mi(name, amount, freq);
    return [...arr, item];
  };

  // ── Helper: update matching item or add new ──
  const upsert = (arr: BudgetItem[], name: string, amount: number, freq: Frequency = "one_time"): BudgetItem[] => {
    const lc = name.toLowerCase();
    const idx = arr.findIndex(i => i.name.toLowerCase().includes(lc) || lc.includes(i.name.toLowerCase()));
    if (idx >= 0) {
      const item = arr[idx];
      arr[idx] = { ...item, amount, ...computeValues(amount, item.frequency) };
      return arr;
    }
    const item = freq === "one_time" ? mia(name, amount) : mi(name, amount, freq);
    return [...arr, item];
  };

  // ── Start from preset or empty ──
  let base: Budget;
  if (data.preset) {
    const preset = BUDGET_PRESETS.find(p => p.key === data.preset);
    if (preset) {
      const now = Date.now();
      base = { ...emptyBudget(), ...preset.budget, id: generateId(), createdAt: now, updatedAt: now };
    } else {
      base = emptyBudget();
    }
  } else {
    base = emptyBudget();
  }

  // ── Override name ──
  if (data.budget_name) base.name = data.budget_name;

  // ── Context: unemployed → zero out income ──
  if (data.is_unemployed) {
    if (base.income.length > 0) {
      base.income = base.income.map(i => ({ ...i, amount: 0, ...computeValues(0, i.frequency) }));
    }
    // Ensure emergency fund is prominent
    if (!base.assets.some(a => /emergency/i.test(a.name))) {
      base.assets = findOrAdd(base.assets, "Emergency Fund", 0);
    }
  }

  // ── Context: homeowner → swap rent to mortgage ──
  if (data.is_homeowner) {
    base.expenses = base.expenses.map(i => {
      if (/\brent\b/i.test(i.name) && !/mortgage/i.test(i.name)) {
        return { ...i, name: "Mortgage Payment" };
      }
      return i;
    });
  }

  // ── Context: children → ensure childcare expense ──
  if (data.num_children && data.num_children > 0) {
    if (!base.expenses.some(e => /child|daycare|kids/i.test(e.name))) {
      base.expenses = findOrAdd(base.expenses, "Childcare / Daycare", data.num_children * 800, "monthly");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INCOME — specific items override or add, then total scaling
  // ═══════════════════════════════════════════════════════════════════════════

  // Convert annual to monthly
  const effectiveMonthlyIncome = data.monthly_income || (data.annual_income ? Math.round(data.annual_income / 12) : undefined);

  // Specific income items
  if (data.salary) base.income = upsert(base.income, "Salary", data.salary, "monthly");
  if (data.side_income) base.income = upsert(base.income, "Freelance / Side Hustle", data.side_income, "monthly");
  if (data.rental_income) base.income = upsert(base.income, "Rental Income", data.rental_income, "monthly");
  if (data.social_security) base.income = upsert(base.income, "Social Security", data.social_security, "monthly");
  if (data.pension_income) base.income = upsert(base.income, "Pension", data.pension_income, "monthly");
  if (data.investment_income) base.income = upsert(base.income, "Investment Income", data.investment_income, "monthly");

  // If only total monthly income given (no specific items), scale existing preset proportionally
  if (effectiveMonthlyIncome && !data.salary && !data.side_income && !data.rental_income && !data.social_security && !data.pension_income) {
    const currentTotal = base.income.reduce((s, i) => s + i.monthlyValue, 0);
    if (currentTotal > 0) {
      const ratio = effectiveMonthlyIncome / currentTotal;
      base.income = base.income.map(i => {
        const newAmt = Math.round(i.amount * ratio);
        return { ...i, amount: newAmt, ...computeValues(newAmt, i.frequency) };
      });
    } else if (base.income.length === 0) {
      base.income = [mi("Income", effectiveMonthlyIncome)];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPENSES — specific items override or add, then total scaling
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.rent) base.expenses = upsert(base.expenses, "Rent", data.rent, "monthly");
  if (data.mortgage_payment) base.expenses = upsert(base.expenses, "Mortgage Payment", data.mortgage_payment, "monthly");
  if (data.utilities) base.expenses = upsert(base.expenses, "Utilities", data.utilities, "monthly");
  if (data.groceries) base.expenses = upsert(base.expenses, "Groceries", data.groceries, "monthly");
  if (data.car_payment) base.expenses = upsert(base.expenses, "Car Payment", data.car_payment, "monthly");
  if (data.car_insurance) base.expenses = upsert(base.expenses, "Car Insurance", data.car_insurance, "monthly");
  if (data.health_insurance) base.expenses = upsert(base.expenses, "Health Insurance", data.health_insurance, "monthly");
  if (data.phone_bill) base.expenses = upsert(base.expenses, "Phone Bill", data.phone_bill, "monthly");
  if (data.internet) base.expenses = upsert(base.expenses, "Internet", data.internet, "monthly");
  if (data.childcare) base.expenses = upsert(base.expenses, "Childcare / Daycare", data.childcare, "monthly");
  if (data.subscriptions) base.expenses = upsert(base.expenses, "Subscriptions", data.subscriptions, "monthly");
  if (data.dining_out) base.expenses = upsert(base.expenses, "Dining Out", data.dining_out, "monthly");
  if (data.transportation) base.expenses = upsert(base.expenses, "Gas / Transportation", data.transportation, "monthly");

  // Scale if only lump sum given
  if (data.monthly_expenses && !data.rent && !data.mortgage_payment && !data.groceries) {
    const currentTotal = base.expenses.reduce((s, i) => s + i.monthlyValue, 0);
    if (currentTotal > 0) {
      const ratio = data.monthly_expenses / currentTotal;
      base.expenses = base.expenses.map(i => {
        const newAmt = Math.round(i.amount * ratio);
        return { ...i, amount: newAmt, ...computeValues(newAmt, i.frequency) };
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIQUID ASSETS — specific items, crypto tickers, stock tickers
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.checking_balance) base.assets = upsert(base.assets, "Checking Account", data.checking_balance);
  if (data.savings_balance) base.assets = upsert(base.assets, "Savings Account", data.savings_balance);
  if (data.emergency_fund) base.assets = upsert(base.assets, "Emergency Fund", data.emergency_fund);
  if (data.investment_balance) base.assets = upsert(base.assets, "Brokerage Account", data.investment_balance);

  // Crypto: add specific tickers as individual asset items
  if (data.crypto_tickers) {
    const tickers = data.crypto_tickers.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);
    for (const ticker of tickers) {
      const name = ticker.charAt(0).toUpperCase() + ticker.slice(1);
      if (!base.assets.some(a => a.ticker === ticker)) {
        base.assets.push({ ...mia(name, 0), assetType: "crypto" as AssetType, ticker, quantity: undefined });
      }
    }
  } else if (data.has_crypto || data.crypto_balance) {
    if (!base.assets.some(a => a.assetType === "crypto" || /crypto/i.test(a.name))) {
      base.assets.push({ ...mia("Crypto Portfolio", data.crypto_balance || 0), assetType: "crypto" as AssetType, ticker: "bitcoin" });
    } else if (data.crypto_balance) {
      base.assets = base.assets.map(a => (a.assetType === "crypto" || /crypto/i.test(a.name)) ? { ...a, amount: data.crypto_balance, totalValue: data.crypto_balance } : a);
    }
  }

  // Stocks: add specific tickers as individual asset items
  if (data.stock_tickers) {
    const tickers = data.stock_tickers.split(",").map((t: string) => t.trim().toUpperCase()).filter(Boolean);
    for (const ticker of tickers) {
      if (!base.assets.some(a => a.ticker === ticker && a.assetType === "stock")) {
        base.assets.push({ ...mia(ticker, 0), assetType: "stock" as AssetType, ticker, quantity: undefined });
      }
    }
  } else if (data.has_stocks) {
    if (!base.assets.some(a => a.assetType === "stock" || /stock|brokerage/i.test(a.name))) {
      base.assets.push({ ...mia("Stocks/Brokerage", 0), assetType: "stock" as AssetType });
    }
  }

  // Scale liquid assets if only lump sum given
  if (data.liquid_assets && !data.checking_balance && !data.savings_balance && !data.emergency_fund) {
    const liquidItems = base.assets.filter(a => !a.assetType || a.assetType === "manual");
    const currentTotal = liquidItems.reduce((s, i) => s + i.totalValue, 0);
    if (currentTotal > 0) {
      const ratio = data.liquid_assets / currentTotal;
      base.assets = base.assets.map(i => {
        if (i.assetType && i.assetType !== "manual") return i;
        const newAmt = Math.round(i.amount * ratio);
        return { ...i, amount: newAmt, totalValue: newAmt, monthlyValue: 0 };
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NON-LIQUID ASSETS
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.home_value) base.nonLiquidAssets = upsert(base.nonLiquidAssets, "Home Value", data.home_value);
  if (data.car_value) base.nonLiquidAssets = upsert(base.nonLiquidAssets, "Car Value", data.car_value);
  if (data.jewelry_collectibles) base.nonLiquidAssets = upsert(base.nonLiquidAssets, "Jewelry / Collectibles", data.jewelry_collectibles);
  if (data.business_equity) base.nonLiquidAssets = upsert(base.nonLiquidAssets, "Business Equity", data.business_equity);

  if (data.nonliquid_assets && !data.home_value && !data.car_value) {
    const currentTotal = base.nonLiquidAssets.reduce((s, i) => s + i.totalValue, 0);
    if (currentTotal > 0) {
      const ratio = data.nonliquid_assets / currentTotal;
      base.nonLiquidAssets = base.nonLiquidAssets.map(i => {
        const newAmt = Math.round(i.amount * ratio);
        return { ...i, amount: newAmt, totalValue: newAmt, monthlyValue: 0 };
      });
    }
  }

  if (data.nonliquid_discount !== undefined) base.nonLiquidDiscount = data.nonliquid_discount;

  // ═══════════════════════════════════════════════════════════════════════════
  // RETIREMENT ACCOUNTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.balance_401k) base.retirement = upsert(base.retirement, "401k", data.balance_401k);
  if (data.roth_ira) base.retirement = upsert(base.retirement, "Roth IRA", data.roth_ira);
  if (data.traditional_ira) base.retirement = upsert(base.retirement, "Traditional IRA", data.traditional_ira);
  if (data.pension_fund) base.retirement = upsert(base.retirement, "Pension Fund", data.pension_fund);
  if (data.balance_403b) base.retirement = upsert(base.retirement, "403b", data.balance_403b);
  if (data.sep_ira) base.retirement = upsert(base.retirement, "SEP IRA", data.sep_ira);

  if (data.retirement_savings && !data.balance_401k && !data.roth_ira && !data.traditional_ira) {
    const currentTotal = base.retirement.reduce((s, i) => s + i.totalValue, 0);
    if (currentTotal > 0) {
      const ratio = data.retirement_savings / currentTotal;
      base.retirement = base.retirement.map(i => {
        const newAmt = Math.round(i.amount * ratio);
        return { ...i, amount: newAmt, totalValue: newAmt, monthlyValue: 0 };
      });
    } else if (base.retirement.length === 0) {
      base.retirement = [mia("Retirement Savings", data.retirement_savings)];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIABILITIES / DEBTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.mortgage_balance) base.liabilities = upsert(base.liabilities, "Mortgage", data.mortgage_balance);
  if (data.student_loans) base.liabilities = upsert(base.liabilities, "Student Loans", data.student_loans);
  if (data.car_loan) base.liabilities = upsert(base.liabilities, "Car Loan", data.car_loan);
  if (data.credit_card_debt) base.liabilities = upsert(base.liabilities, "Credit Card Debt", data.credit_card_debt);
  if (data.personal_loan) base.liabilities = upsert(base.liabilities, "Personal Loan", data.personal_loan);
  if (data.medical_debt) base.liabilities = upsert(base.liabilities, "Medical Bills", data.medical_debt);

  if (data.liabilities && !data.mortgage_balance && !data.student_loans && !data.car_loan && !data.credit_card_debt) {
    const currentTotal = base.liabilities.reduce((s, i) => s + i.totalValue, 0);
    if (currentTotal > 0) {
      const ratio = data.liabilities / currentTotal;
      base.liabilities = base.liabilities.map(i => {
        const newAmt = Math.round(i.amount * ratio);
        return { ...i, amount: newAmt, ...computeValues(newAmt, i.frequency) };
      });
    } else if (base.liabilities.length === 0) {
      base.liabilities = [mia("Total Debt", data.liabilities)];
    }
  }

  return base;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MyBudget({ initialData }: { initialData?: any }) {
  const [savedBudgets, setSavedBudgets] = useState<Budget[]>(() => loadBudgets());
  const [currentView, setCurrentView] = useState<"home" | "budget">("budget");
  const [budget, setBudget] = useState<Budget>(() => {
    const hydrated = hydrateFromInitialData(initialData);
    if (hydrated) return hydrated;
    return loadCurrentBudget() || emptyBudget();
  });
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(budget.name);
  const [refreshing, setRefreshing] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [subscribeMessage, setSubscribeMessage] = useState("");
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [enjoyVote, setEnjoyVote] = useState<"up" | "down" | null>(null);
  const [showNameBudgetModal, setShowNameBudgetModal] = useState(false);
  const [nameBudgetValue, setNameBudgetValue] = useState("");
  const [saveToast, setSaveToast] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pillRight, setPillRight] = useState(16);

  // Persist budget on change
  useEffect(() => {
    saveCurrentBudget(budget);
  }, [budget]);

  // Load enjoyVote from localStorage
  useEffect(() => {
    try { const v = localStorage.getItem("enjoyVote_budget"); if (v === "up" || v === "down") setEnjoyVote(v); } catch {}
  }, []);

  // Track container bounds so the fixed pill stays within the 600px widget
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPillRight(Math.max(16, window.innerWidth - rect.right + 16));
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);

  const handleEnjoyVote = (vote: "up" | "down") => {
    if (enjoyVote) return;
    setEnjoyVote(vote);
    try { localStorage.setItem("enjoyVote_budget", vote); } catch {}
    trackEvent("enjoy_vote", { vote, budgetName: budget.name || null });
    setShowFeedbackModal(true);
  };

  // Refresh all crypto + stock prices
  const refreshPrices = useCallback(async () => {
    trackEvent("refresh_prices", { budgetName: budget.name || null });
    const allItems = [...budget.assets, ...budget.nonLiquidAssets, ...budget.retirement];
    const cryptoItems = allItems.filter(i => i.assetType === "crypto" && i.ticker);
    const stockItems = allItems.filter(i => i.assetType === "stock" && i.ticker);
    if (cryptoItems.length === 0 && stockItems.length === 0) return;

    setRefreshing(true);
    try {
      const [cryptoPrices, stockPrices] = await Promise.all([
        cryptoItems.length > 0 ? fetchCryptoPrices([...new Set(cryptoItems.map(i => i.ticker!))]) : {},
        stockItems.length > 0 ? fetchStockPrices([...new Set(stockItems.map(i => i.ticker!))]) : {},
      ]);
      const allPrices: Record<string, number> = { ...cryptoPrices, ...stockPrices };

      setBudget(b => {
        const updateSection = (items: BudgetItem[]): BudgetItem[] =>
          items.map(item => {
            if ((!item.assetType || item.assetType === "manual") || !item.ticker || !allPrices[item.ticker]) return item;
            const newPrice = allPrices[item.ticker];
            const newAmount = item.quantity ? Math.round(newPrice * item.quantity * 100) / 100 : item.amount;
            const computed = computeValues(newAmount, item.frequency);
            return { ...item, livePrice: newPrice, amount: newAmount, ...computed };
          });
        return {
          ...b,
          assets: updateSection(b.assets),
          nonLiquidAssets: updateSection(b.nonLiquidAssets),
          retirement: updateSection(b.retirement),
          lastPriceRefresh: Date.now(),
          updatedAt: Date.now(),
        };
      });
    } catch (e) {
      console.error("Failed to refresh prices", e);
    } finally {
      setRefreshing(false);
    }
  }, [budget.assets, budget.nonLiquidAssets, budget.retirement]);

  // Helper to update a section
  const updateItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "retirement" | "liabilities">, id: string, updates: Partial<BudgetItem>) => {
    setBudget(b => ({
      ...b,
      [section]: b[section].map(item => item.id === id ? { ...item, ...updates } : item),
      updatedAt: Date.now(),
    }));
  };

  const addItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "retirement" | "liabilities">, freq: Frequency = "monthly") => {
    trackEvent("add_item", { section, frequency: freq, budgetName: budget.name || null });
    setBudget(b => ({
      ...b,
      [section]: [...b[section], emptyItem(freq)],
      updatedAt: Date.now(),
    }));
  };

  const addPresetItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "retirement" | "liabilities">, name: string, freq: Frequency = "monthly", assetType?: AssetType) => {
    trackEvent("add_preset_item", { section, presetName: name, frequency: freq, assetType });
    setBudget(b => ({
      ...b,
      [section]: [...b[section], { ...emptyItem(freq), name, ...(assetType ? { assetType } : {}) }],
      updatedAt: Date.now(),
    }));
  };

  const reorderItems = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "retirement" | "liabilities">, fromIndex: number, toIndex: number) => {
    setBudget(b => {
      const arr = [...b[section]];
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved);
      return { ...b, [section]: arr, updatedAt: Date.now() };
    });
  };

  const deleteItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "retirement" | "liabilities">, id: string) => {
    trackEvent("delete_item", { section, budgetName: budget.name || null });
    setBudget(b => ({
      ...b,
      [section]: b[section].filter(item => item.id !== id),
      updatedAt: Date.now(),
    }));
  };

  const doSaveBudget = (budgetToSave: Budget) => {
    const updatedBudget = { ...budgetToSave, updatedAt: Date.now() };
    const existing = loadBudgets();
    const idx = existing.findIndex(b => b.id === updatedBudget.id);
    const isNew = idx < 0;
    if (idx >= 0) {
      existing[idx] = updatedBudget;
    } else {
      existing.push(updatedBudget);
    }
    saveBudgets(existing);
    setSavedBudgets(existing);
    setBudget(updatedBudget);
    trackEvent("save_budget", { budgetName: updatedBudget.name, isNew });
    // Show toast
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 1500);
  };

  const handleSaveBudget = () => {
    const isFirstSave = !savedBudgets.some(b => b.id === budget.id);
    if (isFirstSave) {
      // First save — prompt to name the budget
      const suggested = budget.name !== "My Budget Plan" ? budget.name : "";
      setNameBudgetValue(suggested);
      setShowNameBudgetModal(true);
    } else {
      doSaveBudget(budget);
    }
  };

  const saveBudgetToList = () => {
    const existing = loadBudgets();
    const idx = existing.findIndex(b => b.id === budget.id);
    if (idx >= 0) {
      existing[idx] = { ...budget, updatedAt: Date.now() };
    } else {
      existing.push({ ...budget, updatedAt: Date.now() });
    }
    saveBudgets(existing);
    setSavedBudgets(existing);
  };

  const handleNewBudget = () => {
    trackEvent("new_budget");
    if (budget.income.length > 0 || budget.expenses.length > 0 || budget.assets.length > 0) {
      saveBudgetToList();
    }
    const newB = emptyBudget();
    setBudget(newB);
    setNameInput(newB.name);
    setCurrentView("budget");
  };

  const handleOpenBudget = (b: Budget) => {
    trackEvent("open_budget", { budgetName: b.name || null });
    if (budget.income.length > 0 || budget.expenses.length > 0 || budget.assets.length > 0) {
      saveBudgetToList();
    }
    setBudget(b);
    setNameInput(b.name);
    saveCurrentBudget(b);
    setCurrentView("budget");
  };

  const handleDeleteBudget = (id: string) => {
    trackEvent("delete_budget", { budgetId: id });
    const updated = savedBudgets.filter(b => b.id !== id);
    saveBudgets(updated);
    setSavedBudgets(updated);
  };

  const handleReset = () => {
    setConfirmDialog({
      message: "Clear all budget data on the current screen?",
      onConfirm: () => {
        trackEvent("reset", { budgetName: budget.name, itemCount: budget.income.length + budget.expenses.length + budget.assets.length });
        const newB = emptyBudget();
        setBudget(newB);
        setNameInput(newB.name);
      },
    });
  };

  const handleSubscribe = async () => {
    if (!subscribeEmail || !subscribeEmail.includes("@")) {
      setSubscribeMessage("Please enter a valid email.");
      setSubscribeStatus("error");
      return;
    }
    setSubscribeStatus("loading");
    try {
      const response = await fetch(`${API_BASE}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subscribeEmail, topicId: "budget-planner-news", topicName: "Budget Planner Updates" }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSubscribeStatus("success");
        setSubscribeMessage(data.message);
        setTimeout(() => { setShowSubscribeModal(false); setSubscribeEmail(""); setSubscribeStatus("idle"); setSubscribeMessage(""); }, 3000);
      } else {
        setSubscribeStatus("error");
        setSubscribeMessage(data.error || "Failed to subscribe.");
      }
    } catch {
      setSubscribeStatus("error");
      setSubscribeMessage("Network error. Please try again.");
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackStatus("submitting");
    try {
      const response = await fetch(`${API_BASE}/api/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "user_feedback", data: { feedback: feedbackText, tool: "budget-planner", budgetName: budget.name || null } }),
      });
      if (response.ok) {
        setFeedbackStatus("success");
        setTimeout(() => { setShowFeedbackModal(false); setFeedbackText(""); setFeedbackStatus("idle"); }, 2000);
      } else {
        setFeedbackStatus("error");
      }
    } catch {
      setFeedbackStatus("error");
    }
  };

  const handleBackToHome = () => {
    trackEvent("back_to_home");
    saveBudgetToList();
    setCurrentView("home");
  };

  const handlePrint = () => { window.print(); };

  // Homepage
  if (currentView === "home") {
    return (
      <div ref={containerRef} style={{ backgroundColor: COLORS.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", maxWidth: 600, margin: "0 auto", overflow: "hidden", boxSizing: "border-box", border: `1px solid ${COLORS.border}`, borderRadius: 16 }}>
        <div style={{ backgroundColor: COLORS.primary, padding: "24px 20px", color: "white" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <DollarSign size={28} /> The Net Worth & Budget Planner
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.85, letterSpacing: 0.2 }}>Aligned with the 50/30/20 framework recommended by the CFPB</p>
        </div>
        <div style={{ padding: 20 }}>
          <button onClick={handleNewBudget} style={{
            width: "100%", padding: 16, borderRadius: 12, border: `2px dashed ${COLORS.primary}`,
            backgroundColor: COLORS.accentLight, color: COLORS.primaryDark, fontSize: 15, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20,
          }}>
            <Plus size={20} /> Create New Budget
          </button>
          {savedBudgets.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: COLORS.textSecondary }}>
              <PiggyBank size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
              <p style={{ margin: 0 }}>No saved budgets yet</p>
              <p style={{ margin: "4px 0 0", fontSize: 13 }}>Create your first budget to get started</p>
            </div>
          ) : (
            savedBudgets.map(b => {
              const totalIncome = b.income.reduce((s, i) => s + i.monthlyValue, 0);
              const totalExpenses = b.expenses.reduce((s, i) => s + i.monthlyValue, 0);
              const net = totalIncome - totalExpenses;
              return (
                <div key={b.id} style={{
                  backgroundColor: COLORS.card, borderRadius: 12, padding: "14px 16px",
                  border: `1px solid ${COLORS.border}`, marginBottom: 8, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }} onClick={() => handleOpenBudget(b)}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textMain }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                      {b.income.length + b.expenses.length + b.assets.length + b.nonLiquidAssets.length + (b.retirement || []).length + b.liabilities.length} items · Updated {new Date(b.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: net >= 0 ? COLORS.positive : COLORS.negative }}>
                      {net >= 0 ? "+" : ""}{fmt(net)}/mo
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteBudget(b.id); }} style={{
                    padding: 6, border: "none", background: "none", cursor: "pointer", color: COLORS.textMuted, marginLeft: 8,
                  }}><Trash2 size={16} /></button>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Check if budget has content worth saving
  const hasBudgetContent = budget.income.length > 0 || budget.expenses.length > 0 || budget.assets.length > 0 || budget.nonLiquidAssets.length > 0 || budget.retirement.length > 0 || budget.liabilities.length > 0;

  // Check if there are any crypto or stock items that need price refreshing
  const hasLiveAssets = [...budget.assets, ...budget.nonLiquidAssets, ...budget.retirement].some(i => (i.assetType === "crypto" || i.assetType === "stock") && i.ticker);

  // Budget editor view
  return (
    <div ref={containerRef} style={{ backgroundColor: COLORS.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", maxWidth: 600, margin: "0 auto", boxSizing: "border-box", border: `1px solid ${COLORS.border}`, borderRadius: 16, overflow: "hidden" }}>
      <style>{`@keyframes spin { from { transform: translateY(-50%) rotate(0deg); } to { transform: translateY(-50%) rotate(360deg); } } @keyframes spinBtn { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes fadeInOut { 0% { opacity: 0; transform: translateX(-50%) translateY(-8px); } 15% { opacity: 1; transform: translateX(-50%) translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }`}</style>
      {/* Header */}
      <div style={{ backgroundColor: COLORS.primary, padding: "20px 16px", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DollarSign size={24} />
            {editingName ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input value={nameInput} onChange={e => setNameInput(e.target.value)} style={{
                  background: "rgba(255,255,255,0.2)", border: "none", color: "white", fontSize: 20, fontWeight: 700,
                  padding: "2px 8px", borderRadius: 6, outline: "none", width: 180, fontFamily: "inherit",
                }} autoFocus onKeyDown={e => { if (e.key === "Enter") { setBudget(b => ({ ...b, name: nameInput })); setEditingName(false); } }} />
                <button onClick={() => { setBudget(b => ({ ...b, name: nameInput })); setEditingName(false); }} style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: "white", display: "flex" }}><Check size={18} /></button>
              </div>
            ) : (
              <h1 onClick={() => setEditingName(true)} style={{ margin: 0, fontSize: 20, fontWeight: 700, cursor: "pointer" }}>{budget.name}</h1>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {hasLiveAssets && (
              <button onClick={refreshPrices} disabled={refreshing} style={{
                padding: "6px 10px", borderRadius: 6, border: "none",
                backgroundColor: refreshing ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.2)",
                color: "white", cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 600, opacity: refreshing ? 0.7 : 1,
              }}>
                <RefreshCw size={14} style={refreshing ? { animation: "spinBtn 1s linear infinite" } : undefined} />
                {refreshing ? "Updating..." : "Refresh"}
              </button>
            )}
            <button onClick={handleBackToHome} style={{ padding: 6, borderRadius: 6, border: "none", backgroundColor: "rgba(255,255,255,0.2)", color: "white", cursor: "pointer", display: "flex" }}><Home size={16} /></button>
            {hasBudgetContent && <button onClick={handleSaveBudget} style={{ padding: 6, borderRadius: 6, border: "none", backgroundColor: "rgba(255,255,255,0.2)", color: "white", cursor: "pointer", display: "flex" }}><Save size={16} /></button>}
            <button onClick={handleNewBudget} style={{ padding: "6px 10px", borderRadius: 6, border: "none", backgroundColor: "white", color: COLORS.primary, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> New</button>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.8, letterSpacing: 0.2 }}>Aligned with the 50/30/20 framework recommended by the CFPB</p>
          {budget.lastPriceRefresh && (
            <span style={{ fontSize: 10, opacity: 0.6 }}>Prices: {new Date(budget.lastPriceRefresh).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 16px 40px" }}>
        {/* Preset templates - only shows when budget is completely empty */}
        {budget.income.length === 0 && budget.expenses.length === 0 && budget.assets.length === 0 && budget.nonLiquidAssets.length === 0 && budget.retirement.length === 0 && budget.liabilities.length === 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8, textAlign: "center" }}>Start with a template</div>
            <div style={{ display: "flex", gap: 6 }}>
              {BUDGET_PRESETS.map(p => (
                <button key={p.key} onClick={() => {
                  const now = Date.now();
                  const preset = p.budget;
                  const regenerated: Budget = {
                    ...preset,
                    id: budget.id,
                    income: preset.income.map(i => ({ ...i, id: generateId() })),
                    expenses: preset.expenses.map(i => ({ ...i, id: generateId() })),
                    assets: preset.assets.map(i => ({ ...i, id: generateId() })),
                    nonLiquidAssets: preset.nonLiquidAssets.map(i => ({ ...i, id: generateId() })),
                    retirement: preset.retirement.map(i => ({ ...i, id: generateId() })),
                    liabilities: preset.liabilities.map(i => ({ ...i, id: generateId() })),
                    createdAt: now, updatedAt: now,
                  };
                  setBudget(regenerated);
                  setNameInput(preset.name);
                  trackEvent("load_preset", { preset: p.key });
                }} style={{
                  flex: 1, padding: "8px 4px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`,
                  backgroundColor: COLORS.card, cursor: "pointer", textAlign: "center",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.boxShadow = `0 2px 8px ${COLORS.accent}20`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <span style={{ fontSize: 16 }}>{p.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMain }}>{p.label}</span>
                  <span style={{ fontSize: 10, color: COLORS.textSecondary, lineHeight: 1.2 }}>{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Income */}
        <BudgetSection title="Income" icon={<TrendingUp size={18} />} color={COLORS.income} bgColor={COLORS.incomeBg}
          items={budget.income} inputMode="recurring" presets={PRESETS.income}
          onUpdate={(id, u) => updateItem("income", id, u)}
          onAdd={() => addItem("income", "monthly")}
          onAddPreset={(name, at) => addPresetItem("income", name, "monthly", at)}
          onDelete={id => deleteItem("income", id)}
          onReorder={(from, to) => reorderItems("income", from, to)} />

        {/* Expenses */}
        <BudgetSection title="Expenses" icon={<TrendingDown size={18} />} color={COLORS.expense} bgColor={COLORS.expenseBg}
          items={budget.expenses} inputMode="recurring" presets={PRESETS.expenses}
          onUpdate={(id, u) => updateItem("expenses", id, u)}
          onAdd={() => addItem("expenses", "monthly")}
          onAddPreset={(name, at) => addPresetItem("expenses", name, "monthly", at)}
          onDelete={id => deleteItem("expenses", id)}
          onReorder={(from, to) => reorderItems("expenses", from, to)} />

        {/* Assets */}
        <BudgetSection title="Assets" icon={<Wallet size={18} />} color={COLORS.asset} bgColor={COLORS.assetBg}
          items={budget.assets} inputMode="asset" presets={PRESETS.assets}
          onUpdate={(id, u) => updateItem("assets", id, u)}
          onAdd={() => addItem("assets", "one_time")}
          onAddPreset={(name, at) => addPresetItem("assets", name, "one_time", at)}
          onDelete={id => deleteItem("assets", id)}
          onReorder={(from, to) => reorderItems("assets", from, to)} />

        {/* Non-Liquid Assets */}
        <BudgetSection title="Non-Liquid Assets" icon={<Building2 size={18} />} color={COLORS.nonLiquid} bgColor={COLORS.nonLiquidBg}
          items={budget.nonLiquidAssets} inputMode="value_only" presets={PRESETS.nonLiquidAssets}
          onUpdate={(id, u) => updateItem("nonLiquidAssets", id, u)}
          onAdd={() => addItem("nonLiquidAssets", "one_time")}
          onAddPreset={(name, at) => addPresetItem("nonLiquidAssets", name, "one_time", at)}
          onDelete={id => deleteItem("nonLiquidAssets", id)}
          onReorder={(from, to) => reorderItems("nonLiquidAssets", from, to)}
          footer={
            <div style={{ backgroundColor: COLORS.card, borderRadius: 10, padding: "10px 12px", border: `1px solid ${COLORS.borderLight}`, marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>Discount Rate</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.nonLiquid }}>{budget.nonLiquidDiscount}%</span>
              </div>
              <input type="range" min={0} max={75} value={budget.nonLiquidDiscount}
                onChange={e => setBudget(b => ({ ...b, nonLiquidDiscount: parseInt(e.target.value) }))}
                style={{ width: "100%", accentColor: COLORS.nonLiquid }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: COLORS.textMuted }}>
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span>
              </div>
            </div>
          } />

        {/* Retirement */}
        <BudgetSection title="401k / Retirement" icon={<Landmark size={18} />} color={COLORS.retirement} bgColor={COLORS.retirementBg}
          items={budget.retirement} inputMode="value_only" presets={PRESETS.retirement}
          onUpdate={(id, u) => updateItem("retirement", id, u)}
          onAdd={() => addItem("retirement", "one_time")}
          onAddPreset={(name, at) => addPresetItem("retirement", name, "one_time", at)}
          onDelete={id => deleteItem("retirement", id)}
          onReorder={(from, to) => reorderItems("retirement", from, to)} />

        {/* Liabilities */}
        <BudgetSection title="Liabilities" icon={<AlertTriangle size={18} />} color={COLORS.liability} bgColor={COLORS.liabilityBg}
          items={budget.liabilities} inputMode="recurring" presets={PRESETS.liabilities}
          onUpdate={(id, u) => updateItem("liabilities", id, u)}
          onAdd={() => addItem("liabilities", "one_time")}
          onAddPreset={(name, at) => addPresetItem("liabilities", name, "one_time", at)}
          onDelete={id => deleteItem("liabilities", id)}
          onReorder={(from, to) => reorderItems("liabilities", from, to)} />

        {/* Summary */}
        {(budget.income.length > 0 || budget.expenses.length > 0 || budget.assets.length > 0 || budget.liabilities.length > 0) && (
          <SummarySection budget={budget} />
        )}

        {/* Related Apps */}
        <div style={{ padding: "16px 0", borderTop: `1px solid ${COLORS.borderLight}` }} className="no-print">
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Related Apps</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { emoji: "✂️", accent: "#EF4444", accentBg: "#FEF2F2", label: "Just Cancel It", desc: "Cancel your subscriptions for free" },
              { emoji: "🏖️", accent: "#F59E0B", accentBg: "#FFFBEB", label: "Retirement Calculator", desc: "Plan your retirement with confidence" },
              { emoji: "📊", accent: "#6366F1", accentBg: "#EEF2FF", label: "Portfolio Optimizer", desc: "Optimize your investment portfolio" },
            ].map((app, i) => (
              <button key={i} onClick={() => trackEvent("related_app_click", { app: app.label })} style={{
                flex: "1 1 0", minWidth: 140, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                padding: "16px 12px", borderRadius: 14,
                border: `1px solid ${app.accent}20`, backgroundColor: app.accentBg,
                cursor: "pointer", textAlign: "center",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 12px ${app.accent}20`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${app.accent}20, ${app.accent}08)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                  {app.emoji}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textMain }}>{app.label}</div>
                  <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>{app.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer buttons */}
        <div style={{
          marginTop: 16, padding: "16px 0",
          borderTop: `1px solid ${COLORS.border}`,
          display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap",
        }} className="no-print">
          <button style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.card, color: COLORS.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => { trackEvent("subscribe_click"); setShowSubscribeModal(true); }}>
            <Mail size={15} /> Subscribe
          </button>
          <button style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.card, color: COLORS.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            onClick={handleReset}>
            <RotateCcw size={15} /> Reset
          </button>
          <button style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.card, color: COLORS.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => trackEvent("donate_click")}>
            <Heart size={15} /> Donate
          </button>
          <button style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.card, color: COLORS.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => { trackEvent("feedback_click"); setShowFeedbackModal(true); }}>
            <MessageSquare size={15} /> Feedback
          </button>
          <button style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.card, color: COLORS.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => { trackEvent("print_click"); window.print(); }}>
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {/* ─── Confirm Dialog ─────────────────────────────────────────── */}
      {confirmDialog && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setConfirmDialog(null)}>
          <div style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 24, maxWidth: 340, width: "90%", boxShadow: "0 8px 30px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textMain, marginBottom: 16 }}>{confirmDialog.message}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDialog(null)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, backgroundColor: "white", fontSize: 13, cursor: "pointer", color: COLORS.textSecondary }}>Cancel</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", backgroundColor: COLORS.expense, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Subscribe Modal ───────────────────────────────────────── */}
      {showSubscribeModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => { setShowSubscribeModal(false); setSubscribeEmail(""); setSubscribeStatus("idle"); setSubscribeMessage(""); }}>
          <div style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 24, maxWidth: 380, width: "90%", boxShadow: "0 8px 30px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.textMain }}>Subscribe to Updates</h3>
              <button onClick={() => { setShowSubscribeModal(false); setSubscribeEmail(""); setSubscribeStatus("idle"); setSubscribeMessage(""); }} style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: COLORS.textMuted }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: "0 0 12px" }}>Get notified about new features and updates.</p>
            {subscribeStatus === "success" ? (
              <div style={{ padding: 12, borderRadius: 8, backgroundColor: `${COLORS.income}10`, color: COLORS.income, fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                {subscribeMessage || "Subscribed!"}
              </div>
            ) : (
              <>
                <input value={subscribeEmail} onChange={e => setSubscribeEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSubscribe(); }}
                  placeholder="your@email.com" autoFocus
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                {subscribeMessage && subscribeStatus === "error" && (
                  <div style={{ fontSize: 12, color: COLORS.expense, marginBottom: 8 }}>{subscribeMessage}</div>
                )}
                <button onClick={handleSubscribe} disabled={subscribeStatus === "loading"} style={{
                  width: "100%", padding: "10px 16px", borderRadius: 8, border: "none",
                  backgroundColor: COLORS.primary, color: "white", fontSize: 14, fontWeight: 600,
                  cursor: subscribeStatus === "loading" ? "default" : "pointer",
                  opacity: subscribeStatus === "loading" ? 0.7 : 1,
                }}>
                  {subscribeStatus === "loading" ? "Subscribing..." : "Subscribe"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Feedback Modal ────────────────────────────────────────── */}
      {showFeedbackModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => { setShowFeedbackModal(false); setFeedbackText(""); setFeedbackStatus("idle"); }}>
          <div style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 24, maxWidth: 380, width: "90%", boxShadow: "0 8px 30px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.textMain }}>Send Feedback</h3>
              <button onClick={() => { setShowFeedbackModal(false); setFeedbackText(""); setFeedbackStatus("idle"); }} style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: COLORS.textMuted }}><X size={18} /></button>
            </div>
            {enjoyVote && (
              <div style={{
                padding: "8px 12px", borderRadius: 8, marginBottom: 12,
                backgroundColor: enjoyVote === "up" ? `${COLORS.income}10` : `${COLORS.expense}10`,
                color: enjoyVote === "up" ? COLORS.income : COLORS.expense,
                fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
              }}>
                {enjoyVote === "up" ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                {enjoyVote === "up" ? "Glad you're enjoying it!" : "Sorry to hear that."}
              </div>
            )}
            {feedbackStatus === "success" ? (
              <div style={{ padding: 12, borderRadius: 8, backgroundColor: `${COLORS.income}10`, color: COLORS.income, fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                Thank you for your feedback!
              </div>
            ) : (
              <>
                <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                  placeholder={enjoyVote === "up" ? "What do you like most? Any features you'd love to see?" : enjoyVote === "down" ? "What went wrong? How can we improve?" : "What can we improve? Bug reports, feature requests, anything..."}
                  autoFocus rows={4}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8, resize: "vertical" }} />
                {feedbackStatus === "error" && (
                  <div style={{ fontSize: 12, color: COLORS.expense, marginBottom: 8 }}>Failed to send. Please try again.</div>
                )}
                <button onClick={handleFeedbackSubmit} disabled={feedbackStatus === "submitting" || !feedbackText.trim()} style={{
                  width: "100%", padding: "10px 16px", borderRadius: 8, border: "none",
                  backgroundColor: COLORS.primary, color: "white", fontSize: 14, fontWeight: 600,
                  cursor: feedbackStatus === "submitting" || !feedbackText.trim() ? "default" : "pointer",
                  opacity: feedbackStatus === "submitting" || !feedbackText.trim() ? 0.7 : 1,
                }}>
                  {feedbackStatus === "submitting" ? "Sending..." : "Submit Feedback"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Name Budget Modal (first save) ─────────────────────────── */}
      {showNameBudgetModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowNameBudgetModal(false)}>
          <div style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 24, maxWidth: 380, width: "90%", boxShadow: "0 8px 30px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.textMain }}>Name Your Budget</h3>
              <button onClick={() => setShowNameBudgetModal(false)} style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: COLORS.textMuted }}><X size={18} /></button>
            </div>
            <input value={nameBudgetValue} onChange={e => setNameBudgetValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && nameBudgetValue.trim()) { const named = { ...budget, name: nameBudgetValue.trim() }; setBudget(named); setNameInput(nameBudgetValue.trim()); doSaveBudget(named); setShowNameBudgetModal(false); } }}
              placeholder="e.g. Monthly Budget, Household, Side Hustle" autoFocus
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowNameBudgetModal(false)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, backgroundColor: "white", fontSize: 13, cursor: "pointer", color: COLORS.textSecondary }}>Cancel</button>
              <button onClick={() => {
                const name = nameBudgetValue.trim() || "My Budget";
                const named = { ...budget, name };
                setBudget(named);
                setNameInput(name);
                doSaveBudget(named);
                setShowNameBudgetModal(false);
              }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", backgroundColor: COLORS.primary, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Save Toast ────────────────────────────────────────────── */}
      {saveToast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 1100,
          backgroundColor: COLORS.primary, color: "white", padding: "10px 20px", borderRadius: 12,
          fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          display: "flex", alignItems: "center", gap: 8, animation: "fadeInOut 1.5s ease",
        }}>
          <Check size={16} /> Budget saved!
        </div>
      )}

      {/* ─── Floating Feedback Pill ─────────────────────────────────── */}
      {!enjoyVote && (
        <div style={{ position: "fixed", bottom: 20, right: pillRight, zIndex: 900, pointerEvents: "none" }} className="no-print">
          <div style={{
            pointerEvents: "auto",
            backgroundColor: COLORS.card, borderRadius: 24, padding: "10px 16px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: `1px solid ${COLORS.border}`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textMain }}>Enjoying this app?</span>
            <button onClick={() => handleEnjoyVote("up")} style={{
              padding: 6, borderRadius: 8, border: `1px solid ${COLORS.border}`, backgroundColor: "white",
              cursor: "pointer", display: "flex", color: COLORS.income,
            }}><ThumbsUp size={16} /></button>
            <button onClick={() => handleEnjoyVote("down")} style={{
              padding: 6, borderRadius: 8, border: `1px solid ${COLORS.border}`, backgroundColor: "white",
              cursor: "pointer", display: "flex", color: COLORS.expense,
            }}><ThumbsDown size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
