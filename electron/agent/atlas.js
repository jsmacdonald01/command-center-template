// The agent — the agent loop.
//
// The difference between this and the old chat box is that this one can go
// and look. The old one got the whole database pasted into its prompt and
// answered in a single shot; it could tell the owner their most urgent deadline
// but could not do anything about it, and could not check anything it had
// not been handed.
//
// This runs the loop:
//
//   UNDERSTAND -> RETRIEVE -> REASON -> PLAN -> PROPOSE/ACT -> ASSESS -> REPORT
//
// Bounded at six passes. The bound is a real safety property, not tidiness:
// a model that keeps calling tools keeps spending money, and an agent that
// cannot finish should say so rather than loop.
//
// It may run read tools freely. It may never run a write tool — the most
// it can do is prepare a proposal for the owner to approve. That rule lives in
// one place, below, and is the reason the tool registry carries a risk
// level at all.

const conversation = require('../services/conversation');
const registry = require('./tools/registry');
const identity = require('./identity');
const models = require('./models');
const db = require('../services/db');

const MAX_PASSES = 6;

/*
 * Room for one reply. Tokens are billed as they are used, so a higher
 * ceiling costs nothing on the short answers that make up most of them —
 * it only stops a long one being cut off mid-sentence.
 *
 * It was 1,500, which is generous for "what is on today" and not enough
 * for "how would you improve this app". The cut-off reply came back with
 * no text in it at all and they were shown a blank answer.
 */
const MAX_ANSWER_TOKENS = 4000;

const API_URL = 'https://api.anthropic.com/v1/messages';

/* --------------------- tools, as the API wants them ---------------- */

/*
 * zod schemas in the registry, JSON Schema on the wire.
 *
 * This has to be exactly right, and it was not. The first version read
 * `_def.typeName`, which zod 3 used and zod 4 removed — so every field
 * came out as a required string. The model was told `allDay` was a string
 * and sent "false", which is truthy, turning a 10am coffee into an all-day
 * event. It was told `location` was required and dutifully invented "TBD".
 *
 * A wrong schema does not fail loudly. It quietly produces a model that
 * fills in things nobody asked for.
 */
const JSON_TYPES = {
  string: 'string', number: 'number', int: 'integer',
  boolean: 'boolean', bigint: 'number'
};

/** Peels off optional/nullable/default to reach the real type. */
function unwrap(zodType) {
  let node = zodType;
  let optional = false;
  for (let i = 0; i < 10 && node && node._def; i += 1) {
    const t = node._def.type;
    if (t === 'optional' || t === 'nullable' || t === 'default') {
      optional = true;
      node = node._def.innerType;
    } else break;
  }
  return { node, optional };
}

function describeOf(zodType, inner) {
  return (zodType._def && zodType._def.description)
    || (inner && inner._def && inner._def.description)
    || (zodType.description)
    || undefined;
}

function jsonSchemaFor(tool) {
  const properties = {};
  const required = [];

  Object.entries(tool.schema || {}).forEach(([key, zodType]) => {
    const { node, optional } = unwrap(zodType);
    const def = (node && node._def) || {};
    const prop = { type: JSON_TYPES[def.type] || 'string' };

    if (def.type === 'enum') {
      // zod 4 keeps the values in `entries`, as a label -> value map.
      const entries = def.entries || {};
      prop.enum = Object.values(entries);
      prop.type = 'string';
    }

    const description = describeOf(zodType, node);
    if (description) prop.description = description;

    properties[key] = prop;
    if (!optional) required.push(key);
  });

  return { type: 'object', properties, required };
}

/**
 * A tool can be restricted to certain surfaces. Anything without a
 * `surfaces` list is available everywhere; a tool that names them is only
 * offered where it belongs — so a model on the phone is never even told
 * that email search exists, rather than being asked not to use it.
 */
function availableOn(surface) {
  return registry.list().filter((t) => !t.surfaces || t.surfaces.includes(surface));
}

function toolDefinitions(surface) {
  return availableOn(surface).map((t) => ({
    name: t.name,
    description: t.risk === 'write'
      ? `${t.description}\n\nCall this as soon as the owner asks for the change. It does NOT make the change — it puts an approval card on their screen, which is how they get asked. Do not ask "shall I?" first; that asks them twice.`
      : t.description,
    input_schema: jsonSchemaFor(t)
  }));
}

/* ---------------------------- the call ----------------------------- */

async function callAnthropic(key, model, body, surface) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model: model.id, ...body })
  });

  if (!res.ok) {
    const raw = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* keep null */ }
    const message = (parsed && parsed.error && parsed.error.message) || `HTTP ${res.status}`;
    if (res.status === 400 && /credit/i.test(message)) {
      throw new Error('The Anthropic account is out of credits.');
    }
    throw new Error(message);
  }

  const json = await res.json();
  models.record(model, json.usage, surface);
  return json;
}

/* ------------------------------ run -------------------------------- */

