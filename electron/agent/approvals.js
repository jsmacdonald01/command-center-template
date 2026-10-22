// Turning an approved proposal into a change that provably happened.
//
// The agent never reaches this file on its own. Only the owner does, by approving
// something on screen. That is the whole trust model in one sentence.
//
// The ASSESS step is the reason this is not just `execute(tool, args)`.
// A tool returning without throwing is not evidence that anything landed —
// so after the write, the record is read back and compared. If it does not
// match, this reports a failure rather than a success, and the Log says so.

const db = require('../services/db');
const registry = require('./tools/registry');

async function approve(id) {
  const proposal = db.getProposal(id);
  if (!proposal) return { ok: false, error: 'That proposal no longer exists.' };

  if (proposal.status === 'expired') {
    return { ok: false, error: 'That expired after 48 hours. Ask me again and I will prepare a fresh one.' };
  }
  if (proposal.status !== 'pending') {
    return { ok: false, error: `Already ${proposal.status}.` };
  }

  const tool = registry.get(proposal.tool);
  if (!tool) {
    db.setProposalStatus(id, 'failed', { error: 'unknown tool' }, false);
    return { ok: false, error: 'That action no longer exists in this version.' };
  }

  let outcome;
  try {
    // Deliberately NOT wrapped in db.transaction().
    //
    // better-sqlite3 transactions are synchronous — the function has to
    // finish before the commit. Starting async work inside one commits an
    // empty transaction immediately and the real work happens outside it,
    // which is a lie that looks like a safety net. Worse for a Google
    // write, where the whole operation is a network call and nothing
    // touches SQLite at all.
    //
    // The individual db mutations are already atomic on their own, and
    // every tool here performs exactly one. Verification after the fact is
    // what actually catches a half-done write — see verify() in the
    // registry.
    outcome = await registry.execute(tool.name, proposal.args);
  } catch (e) {
    db.setProposalStatus(id, 'failed', { error: e.message }, false);
    db.logEvent('AI', 'Agent action failed', proposal.summary);
    return { ok: false, error: e.message, summary: proposal.summary };
  }

  const { result, verified } = outcome;
  db.setProposalStatus(id, verified ? 'executed' : 'failed', result, verified);
  db.logEvent('AI', verified ? 'Agent action approved' : 'Agent action unverified', proposal.summary);
  db.flush();

  return verified
    ? { ok: true, verified: true, summary: proposal.summary, result }
    : {
      ok: false,
      verified: false,
      summary: proposal.summary,
      error: 'It ran but I could not confirm the change is really there. Worth checking the page yourself.'
    };
}

function reject(id) {
  const proposal = db.getProposal(id);
  if (!proposal) return { ok: false, error: 'That proposal no longer exists.' };
  if (proposal.status !== 'pending') return { ok: false, error: `Already ${proposal.status}.` };
  db.setProposalStatus(id, 'rejected', null, false);
  return { ok: true, summary: proposal.summary };
}

function pending() {
  return db.listProposals('pending');
}

module.exports = { approve, reject, pending };
