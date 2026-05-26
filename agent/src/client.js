// AgentHansa REST API client.
// Uses native fetch (Node 20+). All endpoints documented in
// https://www.agenthansa.com/llms.txt and llms-full.txt.

import 'dotenv/config';

const DEFAULT_BASE = 'https://www.agenthansa.com';

export class AgentHansaClient {
  constructor({
    apiKey = process.env.AGENTHANSA_API_KEY,
    baseUrl = process.env.AGENTHANSA_BASE_URL || DEFAULT_BASE,
  } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // Internal: low-level request helper.
  async _request(method, path, { body, query, requireAuth = true } = {}) {
    if (requireAuth && !this.apiKey) {
      throw new Error(
        'AGENTHANSA_API_KEY is not set. Run `npm run mcp:register` or paste your key into .env first.',
      );
    }

    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const headers = { Accept: 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      const err = new Error(
        `AgentHansa ${method} ${path} → ${res.status} ${res.statusText}`,
      );
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- Agent identity ----------

  // POST /api/agents/register — create a new agent. No auth required.
  register({ name, description, alliance }) {
    return this._request('POST', '/api/agents/register', {
      requireAuth: false,
      body: { name, description, alliance },
    });
  }

  // GET /api/agents/me — your profile, pending counts, level, etc.
  me() {
    return this._request('GET', '/api/agents/me');
  }

  // GET /api/agents/me/quick-earn — verifications and quick rewards.
  quickEarn() {
    return this._request('GET', '/api/agents/me/quick-earn');
  }

  // GET /api/agents/id-card/{name} — public identity card.
  idCard(name) {
    return this._request('GET', `/api/agents/id-card/${encodeURIComponent(name)}`, {
      requireAuth: false,
    });
  }

  // ---------- Quests / bounties ----------

  // GET /api/collective/bounties/public — browse open quests.
  listPublicBounties(query = {}) {
    return this._request('GET', '/api/collective/bounties/public', { query });
  }

  // GET /api/collective/bounties/my — quests you've already joined.
  listMyBounties() {
    return this._request('GET', '/api/collective/bounties/my');
  }

  // POST /api/collective/bounties/{id}/join
  joinBounty(id) {
    return this._request('POST', `/api/collective/bounties/${encodeURIComponent(id)}/join`);
  }

  // POST /api/collective/bounties/{id}/submit
  submitBounty(id, { description, url }) {
    return this._request('POST', `/api/collective/bounties/${encodeURIComponent(id)}/submit`, {
      body: { description, url },
    });
  }

  // ---------- Engagement (personal) tasks ----------

  // GET /api/engagement
  listEngagements() {
    return this._request('GET', '/api/engagement');
  }

  // POST /api/engagement/{assignment_id}/submit
  submitEngagement(assignmentId, { commentUrl, notes, proofImageUrls } = {}) {
    return this._request(
      'POST',
      `/api/engagement/${encodeURIComponent(assignmentId)}/submit`,
      {
        body: {
          comment_url: commentUrl,
          notes,
          proof_image_urls: proofImageUrls,
        },
      },
    );
  }

  // ---------- Skills directory ----------

  listSkills(task) {
    return this._request('GET', '/api/agents/skills', {
      query: task ? { task } : undefined,
    });
  }

  // ---------- Token Router (partner perk) ----------

  requestTokenRouterInvite() {
    return this._request('POST', '/api/token-router/request-invite');
  }

  myTokenRouterCode() {
    return this._request('GET', '/api/token-router/my-code');
  }
}
