import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, X, Trash2, Save, RotateCcw, Home, Printer,
  DollarSign, TrendingUp, TrendingDown, PiggyBank, Building2,
  Landmark, AlertTriangle, ChevronDown, ChevronUp, Edit2, Check,
  Wallet, BarChart3, Clock, ArrowUpRight, ArrowDownRight
} from "lucide-react";

// ─── Data Types ───────────────────────────────────────────────────────────────

interface BudgetItem {
  id: string;
  name: string;
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
  liabilities: [],
  nonLiquidDiscount: 25,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const emptyItem = (): BudgetItem => ({
  id: generateId(),
  name: "",
  totalValue: 0,
  monthlyValue: 0,
});

const loadBudgets = (): Budget[] => {
  try {
    const data = localStorage.getItem(BUDGETS_LIST_KEY);
    if (data) return JSON.parse(data);
  } catch {}
  return [];
};

const saveBudgets = (budgets: Budget[]) => {
  try { localStorage.setItem(BUDGETS_LIST_KEY, JSON.stringify(budgets)); } catch {}
};

const loadCurrentBudget = (): Budget | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch {}
  return null;
};

const saveCurrentBudget = (budget: Budget) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(budget)); } catch {}
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

// ─── Editable Item Row ────────────────────────────────────────────────────────

