// api/smartgps.js
import fetch from "node-fetch";
import FormData from "form-data";

const BASE_URL = "https://sp.tracker-net.app";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apenas aceitar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 0, message: 'Method not allowed' });
  }

  try {
    const { action, path, method = "GET", body = {} } = req.body || {};

    console.log("Action:", action);
    console.log("Path:", path);
    console.log("Method:", method);

    // Fazer login
    const loginForm = new FormData();
    loginForm.append("email", process.env.SMARTGPS_EMAIL || "iuri@escudoclube.com.br");
    loginForm.append("password", process.env.SMARTGPS_PASSWORD || "gestora@2024");

    console.log("Fazendo login...");

    const loginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      body: loginForm,
      headers: {
        ...loginForm.getHeaders()
      }
    });

    const loginData = await loginResponse.json();
    console.log("Login response:", JSON.stringify(loginData));

    if (!loginData.user_api_hash) {
      return res.status(401).json({
        status: 0,
        message: "Falha na autenticação",
        login_response: loginData
      });
    }

    const apiHash = loginData.user_api_hash;

    if (action === "login") {
      return res.status(200).json({
        status: 1,
        message: "Login realizado com sucesso",
        user_api_hash: apiHash
      });
    }

    if (!path) {
      return res.status(400).json({
        status: 0,
        message: "Path não informado"
      });
    }

    // Construir URL
    const separator = path.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${path}${separator}user_api_hash=${encodeURIComponent(apiHash)}`;
    
    console.log("URL final:", url);

    const options = {
      method,
      headers: {}
    };

    if (method !== "GET" && body && Object.keys(body).length > 0) {
      const form = new FormData();
      
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          form.append(key, String(value));
        }
      });

      options.body = form;
      options.headers = {
        ...options.headers,
        ...form.getHeaders()
      };
    }

    console.log("Enviando requisição...");
    const response = await fetch(url, options);
    const responseText = await response.text();
    
    console.log("Status:", response.status);
    console.log("Resposta:", responseText.substring(0, 300));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { 
        raw: responseText,
        status: 0,
        message: "Resposta não é JSON"
      };
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error("Erro:", error);
    return res.status(500).json({
      status: 0,
      message: error.message
    });
  }
}
