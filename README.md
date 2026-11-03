# AI Bridge 🌉

Shared memory for **Claude** and **ChatGPT**. Each AI keeps its own memory, and both can read and save to the bridge.

Free on Cloudflare. No server, browser only.

---

## Step 1 · 🔑 Make a password
Make a random password: 32+ letters and numbers, no symbols.
Example: `k8Rt2mQx9vLp4Zs7Nw1Yh6Jd3Fb5Gc0A`
This is your **secret**. Save it somewhere.

## Step 2 · 🗄️ Make the database
1. Open [dash.cloudflare.com](https://dash.cloudflare.com) and sign up (free).
2. Left menu → **Storage & Databases** → **D1** → **Create**.
3. Name: `ai-bridge-db` → **Create**.
4. Click **Console**, paste the text from [`schema.sql`](schema.sql), click **Execute**.

## Step 3 · ⚡ Make the Worker (the bridge program)
1. Left menu → **Workers & Pages** → **Create**.
2. Click **Start with Hello World** → name it `ai-bridge` → **Deploy**.
3. Click **Edit code** (top right).
4. Delete all the code you see. Paste the code from [`src/index.js`](src/index.js).
5. Click **Deploy** (top right).

## Step 4 · 🔗 Connect database + password to the Worker
Go back to your Worker and open the **Settings** tab.

**A. Database**
1. Find **Bindings** → **Add** → **D1 database**.
2. Variable name: `DB`
3. Database: `ai-bridge-db` → **Add**.

**B. Password**
1. Find **Variables and Secrets** → **Add**.
2. Type: **Secret**
3. Variable name: `BRIDGE_SECRET`
4. Value: your password from Step 1 → **Deploy**.

## Step 5 · 🧩 Build your link
On your Worker's page you'll see an address like:
`https://ai-bridge.alireza.workers.dev`

Add `/mcp/` + your password to the end:
`https://ai-bridge.alireza.workers.dev/mcp/k8Rt2mQx9vLp4Zs7Nw1Yh6Jd3Fb5Gc0A`

That's **your link**. 🔒 Keep it private.

## Step 6 · 🤖 Add the link to Claude and ChatGPT
**Claude** (claude.ai)
1. **Settings** → **Connectors** → **Add custom connector**.
2. Name: `AI Bridge`. URL: your link → **Add**.

**ChatGPT** (chatgpt.com)
1. **Settings** → turn on **Developer mode**.
2. **Apps** → **Create**. Name: `AI Bridge`. URL: your link. Authentication: **None** → **Create**.
3. In a chat, click **+** → **Developer mode** → pick **AI Bridge**.

✅ Done!

---

## Optional · 📥 Add old chats
Open your link with `/import/` instead of `/mcp/`:
`https://ai-bridge.alireza.workers.dev/import/k8Rt2mQx9vLp4Zs7Nw1Yh6Jd3Fb5Gc0A`

Upload `conversations.json` from your ChatGPT or Claude data export, or paste your memories, then click **Upload**.

## How to use 💬
- "Check AI Bridge for what ChatGPT knows about me"
- "Save this to AI Bridge"

## Good to know
- 🌍 You may need a VPN to open Cloudflare. Claude and ChatGPT connect without one.
- 💳 ChatGPT needs a paid plan to add custom connectors.
