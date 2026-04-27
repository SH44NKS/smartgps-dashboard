const DEFAULT_BASE_URL = 'http://ap3.stc.srv.br/integration/prod/';
const MAX_PAGES = Number(process.env.MOVIT_MAX_PAGES || 500);
const PAGE_BATCH_SIZE = Number(process.env.MOVIT_PAGE_BATCH_SIZE || 3);
const PAGE_BATCH_DELAY_MS = Number(process.env.MOVIT_PAGE_BATCH_DELAY_MS || 350);

const ACTIONS = {
  list_clients: 'ws/client/list',
  list_cities: 'ws/client/getcities',
  add_client: 'ws/client/add',
  update_client: 'ws/client/update',
  remove_client: 'ws/client/remove',
  update_login_features: 'ws/client/updateLgwFunc',
  add_contact: 'ws/client/addcontact',
  update_contact: 'ws/client/updatecontact',
  remove_contact: 'ws/client/removecontact',
  list_vehicles: 'ws/vehicle/list',
  list_vehicle_types: 'ws/vehicle/listtype',
  list_brands: 'ws/vehicle/listbrand',
  add_brand: 'ws/vehicle/addbrand',
  remove_brand: 'ws/vehicle/removebrand',
  list_models: 'ws/vehicle/listmodel',
  add_model: 'ws/vehicle/addmodel',
  remove_model: 'ws/vehicle/removemodel',
  add_vehicle: 'ws/vehicle/add',
  update_vehicle: 'ws/vehicle/update',
  remove_vehicle: 'ws/vehicle/remove',
  change_vehicle_owner: 'ws/vehicle/changeonwer',
  list_devices: 'ws/device/list',
  list_device_managers: 'ws/device/listmanager',
  add_device: 'ws/device/add',
  associate_device: 'ws/device/associate',
  list_casualty_devices: 'ws/device/listcasualty',
  list_manufactures: 'ws/manufacture/list',
  get_positions_500: 'ws/admin/getVehiclePositionsByLimit500',
};

function send(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey() {
  return process.env.MOVIT_API_KEY || process.env.STC_API_KEY || '';
}

function buildUrl(path) {
  const normalized = String(path || '').replace(/^\/+/, '');
  if (!Object.values(ACTIONS).includes(normalized)) {
    const error = new Error(`Rota Movit nao permitida: ${normalized}`);
    error.statusCode = 400;
    throw error;
  }
  return new URL(normalized, process.env.MOVIT_BASE_URL || DEFAULT_BASE_URL);
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { success: false, error: 1, msg: 'Resposta nao JSON da Movit', raw: text };
  }
}

function actionToPath(action, path) {
  if (path) return String(path).replace(/^\/+/, '');
  return ACTIONS[action] || '';
}

function withKey(body = {}) {
  const key = getApiKey();
  if (!key) {
    const error = new Error('Configure MOVIT_API_KEY no Vercel.');
    error.statusCode = 401;
    throw error;
  }
  return { key, ...(body || {}) };
}

async function fetchMovit(path, body = {}) {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withKey(body)),
  });
  const data = await parseResponse(response);
  return { response, data };
}

function extractItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data?.data)) return data.data.data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function getLastPage(data) {
  return Number(data?.data?.last_page || data?.last_page || 1);
}

async function fetchAllPages(path, body = {}) {
  const firstBody = { ...body, page: body.page || 1 };
  const { response: firstResponse, data: firstData } = await fetchMovit(path, firstBody);
  if (!firstResponse.ok || firstData.success === false) {
    return {
      status: 0,
      success: false,
      message: firstData.msg || 'Erro ao buscar dados Movit',
      upstreamStatus: firstResponse.status,
      data: firstData,
    };
  }

  let items = extractItems(firstData);
  const totalPages = getLastPage(firstData);
  const maxPages = Math.min(totalPages, MAX_PAGES);

  for (let batchStart = 2; batchStart <= maxPages; batchStart += PAGE_BATCH_SIZE) {
    const requests = [];
    for (let page = batchStart; page <= Math.min(batchStart + PAGE_BATCH_SIZE - 1, maxPages); page += 1) {
      requests.push(fetchMovit(path, { ...body, page }).then((result) => result.data).catch(() => null));
    }
    const pages = await Promise.all(requests);
    pages.forEach((pageData) => {
      items = items.concat(extractItems(pageData));
    });
    if (batchStart + PAGE_BATCH_SIZE <= maxPages) await sleep(PAGE_BATCH_DELAY_MS);
  }

  return {
    status: 1,
    success: true,
    items,
    total: items.length,
    pages_fetched: maxPages,
    total_pages: totalPages,
    raw: firstData.data || firstData,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return send(res, 405, { status: 0, message: 'Use POST em /api/movit.' });

  try {
    const { action, path, body = {}, fetchAll = false } = req.body || {};
    const targetPath = actionToPath(action, path);
    if (!targetPath) return send(res, 400, { status: 0, message: 'Acao Movit nao informada.' });

    if (fetchAll) {
      return send(res, 200, await fetchAllPages(targetPath, body));
    }

    const { response, data } = await fetchMovit(targetPath, body);
    return send(res, response.ok ? 200 : response.status, {
      status: data.success === false ? 0 : 1,
      ...data,
    });
  } catch (error) {
    return send(res, error.statusCode || 500, {
      status: 0,
      success: false,
      message: error.message || 'Erro interno no proxy Movit.',
    });
  }
}
