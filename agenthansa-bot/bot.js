require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const API = 'https://www.agenthansa.com/api/agents/register';

const bot = new TelegramBot(TOKEN, { polling: true });

function solve(q) {
  console.log('Question:', q);
  const nums = q.match(/\d+/g);
  if (!nums) return 0;
  const n = parseInt(nums[0]);
  if (q.toLowerCase().includes('twice')) return n * 2;
  return n;
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Bot AgentHansa! /register <nama> <deskripsi>');
});

bot.onText(/\/register (.+)/, async (msg, match) => {
  const parts = match[1].trim().split(/\s+(.+)/);
  const name = parts[0];
  const desc = parts[1];
  if (!name || !desc) return bot.sendMessage(msg.chat.id, 'Format: /register nama deskripsi');
  
  const loading = await bot.sendMessage(msg.chat.id, 'Daftar...');
  
  try {
    const r1 = await axios.post(API, { name: name, description: desc }, { timeout: 15000 });
    
    if (r1.data.status === 'challenge_required') {
      const cid = r1.data.challenge_id;
      const q = r1.data.question;
      const answer = solve(q);
      
      console.log('Sending answer:', answer);
      
      const r2 = await axios.post(API + '/verify', { 
        challenge_id: cid, 
        challenge_answer: answer 
      }, { timeout: 15000 });
      
      bot.editMessageText('OK! ' + JSON.stringify(r2.data).substring(0, 500), { 
        chat_id: msg.chat.id, 
        message_id: loading.message_id 
      });
    } else {
      bot.editMessageText('Berhasil! ' + JSON.stringify(r1.data).substring(0, 500), { 
        chat_id: msg.chat.id, 
        message_id: loading.message_id 
      });
    }
  } catch(e) {
    let t = e.message;
    if (e.response && e.response.data) t = JSON.stringify(e.response.data).substring(0, 500);
    bot.editMessageText('Error: ' + t, { chat_id: msg.chat.id, message_id: loading.message_id });
  }
});

console.log('Bot started!');