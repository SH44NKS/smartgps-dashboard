import fetch from "node-fetch";
import FormData from "form-data";

const BASE_URL = "https://sp.tracker-net.app";

async function readBody(req) {
  if (req.body) return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function getApiHash() {
  if (process.env.SMARTGPS_API_HASH) return process.env.SMARTGPS_API_HASH;

  const email = process.env.SMARTGPS_EMAIL;
  const password = process.env.SMARTGPS_PASSWORD;

  if (!email || !password) {
    throw new Error("Configure SMARTGPS_EMAIL e SMARTGPS_PASSWORD nas variáveis de ambiente da Vercel.");
  }

  const loginForm = new FormData();
  loginForm.append("email", email);
  loginForm.append("password", password);

  const loginResponse = await fetch(`${BASE_URL}/api/login`, { method: "POST", body: loginForm });
  const text = await loginResponse.text();
  let loginData;
  try { loginData = JSON.parse(text); } catch { loginData = { raw: text }; }

  if (!loginResponse.ok || !loginData.user_api_hash) {
    throw new Error("Erro ao fazer login na SmartGPS: " + JSON.stringify(loginData));
  }

  return loginData.user_api_hash;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ status: 0, message: "Use POST." });

  try {
    const input = await readBody(req);
    const { action, path, method = "GET", body = {} } = input || {};
    const apiHash = await getApiHash();

    if (action === "login") {
      return res.status(200).json({ status: 1, message: "Backend conectado à SmartGPS." });
    }

    if (!path || !path.startsWith("/api/")) {
      return res.status(400).json({ status: 0, message: "Informe um path válido começando com /api/." });
    }

    const separator = path.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${path}${separator}user_api_hash=${encodeURIComponent(apiHash)}`;
    const options = { method };

    if (method !== "GET") {
      const form = new FormData();
      Object.entries(body || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") form.append(key, value);
      });
      options.body = form;
    }

    const response = await fetch(url, options);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ status: 0, message: error.message });
  }
}
