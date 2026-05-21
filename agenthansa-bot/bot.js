require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const API = 'https://www.agenthansa.com/api/agents/register';
const VERIFY = API + '/verify';

// Bot dengan polling timeout lebih besar untuk fix EFATAL di Termux
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

// Extract semua angka (digit + word) dengan urutan
function extractAllNumbers(text) {
  const nums = [];
  const lower = text.toLowerCase();
  const tokens = lower.split(/\s+/);
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

// Generate semua kemungkinan jawaban (urut prioritas)
function generateCandidates(q) {
  const lower = q.toLowerCase();
  const nums = extractAllNumbers(q);
  console.log(`[SOLVE] Q: "${q}"`);
  console.log(`[SOLVE] Numbers: [${nums.join(', ')}]`);
  
  if (nums.length === 0) return [];
  
  const cand = [];
  const n1 = nums[0];
  const n2 = nums[1] || 0;
  
  // === MULTIPLY ===
  for (const w in MULT_WORDS) {
    if (new RegExp('\\b' + w + '\\b').test(lower)) {
      cand.push({ op: w, val: n1 * MULT_WORDS[w] });
    }
  }
  
  // "X times as many" / "X times more"
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
  
  // === DIVIDE ===
  if (/\bhalf\b/i.test(lower)) {
    cand.push({ op: 'half', val: Math.floor(n1 / 2) });
    if (n1 % 2 === 1) cand.push({ op: 'half_round', val: Math.round(n1 / 2) });
  }
  if (/\bquarter\b|\bfourth\b/i.test(lower)) {
    cand.push({ op: 'quarter', val: Math.floor(n1 / 4) });
  }
  if (/\bthird\b/i.test(lower)) {
    cand.push({ op: 'third', val: Math.floor(n1 / 3) });
  }
  if (/divided\s+by/i.test(lower) && nums.length >= 2) {
    cand.push({ op: 'div', val: Math.floor(n1 / n2) });
  }
  
  // === ADD ===
  if (/\bmore\b/i.test(lower) && nums.length >= 2) {
    cand.push({ op: 'add', val: n1 + n2 });
  }
  if (/\bplus\b|combined|altogether|\btotal\b|together/i.test(lower)) {
    const sum = nums.reduce((a, b) => a + b, 0);
    cand.push({ op: 'sum', val: sum });
  }
  
  // === SUBTRACT ===
  if (/\bless\b|\bfewer\b|\bminus\b/i.test(lower) && nums.length >= 2) {
    cand.push({ op: 'subtract', val: n1 - n2 });
  }
  
  // === SAME ===
  if (/same\s+(?:number|amount|as)/i.test(lower)) {
    cand.push({ op: 'same', val: n1 });
  }
  
  // === FALLBACKS ===
  cand.push({ op: 'first', val: n1 });
  if (nums.length >= 2) {
    cand.push({ op: 'second', val: n2 });
    cand.push({ op: 'sum_fb', val: n1 + n2 });
    cand.push({ op: 'mult_fb', val: n1 * n2 });
    cand.push({ op: 'sub_fb', val: Math.abs(n1 - n2) });
  }
  
  // Dedup berdasarkan value
  const seen = new Set();
  const unique = cand.filter(c => {
    if (seen.has(c.val) || c.val < 0) return false;
    seen.add(c.val);
    return true;
  });
  
  console.log(`[SOLVE] Candidates: ${JSON.stringify(unique)}`);
  return unique;
}

// ============================================
// REGISTER DENGAN SMART RETRY
// ============================================

async function attemptRegister(name, desc, statusCallback) {
  const MAX_TRIES = 12;
  let log = [];
  let waitTime = 3000; // Mulai 3 detik antar request
  
  for (let i = 0; i < MAX_TRIES; i++) {
    log.push(`\n--- Attempt ${i + 1}/${MAX_TRIES} ---`);
    
    // Wait sebelum request (kecuali pertama)
    if (i > 0) {
      log.push(`Wait ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
    }
    
    // Get challenge
    let r1;
    try {
      r1 = await axios.post(API, { name, description: desc }, { timeout: 30000 });
    } catch (err) {
      const errData = err.response ? JSON.stringify(err.response.data) : err.message;
      log.push(`Register error: ${errData}`);
      
      // Rate limit - tunggu lebih lama
      if (errData.includes('Too many requests') || errData.includes('Slow down') || (err.response && err.response.status === 429)) {
        waitTime = Math.min(waitTime * 2, 30000); // Exponential backoff, max 30s
        log.push(`Rate limited, naik wait ke ${waitTime}ms`);
        if (statusCallback) await statusCallback(`Rate limited, tunggu ${waitTime/1000}s...`);
        continue;
      }
      
      if (errData.includes('exists') || errData.includes('taken') || errData.includes('already')) {
        return { success: false, error: 'Nama sudah dipakai', log };
      }
      throw err;
    }
    
    if (r1.data.status !== 'challenge_required') {
      log.push(`Direct success: ${JSON.stringify(r1.data)}`);
      return { success: true, data: r1.data, log };
    }
    
    const cid = r1.data.challenge_id;
    const q = r1.data.question;
    log.push(`Q: ${q}`);
    
    if (statusCallback) {
      await statusCallback(`Attempt ${i+1}: ${q.substring(0, 100)}`);
    }
    
    const candidates = generateCandidates(q);
    
    if (candidates.length === 0) {
      log.push('No candidates');
      continue;
    }
    
    // Coba kandidat pertama (best guess)
    const tryAns = candidates[0];
    log.push(`Try: ${tryAns.op}=${tryAns.val}`);
    
    // Wait sebelum verify (avoid rate limit)
    await new Promise(r => setTimeout(r, 1500));
    
    try {
      const r2 = await axios.post(VERIFY, {
        challenge_id: cid,
        challenge_answer: tryAns.val
      }, { timeout: 30000 });
      
      log.push(`SUCCESS! ${JSON.stringify(r2.data)}`);
      return { 
        success: true, 
        data: r2.data, 
        question: q, 
        answer: tryAns.val, 
        op: tryAns.op,
        log,
        attempts: i + 1
      };
    } catch (err) {
      const errData = err.response ? JSON.stringify(err.response.data) : err.message;
      log.push(`Wrong: ${errData.substring(0, 80)}`);
      
      // Rate limit pada verify - tunggu lebih lama
      if (errData.includes('Too many') || (err.response && err.response.status === 429)) {
        waitTime = Math.min(waitTime * 2, 30000);
        log.push(`Rate limited, naik wait ke ${waitTime}ms`);
      }
      continue;
    }
  }
  
  return { success: false, error: `Gagal setelah ${MAX_TRIES} percobaan`, log };
}

// ============================================
// TELEGRAM HANDLERS
// ============================================

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    '🤖 AgentHansa Auto-Register Bot\n\n' +
    '📝 Commands:\n' +
    '/register <nama> <deskripsi>\n' +
    '/test - Test math solver\n' +
    '/help - Bantuan'
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '📖 Cara Pakai:\n\n' +
    '/register puy AI assistant untuk coding\n\n' +
    'Bot otomatis:\n' +
    '✓ Daftar ke AgentHansa\n' +
    '✓ Selesaikan math challenge\n' +
    '✓ Retry kalau salah (max 12x)\n' +
    '✓ Tampilkan semua proses'
  );
});

bot.onText(/\/register (.+)/, async (msg, match) => {
  const args = match[1].trim();
  const parts = args.split(/\s+(.+)/);
  const name = parts[0];
  const desc = parts[1] || 'AI Agent';
  
  if (!name) {
    return bot.sendMessage(msg.chat.id, 'Format: /register <nama> <deskripsi>');
  }
  
  const loading = await bot.sendMessage(msg.chat.id, 
    `🔄 Mendaftarkan: ${name}\n⏳ Menyelesaikan challenge...`
  );
  
  let lastUpdate = Date.now();
  const statusCallback = async (text) => {
    if (Date.now() - lastUpdate < 1500) return;
    lastUpdate = Date.now();
    try {
      await bot.editMessageText(`🔄 ${name}\n${text}`, {
        chat_id: msg.chat.id,
        message_id: loading.message_id
      });
    } catch (e) {}
  };
  
  try {
    const result = await attemptRegister(name, desc, statusCallback);
    
    let text;
    if (result.success) {
      text = `✅ BERHASIL!\n\n`;
      text += `📛 Nama: ${name}\n`;
      text += `📝 Deskripsi: ${desc}\n`;
      text += `🔢 Attempts: ${result.attempts}\n\n`;
      if (result.question) {
        text += `❓ Challenge:\n${result.question}\n\n`;
        text += `✓ Jawaban: ${result.answer} (${result.op})\n\n`;
      }
      text += `📦 Response:\n${JSON.stringify(result.data, null, 2)}\n\n`;
      text += `📋 Log:${result.log.join('\n')}`;
    } else {
      text = `❌ GAGAL\n\n`;
      text += `Error: ${result.error}\n\n`;
      text += `📋 Log:${result.log.join('\n')}`;
    }
    
    text = text.substring(0, 4000);
    
    await bot.editMessageText(text, {
      chat_id: msg.chat.id,
      message_id: loading.message_id
    });
  } catch (e) {
    let errMsg = e.message;
    if (e.response && e.response.data) {
      errMsg = JSON.stringify(e.response.data);
    }
    await bot.editMessageText('❌ Error: ' + errMsg.substring(0, 1000), {
      chat_id: msg.chat.id,
      message_id: loading.message_id
    });
  }
});

bot.onText(/\/test/, (msg) => {
  const tests = [
    'A parrot has 3 keys. A raccoon has twice as many. How many keys does the raccoon have?',
    'A cat has 5 fish. A dog has half as many. How many fish does the dog have?',
    'A bear has 4 apples. A wolf has 3 more. How many apples does the wolf have?',
    'A bird has 10 worms. A snake has 4 less. How many worms does the snake have?',
    'A fox has 2 berries. A rabbit has thrice as many. How many berries does the rabbit have?',
    'If Tom has 5 marbles and Jerry has 7 marbles, how many marbles do they have altogether?',
    'A duck has 4 eggs. A goose has the same number. How many eggs does the goose have?',
    'A cow has 8 cows. A horse has a third as many. How many horses are there?'
  ];
  
  let result = '🧪 TEST SOLVER:\n\n';
  for (const t of tests) {
    const cands = generateCandidates(t);
    const top3 = cands.slice(0, 3).map(c => `${c.op}=${c.val}`).join(', ');
    result += `Q: ${t}\n→ Pick: ${cands[0] ? cands[0].op + '=' + cands[0].val : 'none'}\n  Alts: ${top3}\n\n`;
  }
  
  bot.sendMessage(msg.chat.id, result.substring(0, 4000));
});

console.log('🤖 AgentHansa Bot started!');
console.log('📡 API:', API);
