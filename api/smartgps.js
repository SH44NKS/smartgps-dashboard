const DEFAULT_BASE_URL = 'https://sp.tracker-net.app';
const MAX_PAGES = Number(process.env.SMARTGPS_MAX_PAGES || 500);

const ROUTE_ALIASES = {
  '/api/admin/clients': '/api/admin/get_clients',
  '/api/get_technicians': '/api/admin/technicians',
  '/api/technicians': '/api/admin/technicians',
  '/api/schedules': '/api/admin/technicians/appointments',
  '/api/get_device_history': '/api/get_history',
  '/api/schedule_order': '/schedule_order',
  'schedule_order': '/schedule_order',
};

const ALLOWED_PATHS = new Set([
  '/api/login',
  '/api/get_devices',
  '/api/get_devices_latest',
  '/api/get_devices_status',
  '/api/get_history',
  '/api/add_device',
  '/api/edit_device',
  '/api/destroy_device',
  '/api/admin/get_clients',
  '/api/admin/client',
  '/api/admin/technicians',
  '/api/admin/technicians/appointments',
  '/api/get_orders',
  '/api/add_order',
  '/api/edit_order',
  '/api/remove_order',
  '/schedule_order',
  '/api/admin/get_user_by_cpf_cnpj',
]);

const ALLOWED_PREFIXES = [
  '/api/admin/technicians/',
];

function send(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function normalizePath(path = '') {
  const [rawPathname, query = ''] = String(path).split('?');
  const pathname = ROUTE_ALIASES[rawPathname] || rawPathname;
  return { pathname, query };
}

function assertAllowedPath(pathname) {
  const allowedByPrefix = ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!ALLOWED_PATHS.has(pathname) && !allowedByPrefix) {
    const error = new Error(`Rota nao permitida: ${pathname}`);
    error.statusCode = 400;
    throw error;
  }
}

function buildUrl(path, apiHash) {
  const baseUrl = process.env.SMARTGPS_BASE_URL || DEFAULT_BASE_URL;
  const { pathname, query } = normalizePath(path);
  assertAllowedPath(pathname);

  const url = new URL(pathname, baseUrl);
  if (query) {
    const params = new URLSearchParams(query);
    params.forEach((value, key) => url.searchParams.set(key, value));
  }
  if (apiHash && !url.searchParams.has('user_api_hash')) {
    url.searchParams.set('user_api_hash', apiHash);
  }
  if (pathname === '/api/get_devices_latest' && !url.searchParams.has('time')) {
    url.searchParams.set('time', '0');
  }
  return url;
}

function toFormData(body = {}) {
  const form = new FormData();
  Object.entries(body || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    form.append(key, String(value));
  });
  return form;
}

async function parseSmartGpsResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { status: 0, message: 'Resposta nao JSON da SmartGPS', raw: text };
  }
}

function extractItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return flattenGroups(data);
  if (Array.isArray(data.items?.data)) return flattenGroups(data.items.data);
  if (Array.isArray(data.data?.data)) return flattenGroups(data.data.data);
  if (Array.isArray(data.items)) return flattenGroups(data.items);
  if (Array.isArray(data.data)) return flattenGroups(data.data);
  if (Array.isArray(data.devices)) return flattenGroups(data.devices);
  if (Array.isArray(data.clients)) return flattenGroups(data.clients);
  if (Array.isArray(data.orders)) return flattenGroups(data.orders);
  if (Array.isArray(data.technicians)) return flattenGroups(data.technicians);
  return flattenGroups(findLargestArray_(data));
}

function flattenGroups(items) {
  return items.flatMap((item) => Array.isArray(item?.items) ? item.items : item);
}

function getLastPage(data) {
  return Number(findFirstKey_(data, 'last_page') || data?.lastPage || data?.items?.last_page || data?.data?.last_page || 1);
}

function findLargestArray_(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value;
  return Object.values(value).reduce((best, child) => {
    const found = findLargestArray_(child);
    return found.length > best.length ? found : best;
  }, []);
}

