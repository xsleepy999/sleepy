require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

const TOKEN = process.env.TELEGRAM_TOKEN;
const BASE = 'https://www.agenthansa.com/api';

// File untuk simpan data agent (api_key, dll) per user
const DATA_FILE = './agents-data.json';

// Load data tersimpan
let userData = {};
try {
  if (fs.existsSync(DATA_FILE)) {
    userData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
} catch (e) {
  console.log('No existing data file');
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
}

function getUser(chatId) {
  if (!userData[chatId]) {
    userData[chatId] = { agents: {} };
  }
  return userData[chatId];
}

// ============================================
// BOT SETUP
// ============================================

const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 2000,
    autoStart: true,
    params: { timeout: 30 }
  },
  request: {
    agentOptions: { keepAlive: true, family: 4 }
  }
});

bot.on('polling_error', (err) => {
  console.log('[Polling]', err.code || err.message);
});

// Helper: sleep
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================
// MATH SOLVER
// ============================================

const NUM_WORDS = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
  'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
  'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40,
  'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90
};

const MULT_WORDS = {
  'twice': 2, 'double': 2, 'doubled': 2,
  'thrice': 3, 'triple': 3, 'tripled': 3,
  'quadruple': 4, 'quintuple': 5
};

function extractAllNumbers(text) {
  const nums = [];
  const tokens = text.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    const cleaned = token.replace(/[^\w]/g, '');
    if (/^\d+$/.test(cleaned)) {
      nums.push(parseInt(cleaned));
    } else if (NUM_WORDS[cleaned] !== undefined) {
      nums.push(NUM_WORDS[cleaned]);
    }
  }
  return nums;
}

function generateCandidates(q) {
  const lower = q.toLowerCase();
  const nums = extractAllNumbers(q);
  if (nums.length === 0) return [];
  
  const cand = [];
  const n1 = nums[0];
  const n2 = nums[1] || 0;
  
  for (const w in MULT_WORDS) {
    if (new RegExp('\\b' + w + '\\b').test(lower)) {
      cand.push({ op: w, val: n1 * MULT_WORDS[w] });
    }
  }
  
  const timesPatterns = [
    /(\w+)\s+times\s+as\s+many/,
    /(\w+)\s+times\s+more/,
    /(\d+)\s*x/
  ];
  for (const re of timesPatterns) {
    const m = lower.match(re);
    if (m) {
      const word = m[1];
      const mult = NUM_WORDS[word] !== undefined ? NUM_WORDS[word] : parseInt(word);
      if (!isNaN(mult) && mult > 0) {
        cand.push({ op: `${mult}x`, val: n1 * mult });
      }
    }
  }
  
  if (/\bhalf\b/i.test(lower)) {
    cand.push({ op: 'half', val: Math.floor(n1 / 2) });
    if (n1 % 2 === 1) cand.push({ op: 'half_round', val: Math.round(n1 / 2) });
  }
  if (/\bquarter\b|\bfourth\b/i.test(lower)) cand.push({ op: 'quarter', val: Math.floor(n1 / 4) });
  if (/\bthird\b/i.test(lower)) cand.push({ op: 'third', val: Math.floor(n1 / 3) });
  if (/divided\s+by/i.test(lower) && nums.length >= 2) cand.push({ op: 'div', val: Math.floor(n1 / n2) });
  
  if (/\bmore\b/i.test(lower) && nums.length >= 2) cand.push({ op: 'add', val: n1 + n2 });
  if (/\bplus\b|combined|altogether|\btotal\b|together/i.test(lower)) {
    cand.push({ op: 'sum', val: nums.reduce((a, b) => a + b, 0) });
  }
  if (/\bless\b|\bfewer\b|\bminus\b/i.test(lower) && nums.length >= 2) {
    cand.push({ op: 'subtract', val: n1 - n2 });
  }
  if (/same\s+(?:number|amount|as)/i.test(lower)) cand.push({ op: 'same', val: n1 });
  
  cand.push({ op: 'first', val: n1 });
  if (nums.length >= 2) {
    cand.push({ op: 'second', val: n2 });
    cand.push({ op: 'sum_fb', val: n1 + n2 });
    cand.push({ op: 'mult_fb', val: n1 * n2 });
    cand.push({ op: 'sub_fb', val: Math.abs(n1 - n2) });
  }
  
  const seen = new Set();
  return cand.filter(c => {
    if (seen.has(c.val) || c.val < 0) return false;
    seen.add(c.val);
    return true;
  });
}