const ItemRow = ({ item, onUpdate, onDelete, showQuantity, showMonthly, color }: {
  item: BudgetItem; onUpdate: (u: Partial<BudgetItem>) => void; onDelete: () => void; showQuantity?: boolean; showMonthly?: boolean; color: string;
}) => {
  const [editing, setEditing] = useState(!item.name);
  const [draft, setDraft] = useState(item);

  useEffect(() => { setDraft(item); }, [item]);

  const save = () => {
    // Auto-calculate total from monthly if only monthly provided
    if (draft.monthlyValue && !draft.totalValue) {
      draft.totalValue = draft.monthlyValue * 12;
    }
    // Auto-calculate monthly from total if only total provided
    if (draft.totalValue && !draft.monthlyValue && showMonthly) {
      draft.monthlyValue = Math.round((draft.totalValue / 12) * 100) / 100;
    }
    onUpdate(draft);
    setEditing(false);
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
    fontSize: 13, width: "100%", boxSizing: "border-box", fontFamily: "inherit",
    outline: "none",
  };

  if (editing) {
    return (
      <div style={{ padding: "10px 12px", backgroundColor: COLORS.card, borderRadius: 10, border: `1px solid ${COLORS.border}`, marginBottom: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: showQuantity ? "1fr 1fr 1fr" : showMonthly ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Name</label>
            <input autoFocus style={inputStyle} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Description" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Total Value</label>
            <input style={inputStyle} type="number" value={draft.totalValue || ""} onChange={e => setDraft({ ...draft, totalValue: parseFloat(e.target.value) || 0 })} placeholder="$0" />
          </div>
          {showMonthly && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Monthly</label>
              <input style={inputStyle} type="number" value={draft.monthlyValue || ""} onChange={e => setDraft({ ...draft, monthlyValue: parseFloat(e.target.value) || 0 })} placeholder="$0/mo" />
            </div>
          )}
          {showQuantity && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2, display: "block" }}>Quantity</label>
              <input style={inputStyle} type="number" step="any" value={draft.quantity || ""} onChange={e => setDraft({ ...draft, quantity: parseFloat(e.target.value) || undefined })} placeholder="Qty" />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button onClick={() => { if (!item.name) { onDelete(); } else { setDraft(item); setEditing(false); } }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, backgroundColor: "white", fontSize: 12, cursor: "pointer", color: COLORS.textSecondary }}>Cancel</button>
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
          {showMonthly && item.monthlyValue > 0 && <span>{fmt(item.monthlyValue)}/mo</span>}
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

const BudgetSection = ({ title, icon, color, bgColor, items, onUpdate, onAdd, onDelete, showQuantity, showMonthly }: {
  title: string; icon: React.ReactNode; color: string; bgColor: string;
  items: BudgetItem[]; onUpdate: (id: string, u: Partial<BudgetItem>) => void;
  onAdd: () => void; onDelete: (id: string) => void;
  showQuantity?: boolean; showMonthly?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(items.length > 0);
  const total = items.reduce((s, i) => s + i.totalValue, 0);
  const monthlyTotal = showMonthly ? items.reduce((s, i) => s + i.monthlyValue, 0) : undefined;

  return (
    <div style={{ marginBottom: 12 }}>
      <SectionHeader title={title} icon={icon} color={color} bgColor={bgColor}
        total={total} monthlyTotal={monthlyTotal} count={items.length} isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div style={{ padding: "8px 0 0" }}>
          {items.map(item => (
            <ItemRow key={item.id} item={item} color={color}
              onUpdate={u => onUpdate(item.id, u)} onDelete={() => onDelete(item.id)}
              showQuantity={showQuantity} showMonthly={showMonthly} />
          ))}
          <button onClick={onAdd} style={{
            width: "100%", padding: "10px", borderRadius: 10, border: `1px dashed ${color}40`,
            backgroundColor: `${bgColor}`, color: color, fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Plus size={16} /> Add {title.replace(/s$/, "")}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Summary Card ─────────────────────────────────────────────────────────────

const StatCard = ({ label, value, subtext, color, icon }: {
  label: string; value: string; subtext?: string; color: string; icon: React.ReactNode;
}) => (
  <div style={{
    backgroundColor: COLORS.card, borderRadius: 12, padding: "14px 16px",
    border: `1px solid ${COLORS.borderLight}`, flex: "1 1 140px", minWidth: 140,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <div style={{ color, display: "flex" }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
    <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
    {subtext && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{subtext}</div>}
  </div>
);

// ─── Summary Section ──────────────────────────────────────────────────────────

const SummarySection = ({ budget }: { budget: Budget }) => {
  const totalMonthlyIncome = budget.income.reduce((s, i) => s + i.monthlyValue, 0);
  const totalMonthlyExpenses = budget.expenses.reduce((s, i) => s + i.monthlyValue, 0);
  const totalMonthlyLiabilityPayments = budget.liabilities.reduce((s, i) => s + i.monthlyValue, 0);
  const monthlyNet = totalMonthlyIncome - totalMonthlyExpenses - totalMonthlyLiabilityPayments;
  const annualNet = monthlyNet * 12;

  const totalLiquidAssets = budget.assets.reduce((s, i) => s + i.totalValue, 0);
  const totalNonLiquidAssets = budget.nonLiquidAssets.reduce((s, i) => s + i.totalValue, 0);
  const nonLiquidAtDiscount = totalNonLiquidAssets * (1 - budget.nonLiquidDiscount / 100);
  const totalLiabilities = budget.liabilities.reduce((s, i) => s + i.totalValue, 0);

  const netWorth = totalLiquidAssets + totalNonLiquidAssets - totalLiabilities;
  const liquidAfterLiabilities = totalLiquidAssets - totalLiabilities;

  // Runway: how many months liquid assets last if spending > income
  const monthlyBurn = totalMonthlyExpenses + totalMonthlyLiabilityPayments - totalMonthlyIncome;
  const runwayMonths = monthlyBurn > 0 && totalLiquidAssets > 0 ? totalLiquidAssets / monthlyBurn : null;
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

      {/* Asset Overview */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <StatCard label="Net Worth" value={fmt(netWorth)} color={netWorth >= 0 ? COLORS.positive : COLORS.negative} icon={<TrendingUp size={16} />} />
        <StatCard label="Liquid Assets" value={fmt(totalLiquidAssets)} subtext={`After liabilities: ${fmt(liquidAfterLiabilities)}`} color={COLORS.asset} icon={<Wallet size={16} />} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <StatCard label="Non-Liquid" value={fmt(totalNonLiquidAssets)} subtext={`At ${budget.nonLiquidDiscount}% discount: ${fmt(nonLiquidAtDiscount)}`} color={COLORS.nonLiquid} icon={<Building2 size={16} />} />
        <StatCard label="Liabilities" value={fmt(totalLiabilities)} color={COLORS.liability} icon={<AlertTriangle size={16} />} />
      </div>

      {/* Runway / Projection */}
      {runwayMonths !== null && (
        <div style={{
          backgroundColor: COLORS.expenseBg, borderRadius: 12, padding: "14px 16px",
          border: `1px solid ${COLORS.expense}20`, marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Clock size={16} color={COLORS.expense} />
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.expense, textTransform: "uppercase" }}>Runway</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.expense }}>
            {runwayYears! >= 1 ? `${runwayYears!.toFixed(1)} years` : `${Math.round(runwayMonths)} months`}
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
            At current burn rate of {fmt(monthlyBurn)}/mo, your liquid assets will last this long
          </div>
        </div>
      )}

      {isPositive && monthlyNet > 0 && (
        <div style={{
          backgroundColor: COLORS.incomeBg, borderRadius: 12, padding: "14px 16px",
          border: `1px solid ${COLORS.income}20`, marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <ArrowUpRight size={16} color={COLORS.income} />
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.income, textTransform: "uppercase" }}>Growth Projection</span>
          </div>
          <div style={{ fontSize: 14, color: COLORS.textMain }}>
            At +{fmt(monthlyNet)}/mo, you'll accumulate an additional <strong>{fmt(annualNet)}</strong> per year.
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
            In 2 years: +{fmt(annualNet * 2)} · In 5 years: +{fmt(annualNet * 5)}
          </div>
        </div>
      )}

      {/* Leftover Summary (matching the spreadsheet) */}
      <div style={{
        backgroundColor: COLORS.card, borderRadius: 12, padding: "16px",
        border: `1px solid ${COLORS.border}`, marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
          Leftover Summary
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: COLORS.textSecondary }}>Liquid (after liabilities)</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: liquidAfterLiabilities >= 0 ? COLORS.positive : COLORS.negative }}>{fmtExact(liquidAfterLiabilities)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: COLORS.textSecondary }}>Non-liquid (at {budget.nonLiquidDiscount}% discount)</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.nonLiquid }}>{fmtExact(nonLiquidAtDiscount)}</span>
          </div>
          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textMain }}>Total Available</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.primary }}>{fmtExact(liquidAfterLiabilities + nonLiquidAtDiscount)}</span>
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
  const updateItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "liabilities">, id: string, updates: Partial<BudgetItem>) => {
    setBudget(b => ({
      ...b,
      [section]: b[section].map(item => item.id === id ? { ...item, ...updates } : item),
      updatedAt: Date.now(),
    }));
  };

  const addItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "liabilities">) => {
    setBudget(b => ({
      ...b,
      [section]: [...b[section], emptyItem()],
      updatedAt: Date.now(),
    }));
  };

  const deleteItem = (section: keyof Pick<Budget, "income" | "expenses" | "assets" | "nonLiquidAssets" | "liabilities">, id: string) => {
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
                      {b.income.length + b.expenses.length + b.assets.length + b.nonLiquidAssets.length + b.liabilities.length} items · Updated {new Date(b.updatedAt).toLocaleDateString()}
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
        {/* Income */}
        <BudgetSection title="Income" icon={<TrendingUp size={18} />} color={COLORS.income} bgColor={COLORS.incomeBg}
          items={budget.income} showMonthly
          onUpdate={(id, u) => updateItem("income", id, u)}
          onAdd={() => addItem("income")}
          onDelete={id => deleteItem("income", id)} />

        {/* Expenses */}
        <BudgetSection title="Expenses" icon={<TrendingDown size={18} />} color={COLORS.expense} bgColor={COLORS.expenseBg}
          items={budget.expenses} showMonthly
          onUpdate={(id, u) => updateItem("expenses", id, u)}
          onAdd={() => addItem("expenses")}
          onDelete={id => deleteItem("expenses", id)} />

        {/* Assets */}
        <BudgetSection title="Assets" icon={<Wallet size={18} />} color={COLORS.asset} bgColor={COLORS.assetBg}
          items={budget.assets} showQuantity
          onUpdate={(id, u) => updateItem("assets", id, u)}
          onAdd={() => addItem("assets")}
          onDelete={id => deleteItem("assets", id)} />

        {/* Non-Liquid Assets */}
        <BudgetSection title="Non-Liquid Assets" icon={<Building2 size={18} />} color={COLORS.nonLiquid} bgColor={COLORS.nonLiquidBg}
          items={budget.nonLiquidAssets}
          onUpdate={(id, u) => updateItem("nonLiquidAssets", id, u)}
          onAdd={() => addItem("nonLiquidAssets")}
          onDelete={id => deleteItem("nonLiquidAssets", id)} />

        {/* Liabilities */}
        <BudgetSection title="Liabilities" icon={<AlertTriangle size={18} />} color={COLORS.liability} bgColor={COLORS.liabilityBg}
          items={budget.liabilities} showMonthly
          onUpdate={(id, u) => updateItem("liabilities", id, u)}
          onAdd={() => addItem("liabilities")}
          onDelete={id => deleteItem("liabilities", id)} />

        {/* Non-Liquid Discount Slider */}
        <div style={{
          backgroundColor: COLORS.card, borderRadius: 12, padding: "12px 16px",
          border: `1px solid ${COLORS.borderLight}`, marginBottom: 12, marginTop: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textMain }}>Non-Liquid Discount Rate</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.nonLiquid }}>{budget.nonLiquidDiscount}%</span>
          </div>
          <input type="range" min={0} max={75} value={budget.nonLiquidDiscount}
            onChange={e => setBudget(b => ({ ...b, nonLiquidDiscount: parseInt(e.target.value) }))}
            style={{ width: "100%", accentColor: COLORS.nonLiquid }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: COLORS.textMuted }}>
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span>
          </div>
        </div>

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
