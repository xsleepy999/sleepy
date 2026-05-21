require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const API = 'https://www.agenthansa.com/api/agents/register';
const VERIFY = API + '/verify';

const bot = new TelegramBot(TOKEN, { polling: true });

// ============================================
// MATH SOLVER - Selesaikan word problems
// ============================================

const NUM_WORDS = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
  'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
  'eighty': 80, 'ninety': 90, 'hundred': 100
};

// Convert "two" -> 2, "twenty three" -> 23
function wordsToNumber(text) {
  const words = text.toLowerCase().split(/\s+/);
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (NUM_WORDS[w] !== undefined) {
      const n = NUM_WORDS[w];
      if (n === 100) current *= 100;
      else current += n;
    } else if (current > 0) {
      total += current;
      current = 0;
    }
  }
  return total + current;
}

// Extract all numbers from text (digit AND word)
function extractNumbers(text) {
  const nums = [];
  // Find digit numbers
  const digitMatches = text.match(/\d+/g);
  if (digitMatches) digitMatches.forEach(n => nums.push(parseInt(n)));
  
  // Find word numbers (basic)
  const lower = text.toLowerCase();
  for (const word in NUM_WORDS) {
    const re = new RegExp('\\b' + word + '\\b', 'g');
    if (re.test(lower)) nums.push(NUM_WORDS[word]);
  }
  return nums;
}

// Try multiple operations and return likely answer
function solveQuestion(q) {
  const lower = q.toLowerCase();
  const nums = extractNumbers(q);
  console.log('[SOLVE] Question:', q);
  console.log('[SOLVE] Numbers found:', nums);
  
  if (nums.length === 0) return null;
  
  const candidates = [];
  
  // === MULTIPLICATION ===
  if (/twice|double|2\s*x/i.test(lower)) {
    candidates.push({ op: 'twice', value: nums[0] * 2 });
  }
  if (/thrice|triple|3\s*x/i.test(lower)) {
    candidates.push({ op: 'thrice', value: nums[0] * 3 });
  }
  // "X times as many"
  const timesMatch = lower.match(/(\w+)\s+times\s+as\s+many/);
  if (timesMatch) {
    const multiplier = NUM_WORDS[timesMatch[1]] || parseInt(timesMatch[1]);
    if (multiplier && nums[0]) candidates.push({ op: `${multiplier}x`, value: nums[0] * multiplier });
  }
  // "N times M"
  if (/times|multiplied/i.test(lower) && nums.length >= 2) {
    candidates.push({ op: 'times', value: nums[0] * nums[1] });
  }
  
  // === DIVISION ===
  if (/half/i.test(lower)) {
    candidates.push({ op: 'half', value: Math.floor(nums[0] / 2) });
  }
  if (/quarter/i.test(lower)) {
    candidates.push({ op: 'quarter', value: Math.floor(nums[0] / 4) });
  }
  if (/third/i.test(lower)) {
    candidates.push({ op: 'third', value: Math.floor(nums[0] / 3) });
  }
  if (/divided/i.test(lower) && nums.length >= 2) {
    candidates.push({ op: 'divided', value: Math.floor(nums[0] / nums[1]) });
  }
  
  // === ADDITION ===
  if (/total|combined|altogether|sum|plus|together/i.test(lower) && nums.length >= 2) {
    const sum = nums.reduce((a, b) => a + b, 0);
    candidates.push({ op: 'sum', value: sum });
  }
  // "X more than"
  const moreMatch = lower.match(/(\d+|\w+)\s+more\s+than/);
  if (moreMatch && nums.length >= 2) {
    candidates.push({ op: 'more', value: nums[0] + nums[1] });
  }
  
  // === SUBTRACTION ===
  if (/less|fewer|minus/i.test(lower) && nums.length >= 2) {
    candidates.push({ op: 'subtract', value: Math.abs(nums[0] - nums[1]) });
  }
  
  // === DEFAULT (just first number) ===
  candidates.push({ op: 'first', value: nums[0] });
  
  console.log('[SOLVE] Candidates:', JSON.stringify(candidates));
  
  // Return primary candidate (first that matches operation)
  return candidates;
}

// ============================================
// REGISTER WITH AUTO-RETRY
// ============================================

