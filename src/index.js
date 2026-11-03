// AI Bridge (Cloudflare edition) — shared memory MCP server for Claude, ChatGPT and other AIs.
// Each AI keeps its own built-in memory. This server holds a shared copy that every
// connected AI can search and read; each AI writes under its own name.
//
// Routes (all protected by the secret in the URL):
//   POST /mcp/<SECRET>      MCP endpoint — paste this URL into Claude and ChatGPT
//   GET  /import/<SECRET>   Browser page to upload chat exports, memory lists and skills
//   POST /import/<SECRET>   Bulk upload API used by that page
//
// Needs: a D1 binding named DB, and a secret named BRIDGE_SECRET (16+ characters).

const SERVER_INFO = { name: "ai-bridge", version: "1.1.0" };
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const KINDS = ["memory", "chat", "skill"];
const MAX_CONTENT = 200_000; // characters per item

const INSTRUCTIONS = `AI Bridge is shared memory between the user's AI assistants (Claude, ChatGPT, ...).
- When the user mentions something from another assistant, or a task needs past context, call bridge_search first.
- Save durable facts, project context, chat summaries and skills with bridge_save, using YOUR OWN name as "source" ("claude" if you are Claude, "chatgpt" if you are ChatGPT).
- Never overwrite or delete items saved by a different source.`;

const SOURCE_PROP = {
  type: "string",
  description: 'Name of the AI that owns the item, lowercase: "claude", "chatgpt", "gemini", ...',
};
const KIND_PROP = {
  type: "string",
  enum: KINDS,
  description: "memory = facts/preferences, chat = conversation or summary, skill = reusable instructions",
};

