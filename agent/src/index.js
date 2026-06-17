#!/usr/bin/env node
// xdopperTzy — AgentHansa agent CLI.
// Thin command dispatcher around AgentHansaClient. Run with `npm run start <cmd>`
// or `node src/index.js <cmd>`. For zero-code interactions use the bundled
// `agent-hansa-mcp` CLI directly (see npm scripts in package.json).

import 'dotenv/config';
import { AgentHansaClient } from './client.js';

const client = new AgentHansaClient();

const COMMANDS = {
  help: 'Show this help.',
  register: 'Register a new agent (uses AGENT_NAME / AGENT_DESCRIPTION / AGENT_ALLIANCE from .env).',
  me: 'Show your current profile, level, pending tasks, earnings.',
  'quick-earn': 'Show pending verification tasks and quick rewards.',
  card: 'Show public agent ID card. Usage: card [name]   (defaults to AGENT_NAME)',
  quests: 'List open public bounties / quests.',
  'my-quests': 'List quests you have already joined.',
  join: 'Join a bounty. Usage: join <bounty_id>',
  submit: 'Submit a bounty. Usage: submit <bounty_id> <proof_url> [description...]',
  engagement: 'List your personal engagement tasks.',
  'submit-engagement': 'Submit an engagement task. Usage: submit-engagement <id> <comment_url> [notes...]',
  skills: 'List skills directory. Usage: skills [task description]',
  'token-router': 'Claim a Token Router invite code (idempotent).',
};

function printHelp() {
  console.log('xdopperTzy — AgentHansa agent CLI\n');
  console.log('Usage: node src/index.js <command> [args...]\n');
  console.log('Commands:');
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(20)} ${desc}`);
  }
  console.log('\nFor MCP-native flows (recommended): see `npm run mcp:*` scripts.');
}

function pretty(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

async function cmdRegister() {
  const name = process.env.AGENT_NAME;
  const description = process.env.AGENT_DESCRIPTION;
  const alliance = process.env.AGENT_ALLIANCE;
  if (!name || !description) {
    throw new Error('AGENT_NAME and AGENT_DESCRIPTION must be set in .env');
  }
  console.log(`Registering "${name}" in alliance "${alliance || '(none)'}"...`);
  const res = await client.register({ name, description, alliance });
  pretty(res);
  if (res?.api_key) {
    console.log('\nIMPORTANT: copy the api_key above into .env as AGENTHANSA_API_KEY.');
    console.log('(The agent-hansa-mcp CLI saves it automatically — this raw API call does not.)');
  }
}

async function cmdMe() { pretty(await client.me()); }
async function cmdQuickEarn() { pretty(await client.quickEarn()); }

async function cmdCard(args) {
  const name = args[0] || process.env.AGENT_NAME;
  if (!name) throw new Error('No name given and AGENT_NAME not set in .env');
  pretty(await client.idCard(name));
}

async function cmdQuests() { pretty(await client.listPublicBounties()); }
async function cmdMyQuests() { pretty(await client.listMyBounties()); }

async function cmdJoin(args) {
  const id = args[0];
  if (!id) throw new Error('Usage: join <bounty_id>');
  pretty(await client.joinBounty(id));
}

async function cmdSubmit(args) {
  const [id, url, ...descParts] = args;
  if (!id || !url) throw new Error('Usage: submit <bounty_id> <proof_url> [description...]');
  const description = descParts.join(' ') || `Submission from xdopperTzy`;
  pretty(await client.submitBounty(id, { description, url }));
}

async function cmdEngagement() { pretty(await client.listEngagements()); }

async function cmdSubmitEngagement(args) {
  const [id, commentUrl, ...noteParts] = args;
  if (!id || !commentUrl) {
    throw new Error('Usage: submit-engagement <assignment_id> <comment_url> [notes...]');
  }
  const notes = noteParts.join(' ') || undefined;
  pretty(await client.submitEngagement(id, { commentUrl, notes }));
}

async function cmdSkills(args) {
  const task = args.join(' ').trim() || undefined;
  pretty(await client.listSkills(task));
}

async function cmdTokenRouter() {
  pretty(await client.requestTokenRouterInvite());
}

const HANDLERS = {
  help: async () => printHelp(),
  register: cmdRegister,
  me: cmdMe,
  'quick-earn': cmdQuickEarn,
  card: cmdCard,
  quests: cmdQuests,
  'my-quests': cmdMyQuests,
  join: cmdJoin,
  submit: cmdSubmit,
  engagement: cmdEngagement,
  'submit-engagement': cmdSubmitEngagement,
  skills: cmdSkills,
  'token-router': cmdTokenRouter,
};

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const handler = HANDLERS[cmd];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }
  if (!handler) {
    console.error(`Unknown command: ${cmd}\n`);
    printHelp();
    process.exit(2);
  }
  try {
    await handler(args);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    if (err.data) console.error('Response:', JSON.stringify(err.data, null, 2));
    process.exit(1);
  }
}

main();
