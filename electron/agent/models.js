// Which model runs, what it costs, and the ceiling that stops it.
//
// The owner set $10 a month and asked that it be enforced in code rather than
// in good intentions. So every call is priced and recorded before the next
// one is allowed, and at the ceiling the agent refuses and says why. A
// budget that depends on nobody making a mistake is not a budget.

const db = require('../services/db');

const CEILING_USD = 10;
const WARN_AT = 0.8;

/*
 * Prices are dollars per million tokens. They are used only to keep a
 * running estimate against the ceiling — Anthropic's invoice is the real
 * number. If these drift, the ceiling drifts with them, so they are worth
 * checking occasionally rather than trusting forever.
 */
const MODELS = {
  fast: {
    id: 'claude-haiku-4-5-20251001',
    inputPerM: 1.0,
    outputPerM: 5.0
  },
  strong: {
    id: 'claude-sonnet-5',
    inputPerM: 3.0,
    outputPerM: 15.0
  }
};

/**
 * Picks a model without spending anything to decide.
 *
 * A router that calls a model to choose a model pays twice for one answer.
 * This is a handful of rules over the request, which is enough: the cheap
 * model handles the repetitive shapes, and anything asking for judgement,
 * planning or a change goes to the stronger one.
 */
function pick(request) {
  const text = String(request || '').toLowerCase();

  const needsJudgement = /should i|what do you (think|recommend)|plan|prioriti|decide|advice|why|compare|worth it|help me (with|figure)/.test(text);
  const changesSomething = /add |update |change |set |log |create |schedule |remove |delete |fix /.test(text);
  const isLong = text.length > 400;

  if (needsJudgement || changesSomething || isLong) return MODELS.strong;
  return MODELS.fast;
}

function priceOf(model, usage) {
  const inTok = (usage && usage.input_tokens) || 0;
  const outTok = (usage && usage.output_tokens) || 0;
  return (inTok / 1e6) * model.inputPerM + (outTok / 1e6) * model.outputPerM;
}

/** Called before every API request. Returns why it refused, or null. */
function checkBudget() {
  const { total } = db.monthSpend();
  if (total >= CEILING_USD) {
    return `The agent has reached the $${CEILING_USD} monthly ceiling ($${total.toFixed(2)} used). `
      + 'Raise it in Settings if you want to keep going this month.';
  }
  return null;
}

function record(model, usage, surface) {
  const cost = priceOf(model, usage);
  db.recordSpend({
    model: model.id,
    inputTokens: (usage && usage.input_tokens) || 0,
    outputTokens: (usage && usage.output_tokens) || 0,
    costUsd: cost,
    surface
  });
  return cost;
}

function status() {
  const { total, calls, month } = db.monthSpend();
  return {
    month,
    spent: Number(total.toFixed(4)),
    calls,
    ceiling: CEILING_USD,
    remaining: Number(Math.max(0, CEILING_USD - total).toFixed(4)),
    warning: total >= CEILING_USD * WARN_AT && total < CEILING_USD
  };
}

module.exports = { MODELS, pick, priceOf, checkBudget, record, status, CEILING_USD };
