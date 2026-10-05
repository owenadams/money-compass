import { readFile, writeFile } from 'node:fs/promises';
import { initialMarket } from '../src/catalogue.js';
import { notificationDecision, sendTelegram, updateMessage } from './telegram.js';

let market = initialMarket;
try { market = JSON.parse(await readFile(new URL('../public/data/market.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const dryRun = process.argv.includes('--dry-run');
const localTest = process.argv.includes('--local-test');
const deployed = process.env.DEPLOY_STATUS !== 'failure';
const minimumGain = Number(process.env.ALERT_MIN_GAIN || market.alertSettings?.minimumGain || 50);
const decision = notificationDecision(market, { deployed, minimumGain, weeklySummary: process.env.ALERT_WEEKLY_SUMMARY === 'true' || market.alertSettings?.weeklySummary === true });
const headline = `${decision.reason}. Threshold: £${minimumGain}/year on an illustrative £10,000.\n${decision.improvements.map(item => `${item.category}: ${item.provider} ${item.name}, ${item.before.toFixed(2)}% -> ${item.after.toFixed(2)}% effective yearly rate; about £${Math.round(item.gain)} more per year versus the previous verified best.`).join('\n')}\n${(market.history[0]?.newWarnings || []).map(item => `New warning: ${item.provider} ${item.name}`).join('\n')}`;
const footer = `\n\nVerify eligibility, penalties and tax before moving money.${deployed && !localTest && process.env.PAGE_URL ? `\n${process.env.PAGE_URL}` : ''}${process.env.RUN_URL ? `\nRun: ${process.env.RUN_URL}` : ''}`;
const text = `${headline.slice(0, 700)}\n\n${updateMessage(market, { deployed, localTest }).slice(0, 3000)}${footer}`.slice(0, 4000);
if (!decision.send && !localTest) console.log(decision.reason);
else if (dryRun) console.log(text);
else if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
  console.log('Telegram not configured: skipped. No notification was sent.');
} else {
  try {
    await sendTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID, text });
    if (!localTest) {
      market.alertState = { sentAt: new Date().toISOString(), sentSignatures: [...new Set([...(market.alertState?.sentSignatures || []), ...decision.improvements.map(item => item.signature)])].slice(-100) };
      await writeFile(new URL('../public/data/market.json', import.meta.url), `${JSON.stringify(market, null, 2)}\n`);
    }
    console.log('Telegram update notification sent.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}