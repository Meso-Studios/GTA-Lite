/**
 * San Nova Banking & Multi-Stage Bank Robbery Heist System
 * Supports depositing cash to bank card, withdrawing cash at banks/ATMs,
 * transaction history, and high-stakes multi-stage Bank Robberies.
 */

export interface BankBranch {
  id: string;
  name: string;
  district: string;
  x: number;
  z: number;
  doorYaw: number;
  vaultPayoutMin: number;
  vaultPayoutMax: number;
  cooldownSec: number;
}

export interface AtmLocation {
  id: string;
  label: string;
  x: number;
  z: number;
}

export interface BankTransaction {
  id: number;
  type: 'deposit' | 'withdraw' | 'heist_launder' | 'purchase' | 'event_reward';
  amount: number;
  label: string;
  timestamp: string;
}

export type BankHeistStage =
  | 'idle'
  | 'intimidating'
  | 'drilling'
  | 'looting'
  | 'escaping'
  | 'completed'
  | 'failed';

export interface BankHeistState {
  active: boolean;
  branchId: string | null;
  branchName: string;
  stage: BankHeistStage;
  progress: number; // 0..1 for current stage
  lootCollected: number;
  maxLoot: number;
  alarmTriggered: boolean;
  guardsSpawned: boolean;
  escapeTimer: number;
  promptText: string;
}

export interface BankingState {
  bankBalance: number;
  transactions: BankTransaction[];
  nextTxId: number;
  branchCooldowns: Record<string, number>;
  heist: BankHeistState;
  totalHeistsCompleted: number;
}

export const BANK_BRANCHES: BankBranch[] = [
  {
    id: 'novabank_downtown',
    name: 'NovaBank Reserve — Downtown',
    district: 'DOWNTOWN',
    x: -72,
    z: -120,
    doorYaw: 0,
    vaultPayoutMin: 11000,
    vaultPayoutMax: 18500,
    cooldownSec: 210,
  },
  {
    id: 'novabank_beach',
    name: 'Oceanfront Trust Bank',
    district: 'OCEAN BEACH',
    x: 245,
    z: 68,
    doorYaw: Math.PI * 0.5,
    vaultPayoutMin: 7500,
    vaultPayoutMax: 12500,
    cooldownSec: 180,
  },
  {
    id: 'novabank_midtown',
    name: 'Midtown Capital Credit',
    district: 'MIDTOWN',
    x: 118,
    z: -210,
    doorYaw: Math.PI,
    vaultPayoutMin: 8500,
    vaultPayoutMax: 14000,
    cooldownSec: 180,
  },
  {
    id: 'novabank_suburbs',
    name: 'Sunset Community Savings',
    district: 'SUNSET SUBURBS',
    x: -360,
    z: 280,
    doorYaw: -Math.PI * 0.5,
    vaultPayoutMin: 5000,
    vaultPayoutMax: 9200,
    cooldownSec: 150,
  },
];

export const ATM_LOCATIONS: AtmLocation[] = [
  { id: 'atm_downtown_1', label: 'Downtown Plaza ATM', x: -64, z: -108 },
  { id: 'atm_beach_1', label: 'Boardwalk ATM', x: 256, z: 72 },
  { id: 'atm_wynwood_1', label: 'Wynwood Arts ATM', x: -195, z: -90 },
  { id: 'atm_havana_1', label: 'Little Havana Corner ATM', x: -145, z: 140 },
  { id: 'atm_midtown_1', label: 'Midtown Metro ATM', x: 112, z: -198 },
  { id: 'atm_suburbs_1', label: 'Sunset Gas & ATM', x: -348, z: 272 },
];

export function createBankingState(initialBankBalance = 2500): BankingState {
  return {
    bankBalance: initialBankBalance,
    transactions: [
      {
        id: 1,
        type: 'deposit',
        amount: initialBankBalance,
        label: 'Opening Account Balance',
        timestamp: '09:00',
      },
    ],
    nextTxId: 2,
    branchCooldowns: {},
    heist: {
      active: false,
      branchId: null,
      branchName: '',
      stage: 'idle',
      progress: 0,
      lootCollected: 0,
      maxLoot: 0,
      alarmTriggered: false,
      guardsSpawned: false,
      escapeTimer: 0,
      promptText: '',
    },
    totalHeistsCompleted: 0,
  };
}

