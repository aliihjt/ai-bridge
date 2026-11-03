# AI Bridge 🌉

Shared memory for **Claude** and **ChatGPT**. Each AI keeps its own memory, and both can read and save to the bridge.

Free on Cloudflare. No server, browser only.

---

## Setup

**1. 🔑 Secret**
Make a random password: 32+ letters and numbers, no symbols.

**2. 🗄️ Database**
[dash.cloudflare.com](https://dash.cloudflare.com) → **D1** → **Create** → name `ai-bridge-db`
Open it → **Console** → paste [`schema.sql`](schema.sql) → **Execute**

**3. ⚡ Worker**
**Workers & Pages** → **Create** → **Hello World** → name `ai-bridge` → **Deploy**
**Edit code** → replace everything with [`src/index.js`](src/index.js) → **Deploy**

**4. 🔗 Settings** (in the Worker)
- **Bindings** → **Add** → **D1** → name `DB` → pick `ai-bridge-db`
- **Variables and Secrets** → **Add** → **Secret** → name `BRIDGE_SECRET` → paste your secret

**5. 🤖 Connect**
Your URL: `https://ai-bridge.YOURNAME.workers.dev/mcp/YOUR_SECRET`

- **Claude:** Settings → Connectors → **Add custom connector** → paste URL
- **ChatGPT:** Settings → turn on **Developer mode** → Apps → **Create** → paste URL, Auth: **None**
  (in each chat: **+** → Developer mode → AI Bridge)

**6. 📥 Old chats (optional)**
Open `https://ai-bridge.YOURNAME.workers.dev/import/YOUR_SECRET` and upload your exported `conversations.json` or paste memories.

---

## Use 💬

- "Check AI Bridge for what ChatGPT knows about me"
- "Save this to AI Bridge"

## Good to know
- 🔒 Keep the URL private: the secret is your password.
- 🌍 A VPN may be needed to open Cloudflare. The AIs connect fine without one.
- 💳 ChatGPT needs a paid plan for custom connectors.
