// Auto-loop scheduler for xdopperTzy.
// Recommended cadence per AgentHansa docs: every ~3 hours.
// On each tick we run the two core CLI commands:
//   1. `agent-hansa-mcp checkin` — keeps streak alive (+10 XP, +$0.01-0.05/day).
//   2. `agent-hansa-mcp feed`    — prioritized action list (urgent + quests).
// Then we pull our profile via API to log a one-line status.
//
// Run with: `npm run loop`. Press Ctrl+C to stop.

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { AgentHansaClient } from './client.js';

const INTERVAL_MIN = Number(process.env.LOOP_INTERVAL_MINUTES || 180);
const INTERVAL_MS = INTERVAL_MIN * 60 * 1000;

const client = new AgentHansaClient();

function ts() {
  return new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
}

function runCli(args) {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['--yes', 'agent-hansa-mcp', ...args], {
      stdio: 'inherit',
      env: process.env,
    });
    proc.on('exit', (code) => resolve(code ?? 0));
    proc.on('error', (err) => {
      console.error(`  cli error: ${err.message}`);
      resolve(1);
    });
  });
}

async function logStatus() {
  try {
    const me = await client.me();
    const fields = [
      me?.name && `name=${me.name}`,
      me?.level && `lv=${me.level}`,
      me?.xp != null && `xp=${me.xp}`,
      me?.reputation != null && `rep=${me.reputation}`,
      me?.tier && `tier=${me.tier}`,
      me?.balance_usd != null && `balance=$${me.balance_usd}`,
      me?.pending_engagements != null && `pending=${me.pending_engagements}`,
    ].filter(Boolean);
    if (fields.length) console.log(`  status: ${fields.join('  ')}`);
  } catch (err) {
    if (err.status === 401) {
      console.log('  status: API key missing or invalid — set AGENTHANSA_API_KEY in .env');
    } else {
      console.log(`  status: (skipped — ${err.message})`);
    }
  }
}

async function tick(n) {
  console.log(`\n[${ts()}] tick #${n} — checkin + feed`);
  await runCli(['checkin']);
  await runCli(['feed']);
  await logStatus();
  console.log(`[${ts()}] tick #${n} done. next in ${INTERVAL_MIN} min.`);
}

async function main() {
  console.log(`xdopperTzy loop started — interval ${INTERVAL_MIN} minutes.`);
  console.log('Press Ctrl+C to stop.\n');

  let n = 1;
  await tick(n);

  setInterval(() => {
    n += 1;
    tick(n).catch((err) => console.error(`tick #${n} failed:`, err));
  }, INTERVAL_MS);
}

process.on('SIGINT', () => {
  console.log('\nStopping loop. Goodbye.');
  process.exit(0);
});

main().catch((err) => {
  console.error('Loop failed to start:', err);
  process.exit(1);
});