function recordTx(
  state: BankingState,
  type: BankTransaction['type'],
  amount: number,
  label: string,
  timeStr: string
): void {
  state.transactions.unshift({
    id: state.nextTxId++,
    type,
    amount,
    label,
    timestamp: timeStr,
  });
  if (state.transactions.length > 20) state.transactions.pop();
}

export function depositCash(
  state: BankingState,
  walletCash: number,
  amount: number,
  timeStr = '12:00'
): { ok: boolean; newWallet: number; newBank: number; message: string } {
  const clean = Math.floor(amount);
  if (clean <= 0) {
    return { ok: false, newWallet: walletCash, newBank: state.bankBalance, message: 'Enter an amount above $0.' };
  }
  if (clean > walletCash) {
    return { ok: false, newWallet: walletCash, newBank: state.bankBalance, message: 'Not enough cash in wallet.' };
  }
  state.bankBalance += clean;
  recordTx(state, 'deposit', clean, 'Cash Deposit', timeStr);
  return {
    ok: true,
    newWallet: walletCash - clean,
    newBank: state.bankBalance,
    message: `Deposited $${clean.toLocaleString()} to NovaBank.`,
  };
}

export function withdrawCash(
  state: BankingState,
  walletCash: number,
  amount: number,
  timeStr = '12:00'
): { ok: boolean; newWallet: number; newBank: number; message: string } {
  const clean = Math.floor(amount);
  if (clean <= 0) {
    return { ok: false, newWallet: walletCash, newBank: state.bankBalance, message: 'Enter an amount above $0.' };
  }
  if (clean > state.bankBalance) {
    return { ok: false, newWallet: walletCash, newBank: state.bankBalance, message: 'Insufficient bank balance.' };
  }
  state.bankBalance -= clean;
  recordTx(state, 'withdraw', -clean, 'Card Cash Withdrawal', timeStr);
  return {
    ok: true,
    newWallet: walletCash + clean,
    newBank: state.bankBalance,
    message: `Withdrew $${clean.toLocaleString()} cash.`,
  };
}

export function startBankRobbery(
  state: BankingState,
  branchId: string,
  rng = Math.random
): { ok: boolean; message: string; wantedStars: number } {
  if (state.heist.active) {
    return { ok: false, message: 'A bank robbery is already in progress!', wantedStars: 0 };
  }
  const branch = BANK_BRANCHES.find((b) => b.id === branchId) || BANK_BRANCHES[0];
  const cd = state.branchCooldowns[branch.id] || 0;
  if (cd > 0) {
    return {
      ok: false,
      message: `${branch.name} vault is on lockdown (${Math.ceil(cd)}s remaining).`,
      wantedStars: 0,
    };
  }

  const maxLoot = Math.round(
    branch.vaultPayoutMin + rng() * (branch.vaultPayoutMax - branch.vaultPayoutMin)
  );

  state.heist = {
    active: true,
    branchId: branch.id,
    branchName: branch.name,
    stage: 'intimidating',
    progress: 0,
    lootCollected: 0,
    maxLoot,
    alarmTriggered: true,
    guardsSpawned: false,
    escapeTimer: 0,
    promptText: 'HOLD TELLER FLOOR — INTIMIDATING STAFF',
  };

  return {
    ok: true,
    message: `ROBBERY STARTED at ${branch.name}! Silent alarm triggered!`,
    wantedStars: 3,
  };
}

export interface HeistStepInput {
  dt: number;
  playerInBank: boolean;
  nearVault: boolean;
  distFromBank: number;
  wantedLevel: number;
  playerAlive: boolean;
}

export interface HeistStepResult {
  cashGainedNow: number;
  stageChanged: boolean;
  banner: string | null;
  completed: boolean;
  failed: boolean;
  bumpWantedTo: number;
}