function findFirstKey_(value, key) {
  if (!value || typeof value !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findFirstKey_(child, key);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

async function login() {
  const apiHash = process.env.SMARTGPS_API_HASH || process.env.SMARTGPS_USER_API_HASH;
  if (apiHash) {
    return { status: 1, user_api_hash: apiHash, source: 'env' };
  }

  const email = process.env.SMARTGPS_EMAIL || process.env.SMARTGPS_LOGIN;
  const password = process.env.SMARTGPS_PASSWORD;
  if (!email || !password) {
    return {
      status: 0,
      message: 'Configure SMARTGPS_API_HASH ou SMARTGPS_EMAIL/SMARTGPS_PASSWORD no Vercel.',
    };
  }

  const response = await fetch(buildUrl('/api/login'), {
    method: 'POST',
    body: toFormData({ email, password }),
  });
  const data = await parseSmartGpsResponse(response);

  if (!response.ok) {
    return { status: 0, message: 'Falha no login SmartGPS', upstreamStatus: response.status, data };
  }

  return data;
}

async function getApiHash() {
  const apiHash = process.env.SMARTGPS_API_HASH || process.env.SMARTGPS_USER_API_HASH;
  if (apiHash) return apiHash;
  const auth = await login();
  return auth.user_api_hash || auth.api_hash || auth.hash || '';
}

async function fetchSmartGps(path, method, body, apiHash, contentType) {
  const url = buildUrl(path, apiHash);
  const options = { method };

  if (!['GET', 'HEAD'].includes(method)) {
    if (contentType === 'json' || url.pathname === '/schedule_order') {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body || {});
    } else {
      options.body = toFormData(body || {});
    }
  }

  const response = await fetch(url, options);
  const data = await parseSmartGpsResponse(response);
  return { response, data };
}

async function fetchAllPages(path, apiHash) {
  const firstUrl = buildUrl(path, apiHash);
  firstUrl.searchParams.set('page', firstUrl.searchParams.get('page') || '1');
  if (!firstUrl.searchParams.has('length') && !firstUrl.searchParams.has('limit') && !firstUrl.searchParams.has('per_page')) {
    firstUrl.searchParams.set('length', '1000');
  }

  const firstResponse = await fetch(firstUrl);
  const firstData = await parseSmartGpsResponse(firstResponse);
  if (!firstResponse.ok) {
    return { status: 0, message: 'Erro ao buscar dados', upstreamStatus: firstResponse.status, data: firstData };
  }

  let allItems = extractItems(firstData);
  const totalPages = getLastPage(firstData);
  const maxPages = Math.min(totalPages, MAX_PAGES);

  const batchSize = 15;
  for (let batchStart = 2; batchStart <= maxPages; batchStart += batchSize) {
    const requests = [];
    for (let page = batchStart; page <= Math.min(batchStart + batchSize - 1, maxPages); page += 1) {
      const pageUrl = buildUrl(path, apiHash);
      pageUrl.searchParams.set('page', String(page));
      if (!pageUrl.searchParams.has('length') && !pageUrl.searchParams.has('limit') && !pageUrl.searchParams.has('per_page')) {
        pageUrl.searchParams.set('length', '1000');
      }
      requests.push(fetch(pageUrl).then(parseSmartGpsResponse).catch(() => null));
    }

    const pages = await Promise.all(requests);
    pages.forEach((pageData) => {
      allItems = allItems.concat(extractItems(pageData));
    });
  }

  const now = Date.now();
  const items = allItems.map((item) => {
    const lastUpdate = item.time || item.server_time || item.server_time_latest || item.time_latest || item.updated_at;
    if (!lastUpdate) return item;
    const parsed = new Date(String(lastUpdate).replace(' ', 'T')).getTime();
    if (!Number.isFinite(parsed)) return item;
    const days = Math.floor((now - parsed) / 86400000);
    return days > 45 ? { ...item, maintenance_status: 'manutencao', days_without_communication: days } : item;
  });

  return {
    status: 1,
    items,
    total: items.length,
    pages_fetched: maxPages,
    total_pages: totalPages,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return send(res, 405, { status: 0, message: 'Use POST em /api/smartgps.' });

  try {
    const { action, path, method = 'GET', body = {}, fetchAll = false, contentType } = req.body || {};

    if (action === 'login') {
      return send(res, 200, await login());
    }

    if (action === 'sync_sheet') {
      const { sheetUrl, data } = body;
      if (!sheetUrl) return send(res, 400, { status: 0, message: 'sheetUrl nao informado.' });
      const sheetResponse = await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
      const sheetData = await parseSmartGpsResponse(sheetResponse);
      return send(res, sheetResponse.ok ? 200 : sheetResponse.status, sheetData);
    }

    if (!path) return send(res, 400, { status: 0, message: 'Path nao informado.' });

    const apiHash = await getApiHash();
    if (!apiHash) return send(res, 401, { status: 0, message: 'Nao foi possivel obter user_api_hash.' });

    if (fetchAll && String(method).toUpperCase() === 'GET') {
      return send(res, 200, await fetchAllPages(path, apiHash));
    }

    const { response, data } = await fetchSmartGps(path, String(method).toUpperCase(), body, apiHash, contentType);
    return send(res, response.ok ? 200 : response.status, data);
  } catch (error) {
    return send(res, error.statusCode || 500, {
      status: 0,
      message: error.message || 'Erro interno no proxy SmartGPS.',
    });
  }
}
