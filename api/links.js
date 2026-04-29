import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_REPO = 'SH44NKS/smartgps-dashboard';
const DEFAULT_BRANCH = 'main';
const DEFAULT_FILE = 'data/links.json';

function send(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function config() {
  return {
    token: process.env.LINKS_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '',
    repo: process.env.LINKS_GITHUB_REPO || process.env.GITHUB_REPO || DEFAULT_REPO,
    branch: process.env.LINKS_GITHUB_BRANCH || process.env.GITHUB_BRANCH || DEFAULT_BRANCH,
    filePath: process.env.LINKS_FILE_PATH || DEFAULT_FILE,
    adminKey: process.env.LINKS_ADMIN_KEY || '',
  };
}

function normalizeLink(link = {}) {
  const title = String(link.title || link.nome || link.name || '').trim();
  let url = String(link.url || link.link || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return {
    id: link.id || Date.now(),
    title,
    url,
    category: String(link.category || link.categoria || '').trim(),
    obs: String(link.obs || link.observacao || link.observacoes || '').trim(),
    createdAt: link.createdAt || new Date().toISOString(),
  };
}

function mergeLinks(existing = [], incoming = []) {
  const map = new Map();
  [...existing, ...incoming].map(normalizeLink).filter((l) => l.title && l.url).forEach((link) => {
    const key = `${link.url}|${link.title}`.toLowerCase();
    map.set(key, { ...(map.get(key) || {}), ...link });
  });
  return [...map.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function readBundledLinks(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    return JSON.parse(await fs.readFile(fullPath, 'utf8'));
  } catch {
    return [];
  }
}

async function githubRequest(url, options = {}) {
  const { token } = config();
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function getGithubFile() {
  const { repo, branch, filePath } = config();
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`;
  const { response, data } = await githubRequest(url);
  if (!response.ok) return { links: await readBundledLinks(filePath), sha: null, source: 'bundle' };
  const content = Buffer.from(data.content || '', 'base64').toString('utf8');
  return { links: JSON.parse(content || '[]'), sha: data.sha, source: 'github' };
}

async function writeGithubFile(links, sha) {
  const { repo, branch, filePath } = config();
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
  const content = Buffer.from(JSON.stringify(links, null, 2) + '\n', 'utf8').toString('base64');
  const body = {
    message: 'Update saved dashboard links',
    branch,
    content,
    ...(sha ? { sha } : {}),
  };
  const { response, data } = await githubRequest(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return { status: 0, message: data.message || 'Erro ao salvar links no GitHub', data };
  }
  return { status: 1, message: 'Links salvos no GitHub.', commit: data.commit?.sha };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Links-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const file = await getGithubFile();
      return send(res, 200, { status: 1, links: mergeLinks(file.links), source: file.source });
    }

    if (req.method !== 'POST') return send(res, 405, { status: 0, message: 'Use GET ou POST.' });

    const { adminKey } = config();
    if (adminKey && req.headers['x-links-key'] !== adminKey) {
      return send(res, 401, { status: 0, message: 'Chave dos links invalida.' });
    }

    const { token } = config();
    if (!token) return send(res, 500, { status: 0, message: 'Configure LINKS_GITHUB_TOKEN no Vercel para salvar no GitHub.' });

    const body = req.body || {};
    const incoming = Array.isArray(body.links) ? body.links : [body.link || body];
    const file = await getGithubFile();
    const links = mergeLinks(file.links, incoming);
    const saved = await writeGithubFile(links, file.sha);
    return send(res, saved.status ? 200 : 500, { ...saved, links, total: links.length });
  } catch (error) {
    return send(res, 500, { status: 0, message: error.message || 'Erro nos links.' });
  }
}
