import { useState } from 'react';
import type { Game, HudState } from '../game/Game';

interface BankModalProps {
  game: Game;
  hud: HudState;
}

const QUICK_AMOUNTS = [100, 500, 1000, 2500];

export function BankModal({ game, hud }: BankModalProps) {
  const info = hud.bankModalInfo;
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [customAmt, setCustomAmt] = useState('500');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [, setTick] = useState(0);

  if (!info) return null;

  const isBank = info.kind === 'bank';
  const transactions = game.banking.transactions;

  const runAction = (amount: number) => {
    const res = tab === 'deposit' ? game.bankDeposit(amount) : game.bankWithdraw(amount);
    setFeedback({ ok: res.ok, text: res.message });
    setTick((t) => t + 1);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(customAmt);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFeedback({ ok: false, text: 'Enter a valid dollar amount.' });
      return;
    }
    runAction(Math.floor(parsed));
  };

  const handleStartRobbery = () => {
    const res = game.bankStartRobbery(info.id);
    if (!res.ok) {
      setFeedback({ ok: false, text: res.message });
    }
    setTick((t) => t + 1);
  };

  return (
    <div
      role="dialog"
      aria-label="NovaBank Terminal"
      data-testid="bank-modal"
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-[min(560px,95vw)] overflow-hidden rounded-2xl border border-emerald-500/35 bg-[#091318] text-white shadow-[0_24px_70px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-500/20 bg-[#0d1e24] px-5 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-400">
              {isBank ? 'NOVABANK BRANCH TERMINAL' : 'NOVABANK 24/7 ATM'}
            </div>
            <h2 className="gta-font text-2xl tracking-wider text-white">{info.name}</h2>
          </div>
          <button
            type="button"
            aria-label="Close Bank Terminal"
            onClick={() => game.closeBankModal()}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white/85 hover:bg-white/20"
          >
            Close (Esc)
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Balances */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-[#0d1820] p-3.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/55">
                Wallet Cash
              </div>
              <div className="gta-font mt-1 text-3xl text-emerald-400">
                ${hud.money.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-[#0c2120] p-3.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80">
                NovaBank Card
              </div>
              <div className="gta-font mt-1 text-3xl text-white">
                ${hud.bankBalance.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/40 p-1">
            <button
              type="button"
              onClick={() => {
                setTab('deposit');
                setFeedback(null);
              }}
              className={`rounded-lg py-2 text-xs font-extrabold uppercase tracking-wider transition ${
                tab === 'deposit'
                  ? 'bg-emerald-500 text-black'
                  : 'text-white/75 hover:bg-white/10'
              }`}
            >
              Deposit Cash
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('withdraw');
                setFeedback(null);
              }}
              className={`rounded-lg py-2 text-xs font-extrabold uppercase tracking-wider transition ${
                tab === 'withdraw'
                  ? 'bg-sky-400 text-black'
                  : 'text-white/75 hover:bg-white/10'
              }`}
            >
              Withdraw to Cash
            </button>
          </div>

          {/* Quick Amount Buttons */}
          <div className="grid grid-cols-5 gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => runAction(amt)}
                className="rounded-lg border border-white/15 bg-white/5 py-2 text-xs font-bold text-white hover:bg-white/15"
              >
                ${amt.toLocaleString()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => runAction(tab === 'deposit' ? hud.money : hud.bankBalance)}
              className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 py-2 text-xs font-extrabold text-emerald-200 hover:bg-emerald-500/30"
            >
              ALL
            </button>
          </div>

          {/* Custom Amount Form */}
          <form onSubmit={handleCustomSubmit} className="flex gap-2">
            <input
              type="number"
              min={1}
              step={1}
              aria-label="Custom dollar amount"
              value={customAmt}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') e.stopPropagation();
              }}
              onChange={(e) => setCustomAmt(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm font-bold text-white focus:border-emerald-400 focus:outline-none"
              placeholder="Amount"
            />
            <button
              type="submit"
              className={`rounded-lg px-5 py-2 text-xs font-extrabold uppercase tracking-wider ${
                tab === 'deposit'
                  ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                  : 'bg-sky-400 text-black hover:bg-sky-300'
              }`}
            >
              {tab === 'deposit' ? 'Deposit' : 'Withdraw'}
            </button>
          </form>

          {feedback && (
            <div
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                feedback.ok
                  ? 'bg-emerald-600/25 text-emerald-200'
                  : 'bg-red-600/25 text-red-200'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {/* Ledger */}
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50">
              Account Ledger
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
              {transactions.slice(0, 6).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs"
                >
                  <span className="truncate text-white/85">
                    {tx.label} <span className="ml-1 text-[10px] text-white/40">{tx.timestamp}</span>
                  </span>
                  <span
                    className={`ml-2 font-bold ${
                      tx.amount >= 0 ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {tx.amount >= 0 ? '+' : '-'}${Math.abs(tx.amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bank Robbery Option (Branches Only) */}
          {isBank && !hud.heist.active && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-[#240d11] px-4 py-3">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-red-400">
                  High-Risk Vault Breach
                </div>
                <div className="text-[11px] text-white/75">
                  Trigger silent alarm, drill the vault, loot cash stacks & escape 4-star SNPD.
                </div>
              </div>
              <button
                type="button"
                data-testid="start-robbery-btn"
                onClick={handleStartRobbery}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-red-500"
              >
                Rob Bank
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