/**
 * @param {string} question       what they asked
 * @param {object} opts
 *   surface  'app' | 'telegram'
 *   history  prior turns, oldest first
 *   live     calendar / weather, already fetched
 */
async function run(question, opts = {}) {
  const surface = opts.surface || 'app';
  const key = conversation.loadApiKey();
  if (!key) return { ok: false, error: 'no_api_key' };

  const blocked = models.checkBudget();
  if (blocked) return { ok: false, error: blocked };

  const data = db.loadAll();
  if (!data) return { ok: false, error: 'Command Center has no data yet.' };

  // Sensitive memories are dropped before the prompt is built, not
  // scrubbed from the answer afterwards. By the time the model is
  // speaking, anything in its context has already been sent.
  const memories = db.getMemories(surface !== 'telegram', 15);
  if (memories.length) db.touchMemories(memories.map((m) => m.id));

  const system = identity.systemPrompt({
    surface,
    memories,
    today: new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
  });

  // A short summary of every box goes in every turn; tools are for the
  // detail and for anything too big. Telegram gets the limited version,
  // because whatever is in the prompt is one answer away from Telegram's
  // servers.
  const context = conversation.buildContext(data, opts.live || {},
    surface === 'telegram' ? 'limited' : 'full');

  const messages = [
    ...(opts.history || []).map((m) => ({
      role: m.role === 'me' ? 'user' : 'assistant',
      content: m.text
    })),
    { role: 'user', content: question }
  ];

  const model = models.pick(question);
  const tools = toolDefinitions(surface);

  const used = [];
  const proposals = [];
  let passes = 0;

  while (passes < MAX_PASSES) {
    passes += 1;

    const reply = await callAnthropic(key, model, {
      max_tokens: MAX_ANSWER_TOKENS,
      system: `${system}\n\n--- COMMAND CENTER ---\n${context}`,
      tools,
      messages
    }, surface);

    if (reply.stop_reason !== 'tool_use') {
      const text = (reply.content || [])
        .filter((c) => c.type === 'text').map((c) => c.text).join('').trim();

      // `max_tokens` means the reply was cut off at the ceiling, and a cut
      // reply can carry no text at all — the room ran out inside a tool
      // call, so every block is a half-written one. That is what produced
      // a blank answer on 4 August: 1,500 tokens billed, nothing on screen.
      const truncated = reply.stop_reason === 'max_tokens';

      // Never hand back silence. An answer that did not arrive has to say
      // so — they cannot tell a broken agent from a thinking one, and they
      // paid for the call either way.
      if (!text) {
        return {
          ok: true,
          text: truncated
            ? 'I ran out of room before I could get an answer out. Ask me for one part of that and I will get there.'
            : 'I did not manage an answer to that one. Try asking it a different way.',
          toolsUsed: used, proposals, passes, model: model.id,
          stopReason: reply.stop_reason, empty: true
        };
      }

      return {
        ok: true,
        text: truncated ? `${text}\n\nThat is as far as I got — ask me to carry on.` : text,
        toolsUsed: used, proposals, passes, model: model.id,
        stopReason: reply.stop_reason, truncated
      };
    }

    // Model asked for tools. Run the reads; turn writes into proposals.
    messages.push({ role: 'assistant', content: reply.content });
    const results = [];

    for (const block of reply.content.filter((c) => c.type === 'tool_use')) {
      const tool = registry.get(block.name);
      let payload;

      if (!tool) {
        payload = 'Error: no such tool.';
      } else if (tool.surfaces && !tool.surfaces.includes(surface)) {
        // It was never offered here; refusing as well means a rogue call
        // cannot reach it either.
        payload = 'Error: that is not available on this surface. '
          + 'Tell the owner it is something you can only do at their desk.';
      } else if (tool.risk === 'write') {
        // The single rule this whole design rests on.
        const summary = tool.summarise ? tool.summarise(block.input || {}) : block.name;
        const id = db.addProposal({ surface, summary, tool: tool.name, args: block.input || {} });
        proposals.push({ id, summary, tool: tool.name });
        payload = `Prepared for approval, not done: "${summary}". `
          + 'Tell the owner what you have prepared and that it needs their approval. '
          + 'Do not describe it as completed.';
      } else {
        try {
          const { result } = await registry.execute(tool.name, block.input || {});
          used.push(tool.name);
          payload = JSON.stringify(result);
          if (payload.length > 6000) payload = payload.slice(0, 6000) + '\n…truncated';
        } catch (e) {
          payload = 'Error: ' + e.message;
        }
      }

      results.push({ type: 'tool_result', tool_use_id: block.id, content: payload });
    }

    messages.push({ role: 'user', content: results });
  }

  // Ran out of passes. Say so rather than inventing a conclusion.
  return {
    ok: true,
    text: 'I looked into that but could not finish it in the number of steps I am allowed. '
      + 'Ask me something narrower and I will get further.',
    toolsUsed: used, proposals, passes, model: model.id, hitLimit: true
  };
}

module.exports = { run, MAX_PASSES, __toolDefinitions: toolDefinitions };
