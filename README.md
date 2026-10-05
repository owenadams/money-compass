# Money Compass

A mobile-friendly UK money comparison app for GitHub Pages. Includes savings, cash ISAs, investment ISA platforms, fund and ETF research examples, individual-share research examples, Premium Bonds and Lifetime ISAs. There are no account connections, trackers or financial transactions.

Website: [owenadams.github.io/money-compass](https://owenadams.github.io/money-compass/)

## Local use

Requires Node.js 24 and npm.

```sh
npm ci
npm test
npm run dev -- --port 5186 --strictPort
```

Production build: `npm run build`. Home-screen icons are already included; regenerate with `node scripts/generate-icons.js` after installing dependencies.

## What is and is not updated

- `npm run update` checks the selected provider pages, saves dated results to `public/data/market.json`, and retains 12 check runs.
- Product-specific automated rate adapters currently cover Cynergy easy access, Cahoot Sunny Day Saver, NS&I Direct Saver, NS&I Direct ISA and Premium Bonds. Other rates and investment fees are manually sourced snapshots from the linked comparison guides, read on 5 October 2026.
- Reviews are original Money Compass feature summaries, not independently audited reviews or scraped customer scores. Customer reviews and editorial/official sources are linked. These summaries and eligibility/access conditions retain their separate manual-review dates.
- A reachable page never refreshes a rate date. Failed, ambiguous and blocked checks preserve the old rate and original date. Rates older than eight days are marked out of date and do not win current-rate sorting.
- A changed source fingerprint flags terms for review and removes the cash shortlist assessment. Page text can change for unrelated reasons, so this warning is intentionally conservative. To approve a reviewed change, update the relevant entry and its `termsReviewedAt` in `src/catalogue.js`, then rerun the updater. Do not just clear flags without checking terms.
- This is a selected comparison list, not a whole-market best-buy service. New best-buy providers are not discovered automatically. Add or review entries when the market changes. Individual shares have research links, not quotes, performance feeds or buy/sell recommendations.
- Some sites block automation. Do not bypass access controls. Use an authorised data feed or manual review for those sources. Source terms should be checked before expanding automated collection.

## Publish to GitHub Pages

1. Create a public `money-compass` repository and publish this project's contents to its `main` branch. Do not include other Owen-AI folders.
2. Under repository **Settings > Pages**, choose **GitHub Actions** as the source.
3. Under **Settings > Secrets and variables > Actions**, add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` privately. The existing calendar-digest bot and chat can be reused; never put its `.env` or credentials in this repository.
4. Run **Actions > Weekly checks and GitHub Pages > Run workflow**. The workflow tests, checks sources, saves the dated snapshot, builds, publishes, then sends Telegram a check summary and website link. A failed deployment sends a failure notice, not a success notice. Missing Telegram secrets skip sending with an explicit log message.
5. Weekly checks run Mondays at 08:00 UTC. Schedules run from the default branch, may be delayed by GitHub and can be disabled after 60 days of repository inactivity. Check Actions if a weekly message stops arriving.

Relative assets and hash navigation support repository Pages paths without a custom domain. No Netlify service is used. GitHub Pages is public: amounts and the shortlist are stored only in the browser's local storage, never in the public dataset. They do not sync between devices. Third-party Google Fonts and favicon requests are made; failed logos fall back to initials.

### Reuse the existing Telegram setup locally

The calendar digest sends plain-text JSON to Telegram's bot `sendMessage` endpoint. Money Compass uses the same secret names and endpoint. For a local test that loads the sibling `.env` without displaying or copying it:

```sh
node --env-file=../calendar-digest/.env scripts/notify.js --local-test
```

This sends a real notification. To preview the message without sending: `node scripts/notify.js --dry-run`. GitHub Actions cannot read a file on your PC; repository secrets still need to be configured.

## Phone shortcut

On the published HTTPS site, use Safari **Share > Add to Home Screen** on iPhone, or your Android browser's **Add to Home screen** option. The manifest and PNG icons support a standalone home-screen shortcut. The app requires a connection; no service worker caches potentially stale financial data.

## Financial limitations

Information only, not personalised advice. Assessment labels explain research fit, access restrictions and freshness; they do not certify a provider's safety or recommend a specific allocation. Investing can lose value. FSCS does not cover market losses. Cash protection applies to eligible deposits per authorised institution, with shared licences combined. Premium Bonds prize fund rates are not personal returns. LISA withdrawal charges can reduce original contributions. Tax and product rules can change: verify official/provider sources before acting.