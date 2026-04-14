---
name: trading
type: profile
version: 1.0
required_fields:
  - exchange
  - strategy_type
  - risk_limits
  - backtest_command
phase_fields:
  - complexity
  - strategy_version
  - market
  - timeframe
  - live_trading
init_docs:
  - Strategy Context
  - Risk Model
tags: [onyx-profile]
---

## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: trading

> For algorithmic trading bots, strategy development, and market analysis. Covers backtesting, live integration, risk management, and exchange connectivity. Acceptance is gated on risk model compliance — not just tests passing. **Never deploys to live trading without explicit human approval.**

---

## When to use this profile

- Algorithmic trading strategy development (KrakenBot, any exchange bot)
- Backtesting and strategy optimisation
- Exchange API integration (order routing, position management)
- Risk model implementation and validation
- Market data pipelines and signal generation

If you're building generic infrastructure that happens to be in a trading repo (auth, database, logging), use the engineering profile for those phases. Trading profile phases are specifically about strategy, risk, or market interaction.

---

## Required Overview fields

```yaml
profile: trading
exchange: kraken                               # target exchange (kraken, binance, coinbase, etc.)
strategy_type: arbitrage                       # arbitrage | trend | mean-reversion | market-making | hybrid
risk_limits: "max_position_usd: 500, max_drawdown_pct: 3, max_daily_loss_usd: 200"
backtest_command: pnpm backtest                # command to run backtest suite
repo_path: /home/jamal/clawd/krakenbot        # where the code lives
test_command: pnpm test                        # unit + integration tests
live_enabled: false                            # true only when strategy is approved for live
```

`exchange` is required. Exchange-specific constraints (rate limits, order types, fee tiers, tick sizes) affect every implementation decision.

`strategy_type` is required. Shapes how the agent reasons about correctness — an arbitrage strategy has different invariants than a trend-following one.

`risk_limits` is required. Written into the Overview as the hard floor for every phase. The agent checks all implementations against these limits before marking a phase complete.

`backtest_command` is required. Must pass (exit 0, meet risk limits, produce a report) before any strategy phase is accepted.

`live_enabled: false` is the safe default. Only set to `true` after explicit human review and approval. Phases that would push changes to live execution are blocked until this flag is true.

---

## Phase fields

Trading phases carry these optional frontmatter fields:

```yaml
complexity: heavy                          # light | standard | heavy — use heavy for risk-critical phases
strategy_version: "1.3.2"                 # semver; increment on strategy changes, not just code changes
market: BTC/USD                           # primary market this phase targets
timeframe: 5m                             # candle/execution timeframe
live_trading: false                       # set true only if this phase touches live execution paths
```

`live_trading: true` is the highest-risk flag in this profile. Any phase with this set requires:
1. Backtest passing with positive expectancy
2. Risk limits verified programmatically
3. `live_enabled: true` in the Overview
4. Explicit human sign-off in `## Human Requirements` before the agent executes

---

## Bundle structure

When `onyx init` creates a trading project, it generates:

```
KrakenBot/
├── KrakenBot - Overview.md            ← exchange, strategy_type, risk_limits, backtest_command
├── KrakenBot - Knowledge.md           ← strategy learnings, backtest results, live performance
├── KrakenBot - Strategy Context.md    ← strategy logic, edge cases, market assumptions
├── KrakenBot - Risk Model.md          ← position sizing, drawdown rules, kill switches
├── Phases/
│   └── P1 - Bootstrap.md              ← verify exchange connectivity, run baseline backtest
└── Logs/
    └── L1 - Bootstrap.md
```

**Strategy Context** — the strategy's logic in plain English, not code. Why does this edge exist? What market conditions make it work? What makes it fail? Every agent reads this before touching strategy code.

**Risk Model** — the hard limits in one document. Max position size, max drawdown, max daily loss, kill switch conditions. Treated as inviolable by the agent. If an implementation would violate the risk model, the phase is blocked, not worked around.

---

## When creating a new bundle

**For the LLM generating the Overview at `onyx init` time:**