export function stepBankHeist(state: BankingState, input: HeistStepInput): HeistStepResult {
  const dt = Math.min(0.25, Math.max(0, input.dt));

  // Tick cooldowns
  for (const key of Object.keys(state.branchCooldowns)) {
    state.branchCooldowns[key] = Math.max(0, state.branchCooldowns[key] - dt);
  }

  const h = state.heist;
  if (!h.active) {
    return { cashGainedNow: 0, stageChanged: false, banner: null, completed: false, failed: false, bumpWantedTo: 0 };
  }

  if (!input.playerAlive) {
    h.active = false;
    h.stage = 'failed';
    h.promptText = '';
    return {
      cashGainedNow: 0,
      stageChanged: true,
      banner: 'HEIST FAILED — BUSTED / WASTED',
      completed: false,
      failed: true,
      bumpWantedTo: 0,
    };
  }

  let cashGainedNow = 0;
  let stageChanged = false;
  let banner: string | null = null;
  let bumpWantedTo = 0;

  if (h.stage === 'intimidating') {
    if (input.playerInBank || input.distFromBank < 26) {
      h.progress = Math.min(1, h.progress + dt * 0.24);
      h.promptText = 'STAY INSIDE LOBBY — CONTROL THE CROWD';
    }
    if (h.progress >= 1) {
      h.stage = 'drilling';
      h.progress = 0;
      stageChanged = true;
      bumpWantedTo = 4;
      h.promptText = 'THERMAL DRILL ACTIVE ON VAULT DOOR — HOLD POSITION';
      banner = 'TELLERS COMPLIANT — DRILLING BANK VAULT!';
    }
  } else if (h.stage === 'drilling') {
    const rate = input.nearVault ? 0.16 : input.playerInBank || input.distFromBank < 26 ? 0.10 : 0.02;
    h.progress = Math.min(1, h.progress + dt * rate);
    h.promptText = input.nearVault
      ? 'THERMAL DRILL BREACHING VAULT STEEL...'
      : 'MOVE NEAR VAULT DOOR TO SPEED UP DRILLING';
    if (h.progress >= 1) {
      h.stage = 'looting';
      h.progress = 0;
      stageChanged = true;
      h.promptText = 'VAULT OPEN — PACKING CASH STACKS!';
      banner = 'VAULT BREACHED! GRAB THE CASH!';
    }
  } else if (h.stage === 'looting') {
    const rate = input.nearVault ? 0.22 : input.playerInBank || input.distFromBank < 26 ? 0.14 : 0;
    const prevLoot = h.lootCollected;
    h.progress = Math.min(1, h.progress + dt * rate);
    h.lootCollected = Math.round(h.maxLoot * h.progress);
    cashGainedNow = Math.max(0, h.lootCollected - prevLoot);
    h.promptText = `LOOTING VAULT — $${h.lootCollected.toLocaleString()} / $${h.maxLoot.toLocaleString()}`;
    if (h.progress >= 1) {
      h.stage = 'escaping';
      h.progress = 0;
      h.escapeTimer = 0;
      stageChanged = true;
      bumpWantedTo = 4;
      h.promptText = 'ESCAPE THE AREA — GET 180M CLEAR OF THE BANK!';
      banner = 'BAGS FULL! ESCAPE THE POLICE RESPONSE!';
    }
  } else if (h.stage === 'escaping') {
    const distProg = Math.min(1, input.distFromBank / 180);
    h.progress = distProg;
    if (input.distFromBank >= 180 && input.wantedLevel <= 2) {
      h.escapeTimer += dt;
    }
    if (input.distFromBank >= 220 || (input.distFromBank >= 180 && input.wantedLevel === 0) || h.escapeTimer >= 6) {
      const branch = BANK_BRANCHES.find((b) => b.id === h.branchId);
      if (branch) state.branchCooldowns[branch.id] = branch.cooldownSec;
      state.totalHeistsCompleted += 1;
      h.active = false;
      h.stage = 'completed';
      h.promptText = '';
      return {
        cashGainedNow: 0,
        stageChanged: true,
        banner: `HEIST COMPLETE! CLEAN GETAWAY WITH $${h.lootCollected.toLocaleString()}!`,
        completed: true,
        failed: false,
        bumpWantedTo: 0,
      };
    }
  }

  return { cashGainedNow, stageChanged, banner, completed: false, failed: false, bumpWantedTo };
}

export function findNearestBankOrAtm(
  x: number,
  z: number,
  maxDist = 14
): { kind: 'bank' | 'atm'; id: string; name: string; dist: number; branch?: BankBranch } | null {
  let best: { kind: 'bank' | 'atm'; id: string; name: string; dist: number; branch?: BankBranch } | null = null;
  for (const b of BANK_BRANCHES) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < maxDist && (!best || d < best.dist)) {
      best = { kind: 'bank', id: b.id, name: b.name, dist: d, branch: b };
    }
  }
  for (const a of ATM_LOCATIONS) {
    const d = Math.hypot(x - a.x, z - a.z);
    if (d < Math.min(maxDist, 6.5) && (!best || d < best.dist)) {
      best = { kind: 'atm', id: a.id, name: a.label, dist: d };
    }
  }
  return best;
}