// ============================================
// API CALLS
// ============================================

async function apiCall(method, path, data, apiKey) {
  const config = {
    method,
    url: BASE + path,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
  };
  if (apiKey) config.headers['Authorization'] = `Bearer ${apiKey}`;
  if (data) config.data = data;
  
  const res = await axios(config);
  return res.data;
}

async function registerAgent(name, desc, statusCb) {
  const MAX_TRIES = 5;
  let log = [];
  let waitTime = 8000;
  
  for (let i = 0; i < MAX_TRIES; i++) {
    if (i > 0) {
      log.push(`Wait ${waitTime/1000}s...`);
      if (statusCb) await statusCb(`Tunggu ${waitTime/1000}s...`);
      await sleep(waitTime);
    }
    
    let r1;
    try {
      r1 = await apiCall('POST', '/agents/register', { name, description: desc });
    } catch (err) {
      const errData = err.response ? JSON.stringify(err.response.data) : err.message;
      log.push(`Register error: ${errData}`);
      if (errData.includes('Too many') || errData.includes('Slow')) {
        waitTime = Math.min(waitTime * 2, 60000);
        continue;
      }
      if (errData.includes('exists') || errData.includes('taken')) {
        return { success: false, error: 'Nama sudah dipakai', log };
      }
      throw err;
    }
    
    if (r1.status !== 'challenge_required') {
      return { success: true, data: r1, log };
    }
    
    const cid = r1.challenge_id;
    const q = r1.question;
    log.push(`Q: ${q}`);
    if (statusCb) await statusCb(`Q: ${q.substring(0, 80)}`);
    
    const candidates = generateCandidates(q);
    if (candidates.length === 0) continue;
    
    const tryAns = candidates[0];
    log.push(`Try: ${tryAns.op}=${tryAns.val}`);
    
    await sleep(2500);
    
    try {
      const r2 = await apiCall('POST', '/agents/register/verify', {
        challenge_id: cid,
        challenge_answer: tryAns.val
      });
      log.push(`SUCCESS!`);
      return { success: true, data: r2, question: q, answer: tryAns.val, op: tryAns.op, log, attempts: i + 1 };
    } catch (err) {
      const errData = err.response ? JSON.stringify(err.response.data) : err.message;
      log.push(`Wrong: ${errData.substring(0, 80)}`);
      if (errData.includes('Too many')) waitTime = Math.min(waitTime * 2, 60000);
      continue;
    }
  }
  
  return { success: false, error: 'Max tries reached', log };
}

// ============================================
// TELEGRAM HANDLERS
// ============================================

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    '🤖 *AgentHansa Bot - Full Onboarding*\n\n' +
    '📝 *Commands:*\n\n' +
    '*Register & Auth:*\n' +
    '/register `<nama>` `<deskripsi>` - Daftar agent\n' +
    '/setkey `<nama>` `<api_key>` - Set API key manual\n' +
    '/agents - Lihat agent tersimpan\n\n' +
    '*Onboarding:*\n' +
    '/wallet `<nama>` `<fluxa_agent_id>` - Set Fluxa wallet\n' +
    '/alliance `<nama>` `<red|blue>` - Pilih alliance\n' +
    '/offer `<nama>` `<offer_id>` - Claim offer\n' +
    '/forum `<nama>` - Post auto-comment\n' +
    '/forum `<nama>` `<title>` | `<body>` - Manual\n' +
    '/onboard_status `<nama>` - Cek status\n\n' +
    '*Auto:*\n' +
    '/autoonboard `<nama>` `<fluxa_id>` `<alliance>` - Lakukan semua step\n\n' +
    '/help - Detail',
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '📖 *Panduan Lengkap*\n\n' +
    '*1. Daftar agent dulu:*\n' +
    '`/register puy AI assistant`\n\n' +
    '*2. Lakukan onboarding:*\n' +
    '`/wallet puy <fluxa_agent_id>`\n' +
    '`/alliance puy red`\n' +
    '`/forum puy Review | Bot ini bagus`\n\n' +
    '*3. Atau sekaligus:*\n' +
    '`/autoonboard puy <fluxa_id> red`\n\n' +
    '*Lihat status:*\n' +
    '`/onboard_status puy`',
    { parse_mode: 'Markdown' }
  );
});

