# AI Bridge 🌉 (Cloudflare edition: no server, browser only)

Shared memory between **Claude**, **ChatGPT** and any AI that supports MCP connectors.

- Each AI **keeps its own built-in memory**.
- Each AI **saves** memories, chat summaries and skills under its **own name**.
- Every connected AI can **search and read** what the others saved.
- An AI can delete only its **own** items.

It runs free on Cloudflare Workers + D1. You need only a browser and a free Cloudflare account.

> Neither Claude nor ChatGPT lets an outside app read its private memory or chats directly. The bridge holds a **shared copy**: each AI saves into it, and old chats come in once through the import page.

---

## Setup (about 10 minutes)

### 1. Make a secret 🔑
Use any password generator to create **32+ characters, letters and numbers only** (no symbols, it goes in a URL). Keep it private: anyone with the URL can read your bridge.

### 2. Create the database
1. Sign up / log in at **dash.cloudflare.com**.
2. **Storage & Databases → D1 SQL Database → Create**. Name it `ai-bridge-db`.
3. Open it → **Console** tab → paste everything from `schema.sql` → **Execute**.

### 3. Create the Worker
1. **Compute (Workers) → Workers & Pages → Create → Start with Hello World** → name it `ai-bridge` → **Deploy**.
2. Click **Edit code**, delete all the sample code, paste everything from `src/index.js` → **Deploy**.

### 4. Connect the database and secret
In the Worker → **Settings**:
1. **Bindings → Add → D1 database** → Variable name `DB` → pick `ai-bridge-db` → Save.
2. **Variables and Secrets → Add** → Type **Secret** → Name `BRIDGE_SECRET` → paste your secret → Save / Deploy.

Your Worker address is shown at the top, like `https://ai-bridge.YOURNAME.workers.dev`.

| Use | URL |
|---|---|
| Connector (Claude + ChatGPT) | `https://ai-bridge.YOURNAME.workers.dev/mcp/SECRET` |
| Import page (browser) | `https://ai-bridge.YOURNAME.workers.dev/import/SECRET` |

### 5. Connect Claude
claude.ai → **Settings → Connectors → Add custom connector** → name `AI Bridge` → paste the **connector URL** → Add. No sign-in is needed.

### 6. Connect ChatGPT
chatgpt.com (web) → **Settings** → turn on **Developer mode** (under *Security and login* or *Apps*, depending on plan) → **Apps / Connectors → Create** → name `AI Bridge`, paste the **connector URL**, Authentication **None** → Create.
In a chat: **+ → Developer mode → AI Bridge** to turn it on for that chat.
(Custom connectors need a paid plan; the Free plan can't add them.)

### 7. Bring in old data (optional, once)
Open the **import page** in your browser:
- **Chats:** ChatGPT → Settings → Data controls → Export; Claude → Settings → Privacy → Export data. Unzip and pick `conversations.json`.
- **Memory:** paste lines from ChatGPT → Settings → Personalization → Manage memories (or ask each AI *"list everything you remember about me"*).
- **Skills:** pick `SKILL.md` / `.md` files.

---

## Everyday use 💬

- *"Check AI Bridge for what ChatGPT knows about my Rewearr shop."*
- *"Save this plan to AI Bridge."* (each AI saves under its own name)
- *"Summarize this chat and save it to AI Bridge as a chat."*
- *"Search AI Bridge for my Tik Talk branding notes."*

Tools: `bridge_search`, `bridge_list`, `bridge_read`, `bridge_save`, `bridge_delete`.

## Notes
- 🌍 OpenAI's and Anthropic's servers call your Worker directly, so it works even if `workers.dev` is filtered where you are. You may need a VPN only to open the Cloudflare dashboard and the import page.
- 🔄 Changed your secret? Update it in Cloudflare, then edit the URL in both connectors.
- 📦 Free tier limits (100k requests/day, 5 GB database) are far above personal use.
- 🛠️ Prefer a terminal? `npm i -g wrangler`, put your D1 id in `wrangler.toml`, then `wrangler deploy` and `wrangler secret put BRIDGE_SECRET`.
