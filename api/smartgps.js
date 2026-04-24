// api/smartgps.js — Vercel Serverless Function
// Proxy seguro para a API SmartGPS (sp.tracker-net.app)
// Nunca expõe credenciais no navegador

const BASE_URL = 'https://sp.tracker-net.app';
const API_EMAIL = process.env.SMARTGPS_EMAIL || 'iuri@escudoclube.com.br';
const API_PASSWORD = process.env.SMARTGPS_PASSWORD || 'gestora@2024';
const API_HASH_FIXED = process.env.SMARTGPS_HASH || '$2y$10$Dj9J.uuRlDGFslSzD7dze.Ou6W88DjuA/Zlg6R7Le5yJG0WyrwdKS';

// Cache do token em memória (dura enquanto a instância viver)
let cachedHash = API_HASH_FIXED;
let hashExpiry = Date.now() + 24 * 60 * 60 * 1000;

async function getApiHash() {
  if (cachedHash && Date.now() < hashExpiry) return cachedHash;
  try {
    const form = new URLSearchParams({ email: API_EMAIL, password: API_PASSWORD });
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await res.json();
    if (data.user_api_hash) {
      cachedHash = data.user_api_hash;
      hashExpiry = Date.now() + 23 * 60 * 60 * 1000;
      return cachedHash;
    }
  } catch (e) {
    console.error('Login falhou:', e);
  }
  return API_HASH_FIXED;
}