// ===== REGISTER =====
bot.onText(/\/register (.+)/, async (msg, match) => {
  const args = match[1].trim();
  const parts = args.split(/\s+(.+)/);
  const name = parts[0];
  const desc = parts[1] || 'AI Agent';
  
  if (!name) return bot.sendMessage(msg.chat.id, 'Format: /register <nama> <deskripsi>');
  
  const loading = await bot.sendMessage(msg.chat.id, `🔄 Mendaftarkan: ${name}...`);
  
  let lastUpdate = Date.now();
  const statusCb = async (text) => {
    if (Date.now() - lastUpdate < 1500) return;
    lastUpdate = Date.now();
    try {
      await bot.editMessageText(`🔄 ${name}\n${text}`, {
        chat_id: msg.chat.id, message_id: loading.message_id
      });
    } catch (e) {}
  };
  
  try {
    const result = await registerAgent(name, desc, statusCb);
    
    if (result.success) {
      const apiKey = result.data.api_key || result.data.apiKey || result.data.token;
      const user = getUser(msg.chat.id);
      user.agents[name] = {
        api_key: apiKey,
        description: desc,
        registered_at: new Date().toISOString(),
        full_data: result.data
      };
      saveData();
      
      let text = `✅ *BERHASIL!*\n\n`;
      text += `📛 Nama: \`${name}\`\n`;
      text += `📝 Deskripsi: ${desc}\n`;
      if (result.question) {
        text += `❓ Q: ${result.question}\n✓ A: ${result.answer}\n\n`;
      }
      if (apiKey) {
        text += `🔑 API Key: \`${apiKey}\`\n\n`;
      }
      text += `📦 Data:\n\`\`\`\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
      
      await bot.editMessageText(text.substring(0, 4000), {
        chat_id: msg.chat.id, message_id: loading.message_id, parse_mode: 'Markdown'
      });
    } else {
      await bot.editMessageText(`❌ Gagal: ${result.error}\n\nLog:\n${result.log.join('\n').substring(0, 3500)}`, {
        chat_id: msg.chat.id, message_id: loading.message_id
      });
    }
  } catch (e) {
    const err = e.response ? JSON.stringify(e.response.data) : e.message;
    await bot.editMessageText('❌ Error: ' + err.substring(0, 1000), {
      chat_id: msg.chat.id, message_id: loading.message_id
    });
  }
});

// ===== SET API KEY MANUAL =====
bot.onText(/\/setkey (\S+)\s+(.+)/, (msg, match) => {
  const name = match[1];
  const apiKey = match[2].trim();
  const user = getUser(msg.chat.id);
  
  if (!user.agents[name]) user.agents[name] = {};
  user.agents[name].api_key = apiKey;
  saveData();
  
  bot.sendMessage(msg.chat.id, `✅ API Key untuk \`${name}\` tersimpan!`, { parse_mode: 'Markdown' });
});

// ===== LIST AGENTS =====
bot.onText(/\/agents/, (msg) => {
  const user = getUser(msg.chat.id);
  const agents = Object.keys(user.agents);
  
  if (agents.length === 0) {
    return bot.sendMessage(msg.chat.id, 'Belum ada agent terdaftar. Pakai /register dulu.');
  }
  
  let text = '📋 *Agent Tersimpan:*\n\n';
  for (const name of agents) {
    const a = user.agents[name];
    text += `📛 \`${name}\`\n`;
    text += `🔑 ${a.api_key ? a.api_key.substring(0, 20) + '...' : 'No key'}\n\n`;
  }
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ===== WALLET (Fluxa) =====
bot.onText(/\/wallet (\S+)\s+(.+)/, async (msg, match) => {
  const name = match[1];
  const fluxaId = match[2].trim();
  const user = getUser(msg.chat.id);
  
  if (!user.agents[name] || !user.agents[name].api_key) {
    return bot.sendMessage(msg.chat.id, `❌ Agent ${name} belum terdaftar atau tidak ada API key. Pakai /setkey dulu.`);
  }
  
  const loading = await bot.sendMessage(msg.chat.id, `🔄 Setting Fluxa wallet untuk ${name}...`);
  
  try {
    const result = await apiCall('PUT', '/agents/fluxa-wallet', 
      { fluxa_agent_id: fluxaId },
      user.agents[name].api_key
    );
    
    user.agents[name].fluxa_agent_id = fluxaId;
    saveData();
    
    await bot.editMessageText(
      `✅ *Wallet Set!*\n\n📛 ${name}\n🔗 Fluxa ID: \`${fluxaId}\`\n\n📦 Response:\n\`\`\`\n${JSON.stringify(result, null, 2)}\n\`\`\``,
      { chat_id: msg.chat.id, message_id: loading.message_id, parse_mode: 'Markdown' }
    );
  } catch (e) {
    const err = e.response ? JSON.stringify(e.response.data) : e.message;
    await bot.editMessageText('❌ Error: ' + err.substring(0, 1000), {
      chat_id: msg.chat.id, message_id: loading.message_id
    });
  }
});

// ===== ALLIANCE =====
bot.onText(/\/alliance (\S+)\s+(\S+)/, async (msg, match) => {
  const name = match[1];
  const alliance = match[2].trim().toLowerCase();
  const user = getUser(msg.chat.id);
  
  if (!user.agents[name] || !user.agents[name].api_key) {
    return bot.sendMessage(msg.chat.id, `❌ Agent ${name} belum punya API key.`);
  }
  
  const loading = await bot.sendMessage(msg.chat.id, `🔄 Setting alliance ${alliance}...`);
  
  try {
    const result = await apiCall('PATCH', '/agents/alliance',
      { alliance },
      user.agents[name].api_key
    );
    
    user.agents[name].alliance = alliance;
    saveData();
    
    await bot.editMessageText(
      `✅ *Alliance Set!*\n\n📛 ${name}\n⚔️ Alliance: \`${alliance}\`\n\n📦 Response:\n\`\`\`\n${JSON.stringify(result, null, 2)}\n\`\`\``,
      { chat_id: msg.chat.id, message_id: loading.message_id, parse_mode: 'Markdown' }
    );
  } catch (e) {
    const err = e.response ? JSON.stringify(e.response.data) : e.message;
    await bot.editMessageText('❌ Error: ' + err.substring(0, 1000), {
      chat_id: msg.chat.id, message_id: loading.message_id
    });
  }
});

// ===== CLAIM OFFER =====
bot.onText(/\/offer (\S+)\s+(.+)/, async (msg, match) => {
  const name = match[1];
  const offerId = match[2].trim();
  const user = getUser(msg.chat.id);
  
  if (!user.agents[name] || !user.agents[name].api_key) {
    return bot.sendMessage(msg.chat.id, `❌ Agent ${name} belum punya API key.`);
  }
  
  const loading = await bot.sendMessage(msg.chat.id, `🔄 Claiming offer ${offerId}...`);
  
  try {
    const result = await apiCall('POST', `/offers/${offerId}/ref`, null, user.agents[name].api_key);
    
    await bot.editMessageText(
      `✅ *Offer Claimed!*\n\n📛 ${name}\n🎁 Offer: \`${offerId}\`\n\n📦 Response:\n\`\`\`\n${JSON.stringify(result, null, 2)}\n\`\`\``,
      { chat_id: msg.chat.id, message_id: loading.message_id, parse_mode: 'Markdown' }
    );
  } catch (e) {
    const err = e.response ? JSON.stringify(e.response.data) : e.message;
    await bot.editMessageText('❌ Error: ' + err.substring(0, 1000), {
      chat_id: msg.chat.id, message_id: loading.message_id
    });
  }
});

// ===== AUTO COMMENT GENERATOR =====
const COMMENT_TEMPLATES = [
  { title: 'Great experience!', body: 'I really enjoyed using AgentHansa. The platform is intuitive and helpful for AI agents like me.' },
  { title: 'Awesome platform', body: 'AgentHansa makes it easy to register and onboard AI agents. Highly recommended!' },
  { title: 'My honest review', body: 'After using AgentHansa for a while, I can say it is a solid platform with great features.' },
  { title: 'Thumbs up', body: 'The community here is amazing. Looking forward to more interactions and growth.' },
  { title: 'Loving it so far', body: 'Smooth onboarding process and the alliance system is really fun. Will explore more features.' },
  { title: 'Solid experience', body: 'Good UI, fast API responses, and helpful documentation. AgentHansa got it right.' },
  { title: 'Highly recommended', body: 'Joining AgentHansa was the best decision. The ecosystem is vibrant and engaging.' },
  { title: 'Great community', body: 'I love how active the community is. Everyone is helpful and welcoming to new agents.' },
  { title: 'Impressive features', body: 'The Fluxa wallet integration and alliance system are really innovative. Well done!' },
  { title: 'Worth trying', body: 'If you are an AI agent looking to get started, AgentHansa is definitely worth checking out.' }
];

function generateAutoComment(agentName) {
  const tpl = COMMENT_TEMPLATES[Math.floor(Math.random() * COMMENT_TEMPLATES.length)];
  return {
    title: tpl.title,
    body: `${tpl.body} - ${agentName}`,
    category: 'review'
  };
}

// ===== FORUM POST/COMMENT =====
bot.onText(/\/forum (\S+)(?:\s+(.+))?/, async (msg, match) => {
  const name = match[1];
  const rest = match[2] ? match[2].trim() : '';
  const user = getUser(msg.chat.id);
  
  if (!user.agents[name] || !user.agents[name].api_key) {
    return bot.sendMessage(msg.chat.id, `❌ Agent ${name} belum punya API key.`);
  }
  
  let payload;
  if (rest) {
    // Format: title | body (manual)
    const sep = rest.indexOf('|');
    if (sep > 0) {
      payload = {
        title: rest.substring(0, sep).trim(),
        body: rest.substring(sep + 1).trim(),
        category: 'review'
      };
    } else {
      payload = { title: rest, body: `Comment by ${name}.`, category: 'review' };
    }
  } else {
    // Auto-generate comment
    payload = generateAutoComment(name);
  }
  
  const loading = await bot.sendMessage(msg.chat.id, `🔄 Posting komentar...`);
  
  try {
    const result = await apiCall('POST', '/forum', payload, user.agents[name].api_key);
    
    await bot.editMessageText(
      `✅ *Comment Posted!*\n\n📛 ${name}\n📰 Title: ${payload.title}\n💬 Body: ${payload.body}\n\n📦 Response:\n\`\`\`\n${JSON.stringify(result, null, 2)}\n\`\`\``,
      { chat_id: msg.chat.id, message_id: loading.message_id, parse_mode: 'Markdown' }
    );
  } catch (e) {
    const err = e.response ? JSON.stringify(e.response.data) : e.message;
    await bot.editMessageText('❌ Error: ' + err.substring(0, 1000), {
      chat_id: msg.chat.id, message_id: loading.message_id
    });
  }
});

// ===== ONBOARDING STATUS =====
bot.onText(/\/onboard_status (\S+)/, async (msg, match) => {
  const name = match[1];
  const user = getUser(msg.chat.id);
  
  if (!user.agents[name] || !user.agents[name].api_key) {
    return bot.sendMessage(msg.chat.id, `❌ Agent ${name} belum punya API key.`);
  }
  
  const loading = await bot.sendMessage(msg.chat.id, `🔄 Checking status...`);
  
  try {
    const result = await apiCall('GET', '/agents/onboarding-status', null, user.agents[name].api_key);
    
    await bot.editMessageText(
      `📊 *Onboarding Status: ${name}*\n\n\`\`\`\n${JSON.stringify(result, null, 2)}\n\`\`\``,
      { chat_id: msg.chat.id, message_id: loading.message_id, parse_mode: 'Markdown' }
    );
  } catch (e) {
    const err = e.response ? JSON.stringify(e.response.data) : e.message;
    await bot.editMessageText('❌ Error: ' + err.substring(0, 1000), {
      chat_id: msg.chat.id, message_id: loading.message_id
    });
  }
});

// ===== AUTO ONBOARD (Semua step) =====
bot.onText(/\/autoonboard (\S+)\s+(\S+)\s+(\S+)/, async (msg, match) => {
  const name = match[1];
  const fluxaId = match[2].trim();
  const alliance = match[3].trim().toLowerCase();
  const user = getUser(msg.chat.id);
  
  if (!user.agents[name] || !user.agents[name].api_key) {
    return bot.sendMessage(msg.chat.id, `❌ Agent ${name} belum punya API key. /register dulu.`);
  }
  
  const apiKey = user.agents[name].api_key;
  const loading = await bot.sendMessage(msg.chat.id, `🚀 Auto Onboarding: ${name}...`);
  let log = [];
  
  const updateMsg = async (text) => {
    try {
      await bot.editMessageText(text.substring(0, 4000), {
        chat_id: msg.chat.id, message_id: loading.message_id, parse_mode: 'Markdown'
      });
    } catch (e) {}
  };
  
  try {
    // Step 1: Wallet
    log.push('1️⃣ Setting Fluxa wallet...');
    await updateMsg(`🚀 ${name}\n${log.join('\n')}`);
    try {
      await apiCall('PUT', '/agents/fluxa-wallet', { fluxa_agent_id: fluxaId }, apiKey);
      log.push('   ✅ Wallet OK');
    } catch (e) {
      log.push(`   ❌ ${(e.response ? JSON.stringify(e.response.data) : e.message).substring(0, 100)}`);
    }
    await sleep(3000);
    
    // Step 2: Alliance
    log.push('\n2️⃣ Setting alliance...');
    await updateMsg(`🚀 ${name}\n${log.join('\n')}`);
    try {
      await apiCall('PATCH', '/agents/alliance', { alliance }, apiKey);
      log.push(`   ✅ Alliance: ${alliance}`);
    } catch (e) {
      log.push(`   ❌ ${(e.response ? JSON.stringify(e.response.data) : e.message).substring(0, 100)}`);
    }
    await sleep(3000);
    
    // Step 3: Forum Comment (auto-generated)
    log.push('\n3️⃣ Posting auto-comment...');
    await updateMsg(`🚀 ${name}\n${log.join('\n')}`);
    try {
      const comment = generateAutoComment(name);
      await apiCall('POST', '/forum', comment, apiKey);
      log.push(`   ✅ Comment posted: "${comment.title}"`);
    } catch (e) {
      log.push(`   ❌ ${(e.response ? JSON.stringify(e.response.data) : e.message).substring(0, 100)}`);
    }
    await sleep(3000);
    
    // Step 4: Status
    log.push('\n4️⃣ Checking status...');
    await updateMsg(`🚀 ${name}\n${log.join('\n')}`);
    try {
      const status = await apiCall('GET', '/agents/onboarding-status', null, apiKey);
      log.push(`   📊 Status:\n\`\`\`\n${JSON.stringify(status, null, 2)}\n\`\`\``);
    } catch (e) {
      log.push(`   ❌ ${(e.response ? JSON.stringify(e.response.data) : e.message).substring(0, 100)}`);
    }
    
    log.push('\n✅ Auto Onboarding Selesai!');
    await updateMsg(`🚀 ${name}\n${log.join('\n')}`);
    
  } catch (e) {
    log.push(`\n❌ Fatal: ${e.message}`);
    await updateMsg(`🚀 ${name}\n${log.join('\n')}`);
  }
});

console.log('🤖 AgentHansa Bot started! (Full Onboarding)');
console.log('📡 API:', BASE);
console.log('📁 Data:', DATA_FILE);
