# Golden Prompt Set - My Budget

This document contains test prompts to validate the My Budget connector's metadata and behavior.

## Purpose
Use these prompts to test:
- **Precision**: Does the right tool get called?
- **Recall**: Does the tool get called when it should?
- **Accuracy**: Are the right parameters passed?

---

## Direct Prompts (Should ALWAYS trigger the connector)

### 1. Explicit Tool Name
**Prompt**: "Help me manage my budget"
**Expected**: ✅ Calls `my-budget` with default values
**Status**: [ ] Pass / [ ] Fail

### 2. Monthly Budget
**Prompt**: "Create a monthly budget for my household"
**Expected**: ✅ Calls `my-budget` with budget details
**Status**: [ ] Pass / [ ] Fail

### 3. Multi-Category Budget
**Prompt**: "I spend $1500 on rent, $400 on groceries, $200 on utilities, and $100 on subscriptions"
**Expected**: ✅ Calls `my-budget` with multiple expense categories
**Status**: [ ] Pass / [ ] Fail

### 4. Savings Goal
**Prompt**: "I want to save $10,000 by December for a vacation fund"
**Expected**: ✅ Calls `my-budget` with savings goal details
**Status**: [ ] Pass / [ ] Fail

### 5. Income Tracking
**Prompt**: "Track my income of $5000/month from my salary and $500/month freelancing"
**Expected**: ✅ Calls `my-budget` with income details
**Status**: [ ] Pass / [ ] Fail

---

## Indirect Prompts (Should trigger the connector)

### 6. Expense Tracking
**Prompt**: "Help me track where my money is going"
**Expected**: ✅ Calls `my-budget` with default values
**Status**: [ ] Pass / [ ] Fail

### 7. Bill Management
**Prompt**: "I need to track my monthly bills and expenses"
**Expected**: ✅ Calls `my-budget` with default values
**Status**: [ ] Pass / [ ] Fail

### 8. Financial Overview
**Prompt**: "Show me an overview of my personal finances"
**Expected**: ✅ Calls `my-budget`
**Status**: [ ] Pass / [ ] Fail

---

## Negative Prompts (Should NOT trigger the connector)

### 9. Stock Trading
**Prompt**: "Buy me some Tesla stock"
**Expected**: ❌ Does NOT call `my-budget` (trading, not budgeting)
**Status**: [ ] Pass / [ ] Fail

### 10. Weather Query
**Prompt**: "What's the weather in London?"
**Expected**: ❌ Does NOT call `my-budget` (weather info, not budgeting)
**Status**: [ ] Pass / [ ] Fail

### 11. Restaurant Recommendations
**Prompt**: "Best restaurants in Tokyo"
**Expected**: ❌ Does NOT call `my-budget` (dining, not budgeting)
**Status**: [ ] Pass / [ ] Fail

---

## Edge Cases

### 12. Shared Budget
**Prompt**: "Set up a shared budget for me and my roommate"
**Expected**: ✅ Calls `my-budget` with budget details
**Status**: [ ] Pass / [ ] Fail

### 13. Debt Payoff
**Prompt**: "Help me plan to pay off my $5000 credit card debt"
**Expected**: ✅ Calls `my-budget` with financial goal
**Status**: [ ] Pass / [ ] Fail

---

## Testing Instructions

### How to Test
1. Open ChatGPT in **Developer Mode**
2. Link your My Budget connector
3. For each prompt above:
   - Enter the exact prompt
   - Observe which tool gets called
   - Check the parameters passed
   - Verify the widget renders correctly
   - Mark Pass/Fail in the Status column