async function proxyRequest(path, method, body) {
  const hash = await getApiHash();
  const separator = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${separator}user_api_hash=${encodeURIComponent(hash)}`;

  const opts = {
    method: method || 'GET',
    headers: {},
  };

  if (body && method !== 'GET' && method !== 'DELETE') {
    const form = new URLSearchParams();
    Object.entries(body).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
    });
    opts.body = form.toString();
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: { raw: text } };
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let payload = {};
    if (req.method === 'POST') {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    }

    // ─── Ação especial: login (retorna hash para o cliente saber que está OK) ───
    if (payload.action === 'login') {
      const hash = await getApiHash();
      return res.status(200).json({ status: 1, user_api_hash: hash, message: 'Autenticado' });
    }

    // ─── Busca múltipla (multi-search) ───
    if (payload.action === 'multi_search') {
      const { query } = payload;
      if (!query) return res.status(400).json({ status: 0, message: 'query obrigatório' });

      const [devRes, clientRes, orderRes] = await Promise.allSettled([
        proxyRequest('/api/get_devices_status', 'GET'),
        proxyRequest('/api/admin/clients', 'GET'),
        proxyRequest('/api/get_orders', 'GET'),
      ]);

      const q = query.toLowerCase().trim();
      const normalize = (r) => {
        if (r.status !== 'fulfilled') return [];
        const d = r.value.data;
        if (Array.isArray(d)) return d;
        if (d?.data && Array.isArray(d.data)) return d.data;
        if (d?.items?.data && Array.isArray(d.items.data)) return d.items.data;
        const arrays = Object.values(d || {}).filter(Array.isArray);
        return arrays[0] || [];
      };

      const devices = normalize(devRes).filter(d =>
        JSON.stringify(d).toLowerCase().includes(q)
      );
      const clients = normalize(clientRes).filter(c =>
        JSON.stringify(c).toLowerCase().includes(q)
      );
      const orders = normalize(orderRes).filter(o =>
        JSON.stringify(o).toLowerCase().includes(q)
      );

      return res.status(200).json({ status: 1, devices, clients, orders, query });
    }

    // ─── Busca por IMEI ───
    if (payload.action === 'find_by_imei') {
      const r = await proxyRequest(`/api/find_device_by_imei?imei=${encodeURIComponent(payload.imei)}`, 'GET');
      return res.status(200).json(r.data);
    }

    // ─── Busca por ID ───
    if (payload.action === 'find_by_id') {
      const r = await proxyRequest(`/api/find_device?device_id=${encodeURIComponent(payload.device_id)}`, 'GET');
      return res.status(200).json(r.data);
    }

    // ─── Busca por CPF/CNPJ ───
    if (payload.action === 'find_by_cpf') {
      const r = await proxyRequest(`/api/admin/client/cpf?cpf=${encodeURIComponent(payload.cpf)}`, 'GET');
      return res.status(200).json(r.data);
    }

    // ─── Habilitar/Desabilitar cliente ───
    if (payload.action === 'toggle_client') {
      const r = await proxyRequest(`/api/admin/client/toggle?cpf=${encodeURIComponent(payload.cpf)}`, 'GET');
      return res.status(200).json(r.data);
    }

    // ─── Agendar pedido ───
    if (payload.action === 'schedule_order') {
      const r = await proxyRequest('/api/schedule_order', 'POST', payload.body);
      return res.status(200).json(r.data);
    }

    // ─── Update Manutenção ───
    if (payload.action === 'update_maintenance') {
      const r = await proxyRequest('/api/update_maintenance', 'POST', payload.body);
      return res.status(200).json(r.data);
    }

    // ─── Listar grupos de sensores ───
    if (payload.action === 'sensor_groups') {
      const r = await proxyRequest('/api/sensor_groups', 'GET');
      return res.status(200).json(r.data);
    }

    // ─── Histórico do dispositivo ───
    if (payload.action === 'device_history') {
      let path = `/api/get_gps_history?device_id=${encodeURIComponent(payload.device_id)}`;
      if (payload.date_from) path += `&date_from=${encodeURIComponent(payload.date_from)}`;
      if (payload.date_to) path += `&date_to=${encodeURIComponent(payload.date_to)}`;
      const r = await proxyRequest(path, 'GET');
      return res.status(200).json(r.data);
    }

    // ─── Grupos de veículos ───
    if (payload.action === 'vehicle_groups') {
      const r = await proxyRequest('/api/device_groups', 'GET');
      return res.status(200).json(r.data);
    }

    // ─── Técnicos + agendamentos ───
    if (payload.action === 'technicians_full') {
      const [techRes, schedRes] = await Promise.allSettled([
        proxyRequest('/api/technicians', 'GET'),
        proxyRequest('/api/schedules', 'GET'),
      ]);
      return res.status(200).json({
        status: 1,
        technicians: techRes.status === 'fulfilled' ? techRes.value.data : [],
        schedules: schedRes.status === 'fulfilled' ? schedRes.value.data : [],
      });
    }

    // ─── Dashboard completo (uma só chamada) ───
    if (payload.action === 'dashboard') {
      const [devRes, statusRes, clientRes, orderRes, techRes, schedRes] = await Promise.allSettled([
        proxyRequest('/api/get_devices', 'GET'),
        proxyRequest('/api/get_devices_status', 'GET'),
        proxyRequest('/api/admin/clients', 'GET'),
        proxyRequest('/api/get_orders', 'GET'),
        proxyRequest('/api/technicians', 'GET'),
        proxyRequest('/api/schedules', 'GET'),
      ]);
      const safeData = (r) => r.status === 'fulfilled' ? r.value.data : null;
      return res.status(200).json({
        status: 1,
        devices: safeData(devRes),
        devices_status: safeData(statusRes),
        clients: safeData(clientRes),
        orders: safeData(orderRes),
        technicians: safeData(techRes),
        schedules: safeData(schedRes),
      });
    }

    // ─── Proxy genérico ───
    const { path, method, body } = payload;
    if (!path) return res.status(400).json({ status: 0, message: 'path obrigatório' });

    const result = await proxyRequest(path, method || 'GET', body);
    return res.status(result.status || 200).json(result.data);

  } catch (err) {
    console.error('Erro handler:', err);
    return res.status(500).json({ status: 0, message: err.message });
  }
}