async function registerAgent(name, desc, maxRetries = 5) {
  const tried = new Set();
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`\n[ATTEMPT ${attempt + 1}/${maxRetries}]`);
    
    // Step 1: Get challenge
    const r1 = await axios.post(API, { name, description: desc }, { timeout: 20000 });
    
    if (r1.data.status !== 'challenge_required') {
      // Already success, no challenge needed
      return { success: true, data: r1.data };
    }
    
    const cid = r1.data.challenge_id;
    const q = r1.data.question;
    console.log(`[CHALLENGE] ${q}`);
    
    // Step 2: Solve question
    const candidates = solveQuestion(q);
    if (!candidates || candidates.length === 0) {
      console.log('[ERROR] Cannot solve');
      continue;
    }
    
    // Try each candidate (best first)
    for (const c of candidates) {
      const key = `${q}::${c.value}`;
      if (tried.has(key)) continue;
      tried.add(key);
      
      console.log(`[TRY] op=${c.op}, answer=${c.value}`);
      
      try {
        const r2 = await axios.post(VERIFY, {
          challenge_id: cid,
          challenge_answer: c.value
        }, { timeout: 20000 });
        
        // Success!
        console.log('[SUCCESS]', JSON.stringify(r2.data));
        return { success: true, data: r2.data, question: q, answer: c.value, op: c.op };
      } catch (err) {
        if (err.response && err.response.status === 400) {
          console.log(`[WRONG] ${c.op}=${c.value}`);
          // Wrong answer - try next candidate (but challenge_id might be invalidated)
          // According to AgentHansa response, we need to call register again for new challenge
          break; // Break out of candidates loop, get new challenge
        } else {
          throw err; // Other errors, propagate
        }
      }
    }
  }
  
  return { success: false, error: 'Max retries reached' };
}

// ============================================
// TELEGRAM HANDLERS
// ============================================

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    'Bot AgentHansa Auto-Register\n\n' +
    'Commands:\n' +
    '/register <nama> <deskripsi> - Daftar agent\n' +
    '/help - Bantuan'
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    'Cara pakai:\n\n' +
    '/register puy AI assistant untuk coding\n\n' +
    'Bot akan otomatis menyelesaikan math challenge\n' +
    'dan retry sampai berhasil!'
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
    `Mendaftarkan: ${name}\nMenyelesaikan challenge...`
  );
  
  try {
    const result = await registerAgent(name, desc);
    
    if (result.success) {
      let text = '✅ BERHASIL DAFTAR!\n\n';
      text += `Nama: ${name}\n`;
      text += `Deskripsi: ${desc}\n\n`;
      if (result.question) {
        text += `Challenge: ${result.question}\n`;
        text += `Jawaban: ${result.answer} (${result.op})\n\n`;
      }
      text += `Response:\n${JSON.stringify(result.data, null, 2)}`;
      
      bot.editMessageText(text.substring(0, 3500), {
        chat_id: msg.chat.id,
        message_id: loading.message_id
      });
    } else {
      bot.editMessageText('❌ Gagal: ' + result.error, {
        chat_id: msg.chat.id,
        message_id: loading.message_id
      });
    }
  } catch (e) {
    let errMsg = e.message;
    if (e.response && e.response.data) {
      errMsg = JSON.stringify(e.response.data);
    }
    bot.editMessageText('❌ Error: ' + errMsg.substring(0, 500), {
      chat_id: msg.chat.id,
      message_id: loading.message_id
    });
  }
});

// Test command - hanya untuk debug
bot.onText(/\/test/, async (msg) => {
  const tests = [
    'A parrot has 3 keys. A raccoon has twice as many. How many keys does the raccoon have?',
    'A cat has 5 fish. A dog has half as many. How many fish does the dog have?',
    'A bear has 4 apples. A wolf has 3 more. How many apples does the wolf have?',
    'A bird has 10 worms. A snake has 4 less. How many worms does the snake have?'
  ];
  
  let result = '🧪 TEST SOLVER:\n\n';
  for (const t of tests) {
    const candidates = solveQuestion(t);
    result += `Q: ${t}\nA: ${JSON.stringify(candidates)}\n\n`;
  }
  
  bot.sendMessage(msg.chat.id, result.substring(0, 3500));
});

console.log('Bot started! AgentHansa Auto-Register Bot');
