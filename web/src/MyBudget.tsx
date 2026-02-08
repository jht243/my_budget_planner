import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, X, Trash2, Save, RotateCcw, Home, Printer,
  DollarSign, TrendingUp, TrendingDown, PiggyBank, Building2,
  Landmark, AlertTriangle, ChevronDown, ChevronUp, Edit2, Check,
  Wallet, BarChart3, Clock, ArrowUpRight, ArrowDownRight
} from "lucide-react";

// ─── Data Types ───────────────────────────────────────────────────────────────

type Frequency = "monthly" | "yearly" | "one_time";

interface BudgetItem {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  totalValue: number;
  monthlyValue: number;
  quantity?: number;
  notes?: string;
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
  bg: "#FAFAFA",
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

const fmtExact = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const emptyBudget = (): Budget => ({
  id: generateId(),
  name: "My Budget",
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

const DEMO_BUDGET: Budget = {
  id: "demo_budget",
  name: "My Budget",
  income: [
    { id: "inc1", name: "rental income (house)", amount: 1000, frequency: "monthly", totalValue: 12000, monthlyValue: 1000 },
    { id: "inc2", name: "rental income (properties)", amount: 2500, frequency: "monthly", totalValue: 30000, monthlyValue: 2500 },
    { id: "inc3", name: "VA payments", amount: 1450, frequency: "monthly", totalValue: 17400, monthlyValue: 1450 },
  ],
  expenses: [
    { id: "exp1", name: "finca", amount: 1000, frequency: "monthly", totalValue: 12000, monthlyValue: 1000 },
    { id: "exp2", name: "parma rent", amount: 1000, frequency: "monthly", totalValue: 12000, monthlyValue: 1000 },
  ],
  assets: [
    { id: "ast1", name: "btc", amount: 140000, frequency: "one_time", totalValue: 140000, monthlyValue: 0, quantity: 2 },
    { id: "ast2", name: "near", amount: 7000, frequency: "one_time", totalValue: 7000, monthlyValue: 0, quantity: 7000 },
    { id: "ast3", name: "eth", amount: 10146, frequency: "one_time", totalValue: 10146, monthlyValue: 0, quantity: 5.34 },
    { id: "ast4", name: "usdc", amount: 3500, frequency: "one_time", totalValue: 3500, monthlyValue: 0 },
    { id: "ast5", name: "coinbase account", amount: 73500, frequency: "one_time", totalValue: 73500, monthlyValue: 0 },
    { id: "ast6", name: "loan from Alex (10,000)", amount: 0, frequency: "one_time", totalValue: 0, monthlyValue: 0 },
    { id: "ast7", name: "stock market (betterment)", amount: 14571, frequency: "one_time", totalValue: 14571, monthlyValue: 0 },
    { id: "ast8", name: "NEAR.WALLET", amount: 2000, frequency: "one_time", totalValue: 2000, monthlyValue: 0, quantity: 2000 },
    { id: "ast9", name: "SoFi Investment", amount: 1000, frequency: "one_time", totalValue: 1000, monthlyValue: 0 },
    { id: "ast10", name: "Amazon Stock", amount: 17520, frequency: "one_time", totalValue: 17520, monthlyValue: 0, quantity: 219 },
    { id: "ast12", name: "Settlement?", amount: 0, frequency: "one_time", totalValue: 0, monthlyValue: 0 },
  ],
  nonLiquidAssets: [
    { id: "nla1", name: "Breitling Gold", amount: 19000, frequency: "one_time", totalValue: 19000, monthlyValue: 0 },
    { id: "nla2", name: "Breguet Tradition", amount: 15000, frequency: "one_time", totalValue: 15000, monthlyValue: 0 },
    { id: "nla3", name: "Breguet Blue", amount: 25000, frequency: "one_time", totalValue: 25000, monthlyValue: 0 },
    { id: "nla4", name: "JLC", amount: 25000, frequency: "one_time", totalValue: 25000, monthlyValue: 0 },
    { id: "nla5", name: "All other watches", amount: 10000, frequency: "one_time", totalValue: 10000, monthlyValue: 0 },
    { id: "nla6", name: "Car", amount: 15000, frequency: "one_time", totalValue: 15000, monthlyValue: 0 },
    { id: "nla7", name: "MontBlanc Pens", amount: 5000, frequency: "one_time", totalValue: 5000, monthlyValue: 0 },
  ],
  retirement: [
    { id: "ret1", name: "401k (Charles Schwab) (Acct 9586-3467)", amount: 22500, frequency: "one_time", totalValue: 22500, monthlyValue: 0 },
  ],
  liabilities: [
    { id: "lia1", name: "las palmas apt", amount: 50000, frequency: "one_time", totalValue: 50000, monthlyValue: 0 },
    { id: "lia2", name: "repayment of tammy", amount: 20000, frequency: "one_time", totalValue: 20000, monthlyValue: 0 },
    { id: "lia3", name: "personal monthly expenses", amount: 7000, frequency: "monthly", totalValue: 84000, monthlyValue: 7000 },
    { id: "lia4", name: "remodel las palmas", amount: 10000, frequency: "one_time", totalValue: 10000, monthlyValue: 0 },
  ],
  nonLiquidDiscount: 25,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

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
    { name: "Stocks/Brokerage", emoji: "📊" },
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

const ItemRow = ({ item, onUpdate, onDelete, inputMode, color }: {
  item: BudgetItem; onUpdate: (u: Partial<BudgetItem>) => void; onDelete: () => void; inputMode: InputMode; color: string;
}) => {
  const isNew = !item.amount;
  const [editing, setEditing] = useState(isNew);
  const [draft, setDraft] = useState(item);

  useEffect(() => { setDraft(item); }, [item]);

  const save = () => {
    const freq = draft.frequency || (inputMode === "recurring" ? "monthly" : "one_time");
    const computed = computeValues(draft.amount, freq);
    onUpdate({ ...draft, frequency: freq, ...computed });
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

  if (editing) {
    return (
      <div style={{ padding: "10px 12px", backgroundColor: COLORS.card, borderRadius: 10, border: `1px solid ${COLORS.border}`, marginBottom: 6 }}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Name</label>
          <input autoFocus={!draft.name} style={inputStyle} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Description" />
        </div>

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

        {inputMode === "asset" && (
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
      padding: "10px 12px", backgroundColor: COLORS.card, borderRadius: 10,
      border: `1px solid ${COLORS.borderLight}`, marginBottom: 4, transition: "all 0.15s",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.textMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name || "Unnamed"}</div>
        <div style={{ fontSize: 11, color: COLORS.textSecondary, display: "flex", gap: 8, marginTop: 2 }}>
          {item.quantity !== undefined && item.quantity > 0 && <span>Qty: {item.quantity}</span>}
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

const BudgetSection = ({ title, icon, color, bgColor, items, onUpdate, onAdd, onAddPreset, onDelete, inputMode, presets, footer }: {
  title: string; icon: React.ReactNode; color: string; bgColor: string;
  items: BudgetItem[]; onUpdate: (id: string, u: Partial<BudgetItem>) => void;
  onAdd: () => void; onAddPreset: (name: string) => void; onDelete: (id: string) => void;
  inputMode: InputMode; presets?: Preset[]; footer?: React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(items.length > 0);
  const total = items.reduce((s, i) => s + i.totalValue, 0);
  const showMonthly = inputMode === "recurring";
  const monthlyTotal = showMonthly ? items.reduce((s, i) => s + i.monthlyValue, 0) : undefined;

  // Filter out presets that already exist as items
  const existingNames = new Set(items.map(i => i.name.toLowerCase()));
  const availablePresets = (presets || []).filter(p => !existingNames.has(p.name.toLowerCase()));

  return (
    <div style={{ marginBottom: 12 }}>
      <SectionHeader title={title} icon={icon} color={color} bgColor={bgColor}
        total={total} monthlyTotal={monthlyTotal} count={items.length} isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div style={{ padding: "8px 0 0" }}>
          {items.map(item => (
            <ItemRow key={item.id} item={item} color={color}
              onUpdate={u => onUpdate(item.id, u)} onDelete={() => onDelete(item.id)}
              inputMode={inputMode} />
          ))}

          {/* Quick add chips + custom */}
          <div style={{ marginBottom: 6 }}>
            {availablePresets.length > 0 && (
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6, paddingLeft: 2 }}>Quick add:</div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {availablePresets.map(p => (
                <button key={p.name} onClick={() => onAddPreset(p.name)} style={{
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

  const netWorth = totalLiquidAssets + totalNonLiquidAssets + totalRetirement - oneTimeLiabilities;
  const liquidAfterLiabilities = totalLiquidAssets - oneTimeLiabilities;

  // Runway: how many months liquid assets (minus one-time debts) last at current burn rate
  const monthlyBurn = totalMonthlyExpenses + totalMonthlyLiabilityPayments - totalMonthlyIncome;
  const liquidForRunway = Math.max(0, liquidAfterLiabilities);
  const runwayMonths = monthlyBurn > 0 && liquidForRunway > 0 ? liquidForRunway / monthlyBurn : null;
  const runwayYears = runwayMonths ? runwayMonths / 12 : null;

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
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
          Monthly Cash Flow
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: isPositive ? COLORS.positive : COLORS.negative }}>
            {monthlyNet >= 0 ? "+" : ""}{fmt(monthlyNet)}
          </span>
          <span style={{ fontSize: 14, color: COLORS.textSecondary }}>/month</span>
        </div>
        <div style={{ fontSize: 14, color: COLORS.textSecondary }}>
          {annualNet >= 0 ? "+" : ""}{fmt(annualNet)} /year
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>Income</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.income }}>{fmt(totalMonthlyIncome)}/mo</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>Expenses</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.expense }}>{fmt(totalMonthlyExpenses)}/mo</div>
          </div>
          {totalMonthlyLiabilityPayments > 0 && (
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>Liability Payments</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.liability }}>{fmt(totalMonthlyLiabilityPayments)}/mo</div>
            </div>
          )}
          {totalMonthlyIncome > 0 && (
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>Savings Rate</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: isPositive ? COLORS.positive : COLORS.negative }}>{savingsRate.toFixed(1)}%</div>
            </div>
          )}
        </div>
      </div>

      {/* Runway or Growth — the #2 focal point */}
      {runwayMonths !== null ? (
        <div style={{
          backgroundColor: COLORS.expenseBg, borderRadius: 12, padding: "14px 16px",
          border: `1px solid ${COLORS.expense}20`, marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Clock size={16} color={COLORS.expense} />
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.expense, textTransform: "uppercase" }}>Runway</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: COLORS.expense }}>
            {runwayYears! >= 1 ? `${runwayYears!.toFixed(1)} years` : `${Math.round(runwayMonths)} months`}
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
            At {fmt(monthlyBurn)}/mo burn, your liquid assets ({fmt(liquidAfterLiabilities)} after debts) will last this long
          </div>
        </div>
      ) : isPositive && monthlyNet > 0 ? (
        <div style={{
          backgroundColor: COLORS.incomeBg, borderRadius: 12, padding: "14px 16px",
          border: `1px solid ${COLORS.income}20`, marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <ArrowUpRight size={16} color={COLORS.income} />
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.income, textTransform: "uppercase" }}>Growth</span>
          </div>
          <div style={{ fontSize: 14, color: COLORS.textMain }}>
            +{fmt(monthlyNet)}/mo → <strong>{fmt(annualNet)}</strong>/year
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
            In 2 years: +{fmt(annualNet * 2)} · In 5 years: +{fmt(annualNet * 5)}
          </div>
        </div>
      ) : null}

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
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MyBudget({ initialData }: { initialData?: any }) {
  const [savedBudgets, setSavedBudgets] = useState<Budget[]>(() => loadBudgets());
  const [currentView, setCurrentView] = useState<"home" | "budget">(() => {
    const current = loadCurrentBudget();
    if (current && (current.income.length > 0 || current.expenses.length > 0 || current.assets.length > 0)) return "budget";
    return savedBudgets.length > 0 ? "home" : "budget";
  });
  const [budget, setBudget] = useState<Budget>(() => loadCurrentBudget() || emptyBudget());
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(budget.name);

  // Persist budget on change
  useEffect(() => {
    saveCurrentBudget(budget);
  }, [budget]);

  // Helper to update a section
  const updateItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "retirement" | "liabilities">, id: string, updates: Partial<BudgetItem>) => {
    setBudget(b => ({
      ...b,
      [section]: b[section].map(item => item.id === id ? { ...item, ...updates } : item),
      updatedAt: Date.now(),
    }));
  };

  const addItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "retirement" | "liabilities">, freq: Frequency = "monthly") => {
    setBudget(b => ({
      ...b,
      [section]: [...b[section], emptyItem(freq)],
      updatedAt: Date.now(),
    }));
  };

  const addPresetItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "retirement" | "liabilities">, name: string, freq: Frequency = "monthly") => {
    setBudget(b => ({
      ...b,
      [section]: [...b[section], { ...emptyItem(freq), name }],
      updatedAt: Date.now(),
    }));
  };

  const deleteItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "retirement" | "liabilities">, id: string) => {
    setBudget(b => ({
      ...b,
      [section]: b[section].filter(item => item.id !== id),
      updatedAt: Date.now(),
    }));
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
    if (budget.income.length > 0 || budget.expenses.length > 0 || budget.assets.length > 0) {
      saveBudgetToList();
    }
    const newB = emptyBudget();
    setBudget(newB);
    setNameInput(newB.name);
    setCurrentView("budget");
  };

  const handleOpenBudget = (b: Budget) => {
    if (budget.income.length > 0 || budget.expenses.length > 0 || budget.assets.length > 0) {
      saveBudgetToList();
    }
    setBudget(b);
    setNameInput(b.name);
    saveCurrentBudget(b);
    setCurrentView("budget");
  };

  const handleDeleteBudget = (id: string) => {
    const updated = savedBudgets.filter(b => b.id !== id);
    saveBudgets(updated);
    setSavedBudgets(updated);
  };

  const handleReset = () => {
    const newB = emptyBudget();
    setBudget(newB);
    setNameInput(newB.name);
  };

  const handleBackToHome = () => {
    saveBudgetToList();
    setCurrentView("home");
  };

  const handlePrint = () => { window.print(); };

  // Homepage
  if (currentView === "home") {
    return (
      <div style={{ backgroundColor: COLORS.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", maxWidth: 600, margin: "0 auto", overflow: "hidden", boxSizing: "border-box" }}>
        <div style={{ backgroundColor: COLORS.primary, padding: "24px 20px", color: "white" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <DollarSign size={28} /> My Budget
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, opacity: 0.9 }}>Your saved budgets</p>
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

  // Budget editor view
  return (
    <div style={{ backgroundColor: COLORS.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", maxWidth: 600, margin: "0 auto", boxSizing: "border-box" }}>
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
            <button onClick={handleBackToHome} style={{ padding: 6, borderRadius: 6, border: "none", backgroundColor: "rgba(255,255,255,0.2)", color: "white", cursor: "pointer", display: "flex" }}><Home size={16} /></button>
            <button onClick={() => { saveBudgetToList(); }} style={{ padding: 6, borderRadius: 6, border: "none", backgroundColor: "rgba(255,255,255,0.2)", color: "white", cursor: "pointer", display: "flex" }}><Save size={16} /></button>
            <button onClick={handlePrint} style={{ padding: 6, borderRadius: 6, border: "none", backgroundColor: "rgba(255,255,255,0.2)", color: "white", cursor: "pointer", display: "flex" }}><Printer size={16} /></button>
            <button onClick={handleNewBudget} style={{ padding: "6px 10px", borderRadius: 6, border: "none", backgroundColor: "white", color: COLORS.primary, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> New</button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>Track your income, expenses, assets & liabilities</p>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 16px 40px" }}>
        {/* Demo data loader - only shows when budget is completely empty */}
        {budget.income.length === 0 && budget.expenses.length === 0 && budget.assets.length === 0 && budget.nonLiquidAssets.length === 0 && budget.retirement.length === 0 && budget.liabilities.length === 0 && (
          <button onClick={() => { setBudget({ ...DEMO_BUDGET, id: budget.id, createdAt: Date.now(), updatedAt: Date.now() }); setNameInput(DEMO_BUDGET.name); }} style={{
            width: "100%", padding: 14, borderRadius: 12, border: `2px dashed ${COLORS.accent}`,
            backgroundColor: COLORS.accentLight, color: COLORS.primaryDark, fontSize: 14, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16,
          }}>
            <BarChart3 size={18} /> Load Demo Data
          </button>
        )}

        {/* Income */}
        <BudgetSection title="Income" icon={<TrendingUp size={18} />} color={COLORS.income} bgColor={COLORS.incomeBg}
          items={budget.income} inputMode="recurring" presets={PRESETS.income}
          onUpdate={(id, u) => updateItem("income", id, u)}
          onAdd={() => addItem("income", "monthly")}
          onAddPreset={name => addPresetItem("income", name, "monthly")}
          onDelete={id => deleteItem("income", id)} />

        {/* Expenses */}
        <BudgetSection title="Expenses" icon={<TrendingDown size={18} />} color={COLORS.expense} bgColor={COLORS.expenseBg}
          items={budget.expenses} inputMode="recurring" presets={PRESETS.expenses}
          onUpdate={(id, u) => updateItem("expenses", id, u)}
          onAdd={() => addItem("expenses", "monthly")}
          onAddPreset={name => addPresetItem("expenses", name, "monthly")}
          onDelete={id => deleteItem("expenses", id)} />

        {/* Assets */}
        <BudgetSection title="Assets" icon={<Wallet size={18} />} color={COLORS.asset} bgColor={COLORS.assetBg}
          items={budget.assets} inputMode="asset" presets={PRESETS.assets}
          onUpdate={(id, u) => updateItem("assets", id, u)}
          onAdd={() => addItem("assets", "one_time")}
          onAddPreset={name => addPresetItem("assets", name, "one_time")}
          onDelete={id => deleteItem("assets", id)} />

        {/* Non-Liquid Assets */}
        <BudgetSection title="Non-Liquid Assets" icon={<Building2 size={18} />} color={COLORS.nonLiquid} bgColor={COLORS.nonLiquidBg}
          items={budget.nonLiquidAssets} inputMode="value_only" presets={PRESETS.nonLiquidAssets}
          onUpdate={(id, u) => updateItem("nonLiquidAssets", id, u)}
          onAdd={() => addItem("nonLiquidAssets", "one_time")}
          onAddPreset={name => addPresetItem("nonLiquidAssets", name, "one_time")}
          onDelete={id => deleteItem("nonLiquidAssets", id)}
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
          onAddPreset={name => addPresetItem("retirement", name, "one_time")}
          onDelete={id => deleteItem("retirement", id)} />

        {/* Liabilities */}
        <BudgetSection title="Liabilities" icon={<AlertTriangle size={18} />} color={COLORS.liability} bgColor={COLORS.liabilityBg}
          items={budget.liabilities} inputMode="recurring" presets={PRESETS.liabilities}
          onUpdate={(id, u) => updateItem("liabilities", id, u)}
          onAdd={() => addItem("liabilities", "one_time")}
          onAddPreset={name => addPresetItem("liabilities", name, "one_time")}
          onDelete={id => deleteItem("liabilities", id)} />

        {/* Summary */}
        {(budget.income.length > 0 || budget.expenses.length > 0 || budget.assets.length > 0 || budget.liabilities.length > 0) && (
          <SummarySection budget={budget} />
        )}

        {/* Reset */}
        <button onClick={handleReset} style={{
          width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${COLORS.border}`,
          backgroundColor: COLORS.card, color: COLORS.textSecondary, fontSize: 13,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8,
        }}>
          <RotateCcw size={14} /> Reset Budget
        </button>
      </div>
    </div>
  );
}