The Overview.md for a trading project must include:
1. A `## Strategy` section — what the strategy does, what edge it exploits, why that edge exists
2. A `## Risk model` section — all limits (position size, drawdown, daily loss, max open orders, kill switch triggers)
3. A `## Exchange` section — target exchange(s), API tier, relevant constraints (rate limits, minimum order sizes, fee structure)
4. A `## Markets` section — which pairs/instruments, which timeframes, which sessions
5. A `## Live readiness criteria` section — what must be true before `live_enabled` is set to `true` (backtest Sharpe, drawdown ceiling, paper trading duration, etc.)
6. A `## Known risks` section — what could make this strategy fail (regime change, liquidity collapse, API outage, etc.)

The Strategy Context starts with:
```
# Strategy Context — [Project Name]

> Plain-English description of the strategy. No code. An agent should be able to reason about correctness from this document alone.

## The edge
[Why does this opportunity exist? What market inefficiency does it exploit?]

## Execution logic
[Step-by-step: signal → size → entry → management → exit]

## When it works
[Market conditions where this strategy has positive expectancy]

## When it fails
[Conditions that kill the edge: regime change, liquidity crunch, competition, API issues]

## Open questions
[Things we don't know yet; hypotheses to test]
```

The Risk Model starts with:
```
# Risk Model — [Project Name]

> Hard limits. The agent treats these as inviolable. Any implementation that would breach a limit is blocked.

## Position limits
- Max position size: [USD value]
- Max concurrent positions: [N]
- Max exposure per market: [USD or % of portfolio]

## Drawdown limits
- Max daily loss: [USD]
- Max drawdown from peak: [%]
- Circuit breaker: [what triggers a full halt]

## Kill switch conditions
[Explicit conditions that halt all trading immediately]

## Recovery protocol
[What happens after a kill switch fires — human review required before restart]
```

---

## Acceptance verification

Before ONYX marks a trading phase `completed`:

1. **Unit and integration tests pass** — `test_command` exits 0. No exceptions.
2. **Backtest passes** — `backtest_command` exits 0 AND produces a report. The report must show:
   - Positive expectancy (positive expected value per trade)
   - Max drawdown within the risk model limits
   - Sufficient sample size (minimum trade count varies by strategy — set in Overview)
3. **Risk model compliance** — agent reviews implementation against the Risk Model document. Any code path that could breach a limit is fixed or flagged.
4. **Live gate** — if the phase touches live execution and `live_enabled: false`, the phase is `blocked` with `## Human Requirements`: "Strategy ready for live review. Backtest report: [summary]. Awaiting approval to set live_enabled: true."
5. **Strategy Context updated** — any new learning about when the strategy works/fails appended to Strategy Context.
6. **Knowledge updated** — backtest results (Sharpe, max drawdown, trade count, expectancy) appended to Knowledge.md with date and strategy version.

---

## Context the agent receives

ONYX injects these into the agent's context (in order):

1. This profile file
2. Project Overview.md
3. Project Knowledge.md (all prior backtest results, live performance, learnings)
4. Project Strategy Context.md
5. Project Risk Model.md
6. The phase file

The agent reads both the Strategy Context and Risk Model before touching any code. It must understand the edge and the limits before it can reason about whether an implementation is correct.

---

## Notes for the agent

- **Never set `live_enabled: true` yourself.** That flag is set by the human after explicit review. Your job is to get the strategy ready and block for approval.
- **Risk model is not a suggestion.** If your implementation could breach a risk limit under any realistic scenario, fix it. "It's unlikely" is not acceptance criteria.
- **Backtest results go to Knowledge.md.** Every backtest run: date, strategy version, Sharpe, max drawdown, trade count, expectancy. This is the performance history.
- **Strategy versions are semantic.** Increment on logic changes, not just code changes. A bug fix might be a patch; a signal change is a minor version; a new strategy idea is a major version.
- **If the backtest fails**, don't iterate blindly. Understand *why* it failed — regime mismatch, data issue, execution assumption — before changing the strategy. Document the failure mode in Strategy Context under "When it fails."
- **Paper trading before live.** If the Overview specifies a paper trading gate, do not create a live approval request until paper trading is complete and results are in Knowledge.md.
