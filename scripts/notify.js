import { readFile } from 'node:fs/promises';
import { initialMarket } from '../src/catalogue.js';
import { sendTelegram, updateMessage } from './telegram.js';

let market = initialMarket;
try { market = JSON.parse(await readFile(new URL('../public/data/market.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const dryRun = process.argv.includes('--dry-run');
const text = updateMessage(market, { pageUrl: process.env.PAGE_URL, runUrl: process.env.RUN_URL, deployed: process.env.DEPLOY_STATUS !== 'failure', localTest: process.argv.includes('--local-test') });
if (dryRun) console.log(text);
else if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
  console.log('Telegram not configured: skipped. No notification was sent.');
} else {
  try {
    await sendTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID, text });
    console.log('Telegram update notification sent.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}