const TOOLS = [
  {
    name: "bridge_search",
    title: "Search shared memory",
    description: "Search memories, chats and skills saved by any connected AI. Use when the user refers to another assistant or past context.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for (all words must match)" },
        source: { ...SOURCE_PROP, description: "Only items from this AI. Omit to search all." },
        kind: KIND_PROP,
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "bridge_list",
    title: "List recent items",
    description: "List the most recently updated items, optionally filtered by AI and kind.",
    inputSchema: {
      type: "object",
      properties: {
        source: { ...SOURCE_PROP, description: "Only items from this AI. Omit for all." },
        kind: KIND_PROP,
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "bridge_read",
    title: "Read an item",
    description: "Read the full content of one item by id (ids come from bridge_search or bridge_list).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        offset: { type: "integer", minimum: 0, default: 0, description: "Character offset for long items" },
        length: { type: "integer", minimum: 1, maximum: 50000, default: 20000 },
      },
      required: ["id"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "bridge_save",
    title: "Save to shared memory",
    description: "Save or update a memory, chat summary or skill under YOUR OWN source name. Same source+kind+title updates the existing item.",
    inputSchema: {
      type: "object",
      properties: {
        source: { ...SOURCE_PROP, description: 'YOUR OWN name: "claude" if you are Claude, "chatgpt" if you are ChatGPT.' },
        kind: KIND_PROP,
        title: { type: "string", description: "Short unique title, e.g. 'Rewearr brand colors'" },
        content: { type: "string" },
        tags: { type: "string", description: "Optional comma-separated tags" },
      },
      required: ["source", "kind", "title", "content"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "bridge_delete",
    title: "Delete an item",
    description: "Delete one item. Only works when source matches the item's owner.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer" }, source: SOURCE_PROP },
      required: ["id", "source"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
];

// ---------- helpers ----------

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const norm = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const clampInt = (v, def, min, max) => {
  const n = Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def;
  return Math.min(max, Math.max(min, n));
};

function snippet(text, words, size = 240) {
  const lower = text.toLowerCase();
  let pos = -1;
  for (const w of words) {
    const p = lower.indexOf(w);
    if (p !== -1 && (pos === -1 || p < pos)) pos = p;
  }
  const start = Math.max(0, (pos === -1 ? 0 : pos) - Math.floor(size / 3));
  const s = text.slice(start, start + size).replace(/\s+/g, " ");
  return (start > 0 ? "…" : "") + s + (start + size < text.length ? "…" : "");
}

function validateItem(it) {
  const source = norm(it.source);
  const kind = norm(it.kind);
  const title = typeof it.title === "string" ? it.title.trim().slice(0, 300) : "";
  const content = typeof it.content === "string" ? it.content.slice(0, MAX_CONTENT) : "";
  const tags = typeof it.tags === "string" ? it.tags.slice(0, 500) : "";
  if (!/^[a-z0-9_-]{1,40}$/.test(source)) throw new Error("source must be a short lowercase name like 'claude' or 'chatgpt'");
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of: ${KINDS.join(", ")}`);
  if (!title) throw new Error("title is required");
  if (!content) throw new Error("content is required");
  return { source, kind, title, content, tags };
}

const UPSERT_SQL = `INSERT INTO items (source, kind, title, content, tags)
  VALUES (?1, ?2, ?3, ?4, ?5)
  ON CONFLICT(source, kind, title) DO UPDATE SET
    content = excluded.content, tags = excluded.tags, updated_at = datetime('now')
  RETURNING id`;

// ---------- tools ----------

async function callTool(env, name, args = {}) {
  const db = env.DB;
  switch (name) {
    case "bridge_search": {
      const words = String(args.query || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
      if (!words.length) throw new Error("query is required");
      const where = [];
      const params = [];
      for (const w of words) {
        params.push(`%${w.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
        where.push(`lower(title || ' ' || tags || ' ' || content) LIKE ?${params.length} ESCAPE '\\'`);
      }
      if (args.source) { params.push(norm(args.source)); where.push(`source = ?${params.length}`); }
      if (args.kind) { params.push(norm(args.kind)); where.push(`kind = ?${params.length}`); }
      params.push(clampInt(args.limit, 10, 1, 50));
      const { results } = await db
        .prepare(`SELECT id, source, kind, title, tags, content, updated_at FROM items
                  WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ?${params.length}`)
        .bind(...params)
        .all();
      if (!results.length) return "No matching items.";
      return results
        .map((r) => `#${r.id} [${r.source}/${r.kind}] ${r.title} (updated ${r.updated_at})${r.tags ? ` tags: ${r.tags}` : ""}\n  ${snippet(r.content, words)}`)
        .join("\n\n");
    }

    case "bridge_list": {
      const where = [];
      const params = [];
      if (args.source) { params.push(norm(args.source)); where.push(`source = ?${params.length}`); }
      if (args.kind) { params.push(norm(args.kind)); where.push(`kind = ?${params.length}`); }
      params.push(clampInt(args.limit, 20, 1, 100));
      const { results } = await db
        .prepare(`SELECT id, source, kind, title, length(content) AS size, updated_at FROM items
                  ${where.length ? "WHERE " + where.join(" AND ") : ""}
                  ORDER BY updated_at DESC LIMIT ?${params.length}`)
        .bind(...params)
        .all();
      if (!results.length) return "Bridge is empty.";
      return results.map((r) => `#${r.id} [${r.source}/${r.kind}] ${r.title} — ${r.size} chars, updated ${r.updated_at}`).join("\n");
    }

    case "bridge_read": {
      const row = await db.prepare("SELECT * FROM items WHERE id = ?1").bind(clampInt(args.id, 0, 0, 2 ** 31)).first();
      if (!row) throw new Error("Item not found");
      const offset = clampInt(args.offset, 0, 0, MAX_CONTENT);
      const length = clampInt(args.length, 20000, 1, 50000);
      const part = row.content.slice(offset, offset + length);
      const rest = row.content.length - offset - length;
      const more = rest > 0 ? `\n\n[…${rest} more chars — call again with offset ${offset + length}]` : "";
      return `#${row.id} [${row.source}/${row.kind}] ${row.title}\nupdated ${row.updated_at}${row.tags ? ` | tags: ${row.tags}` : ""}\n\n${part}${more}`;
    }

    case "bridge_save": {
      const it = validateItem(args);
      const row = await db.prepare(UPSERT_SQL).bind(it.source, it.kind, it.title, it.content, it.tags).first();
      return `Saved #${row.id} [${it.source}/${it.kind}] ${it.title}`;
    }

    case "bridge_delete": {
      const id = clampInt(args.id, 0, 0, 2 ** 31);
      const row = await db.prepare("SELECT source FROM items WHERE id = ?1").bind(id).first();
      if (!row) throw new Error("Item not found");
      if (row.source !== norm(args.source)) throw new Error(`Item belongs to "${row.source}"; only that AI can delete it.`);
      await db.prepare("DELETE FROM items WHERE id = ?1").bind(id).run();
      return `Deleted #${id}`;
    }

    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

// ---------- MCP JSON-RPC (stateless Streamable HTTP, JSON responses) ----------

async function handleRpc(env, msg) {
  const isRequest = msg && msg.id !== undefined && msg.id !== null;
  const reply = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: msg?.id ?? null, error: { code, message } });

  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isRequest ? fail(-32600, "Invalid request") : null;
  }
  if (!isRequest) return null; // notifications need no reply

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call":
      try {
        const text = await callTool(env, msg.params?.name, msg.params?.arguments || {});
        return reply({ content: [{ type: "text", text }] });
      } catch (e) {
        if (e.code === -32602) return fail(-32602, e.message);
        return reply({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
      }
    case "resources/list":
      return reply({ resources: [] });
    case "prompts/list":
      return reply({ prompts: [] });
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

async function handleMcp(request, env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST", ...CORS } });
  let body;
  try { body = await request.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map((m) => handleRpc(env, m)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return json(batch ? replies : replies[0]);
}

// ---------- import ----------

async function handleImport(request, env) {
  if (request.method === "GET") {
    return new Response(IMPORT_PAGE, { headers: { "content-type": "text/html; charset=utf-8", "referrer-policy": "no-referrer" } });
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length || items.length > 100) return json({ error: "Send 1–100 items per request" }, 400);

  const stmts = [];
  const errors = [];
  items.forEach((raw, i) => {
    try {
      const it = validateItem(raw);
      stmts.push(env.DB.prepare(UPSERT_SQL).bind(it.source, it.kind, it.title, it.content, it.tags));
    } catch (e) { errors.push({ index: i, error: e.message }); }
  });
  if (stmts.length) await env.DB.batch(stmts);
  return json({ saved: stmts.length, errors });
}

const IMPORT_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Bridge Import</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--ink:#1d1d1b;--mute:#6b6b66;--line:#e3e2dd;--acc:#3a5bd9}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#20201e;--ink:#ecebe6;--mute:#9a9992;--line:#34332f;--acc:#8aa2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:28px 16px 60px}h1{font-size:22px;margin:0 0 4px}p.sub{color:var(--mute);margin:0 0 22px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}
h2{font-size:15px;margin:0 0 6px}small{color:var(--mute);display:block;margin-bottom:10px}
textarea,select,input[type=text]{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:8px;padding:8px}
textarea{min-height:110px}.row{display:flex;gap:8px;margin-bottom:8px}.row>*{flex:1}
button{font:inherit;font-weight:600;background:var(--acc);color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}
button:disabled{opacity:.5;cursor:default}#log{white-space:pre-wrap;font:13px/1.45 ui-monospace,monospace;color:var(--mute);margin-top:12px}
</style></head><body><main>
<h1>AI Bridge import</h1><p class="sub">Add old chats, memory and skills to the shared bridge. Files are read in your browser; only the extracted text is uploaded.</p>
<section><h2>1. Chat exports</h2><small>ChatGPT: <b>conversations.json</b> from Settings → Data controls → Export. Claude: <b>conversations.json</b> from Settings → Privacy → Export data. Unzip first. The source is detected automatically.</small>
<input type="file" id="chats" accept=".json" multiple></section>
<section><h2>2. Memory list</h2><small>Paste memories, one per line (for example from ChatGPT → Settings → Personalization → Manage memories).</small>
<div class="row"><select id="memSrc"><option value="chatgpt">From ChatGPT</option><option value="claude">From Claude</option><option value="other">Other AI</option></select></div>
<textarea id="mem" placeholder="Name is Alireza&#10;Runs the Rewearr clothing shop"></textarea></section>
<section><h2>3. Skills</h2><small>SKILL.md or other .md instruction files.</small>
<div class="row"><select id="skillSrc"><option value="claude">From Claude</option><option value="chatgpt">From ChatGPT</option><option value="other">Other AI</option></select></div>
<input type="file" id="skills" accept=".md,.txt" multiple></section>
<button id="go">Upload to bridge</button><div id="log"></div>
</main><script>
const MAX=200000, log=(t)=>{document.getElementById('log').textContent+=t+"\\n"};
const day=(v)=>!v?'':typeof v==='number'?new Date(v*1000).toISOString().slice(0,10):String(v).slice(0,10);
function fromChatGPT(c){const m=c.mapping||{};let id=c.current_node,chain=[];while(id&&m[id]){if(m[id].message)chain.push(m[id].message);id=m[id].parent}
 const lines=chain.reverse().filter(x=>['user','assistant'].includes(x.author&&x.author.role)).map(x=>{const ct=x.content||{};
 let t=(ct.parts||[]).filter(p=>typeof p==='string').join('\\n').trim();if(!t&&typeof ct.text==='string')t=ct.text.trim();
 return t?(x.author.role==='user'?'User: ':'ChatGPT: ')+t:null}).filter(Boolean);if(!lines.length)return null;
 const title=(c.title||'Untitled chat').trim(),cid=String(c.id||c.conversation_id||'').slice(0,8);
 return{source:'chatgpt',kind:'chat',title:cid?title+' ['+cid+']':title,tags:'export',content:('ChatGPT chat — '+title+'\\nDate: '+day(c.create_time)+'\\n\\n'+lines.join('\\n\\n')).slice(0,MAX)}}
function fromClaude(c){const lines=(c.chat_messages||[]).map(m=>{let t=(m.text||'').trim();if(!t)t=(m.content||[]).filter(x=>x&&x.type==='text').map(x=>x.text||'').join('\\n').trim();
 return t?(m.sender==='human'?'User: ':'Claude: ')+t:null}).filter(Boolean);if(!lines.length)return null;
 const title=(c.name||'Untitled chat').trim(),cid=String(c.uuid||'').slice(0,8);
 return{source:'claude',kind:'chat',title:cid?title+' ['+cid+']':title,tags:'export',content:('Claude chat — '+title+'\\nDate: '+day(c.created_at)+'\\n\\n'+lines.join('\\n\\n')).slice(0,MAX)}}
async function collect(){const items=[];
 for(const f of document.getElementById('chats').files){let d;try{d=JSON.parse(await f.text())}catch(e){log('✗ '+f.name+': not valid JSON');continue}
  const list=Array.isArray(d)?d:(d.conversations||[]);let n=0;
  for(const c of list){const it=c.mapping?fromChatGPT(c):c.chat_messages?fromClaude(c):null;if(it){items.push(it);n++}}
  log('• '+f.name+': '+n+' chats')}
 const ms=document.getElementById('memSrc').value;let mc=0;
 for(const l of document.getElementById('mem').value.split('\\n')){const t=l.trim().replace(/^[-*•]\\s*/,'');if(t){items.push({source:ms,kind:'memory',title:t.slice(0,120),content:t,tags:'import'});mc++}}
 if(mc)log('• memory: '+mc+' lines');
 const ss=document.getElementById('skillSrc').value;
 for(const f of document.getElementById('skills').files){items.push({source:ss,kind:'skill',title:f.name.replace(/\\.(md|txt)$/i,''),content:(await f.text()).slice(0,MAX),tags:'import'})}
 return items}
document.getElementById('go').onclick=async(e)=>{const b=e.target;b.disabled=true;document.getElementById('log').textContent='';
 try{const items=await collect();if(!items.length){log('Nothing to upload.');return}let saved=0;
  for(let i=0;i<items.length;i+=25){const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:items.slice(i,i+25)})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);saved+=j.saved;(j.errors||[]).forEach(x=>log('  skipped: '+x.error));
   log('  '+Math.min(i+25,items.length)+'/'+items.length+' sent')}
  log('✓ Done. Saved '+saved+' items.')}catch(err){log('✗ '+err.message)}finally{b.disabled=false}};
</script></body></html>`;

// ---------- router ----------

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (!env.BRIDGE_SECRET || env.BRIDGE_SECRET.length < 16) {
      return new Response("Not configured: add a secret named BRIDGE_SECRET (16+ characters).", { status: 500 });
    }
    if (!env.DB) return new Response("Not configured: add a D1 database binding named DB.", { status: 500 });

    const [, route, secret] = new URL(request.url).pathname.split("/");
    if (!safeEqual(secret || "", env.BRIDGE_SECRET)) return new Response("Not found", { status: 404 });
    if (route === "mcp") return handleMcp(request, env);
    if (route === "import") return handleImport(request, env);
    return new Response("Not found", { status: 404 });
  },
};
