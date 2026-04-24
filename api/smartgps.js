import fetch from "node-fetch";
import FormData from "form-data";

const BASE_URL = "https://sp.tracker-net.app";

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { action, path, method = "GET", body = {} } = req.body || {};

    // Fazer login e obter hash
    console.log("Fazendo login na SmartGPS...");
    
    const loginForm = new FormData();
    loginForm.append("email", process.env.SMARTGPS_EMAIL);
    loginForm.append("password", process.env.SMARTGPS_PASSWORD);

    const loginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      body: loginForm,
      headers: {
        ...loginForm.getHeaders()
      }
    });

    const loginData = await loginResponse.json();
    console.log("Resposta do login:", loginData);

    if (!loginData.user_api_hash && !loginData.status) {
      return res.status(401).json({
        status: 0,
        message: "Erro ao fazer login na SmartGPS",
        debug: loginData
      });
    }

    const apiHash = loginData.user_api_hash || process.env.SMARTGPS_API_HASH;

    // Se for apenas ação de login
    if (action === "login") {
      return res.status(200).json({
        status: 1,
        message: "Login OK",
        user_api_hash: apiHash
      });
    }

    // Para outras requisições
    if (!path) {
      return res.status(400).json({
        status: 0,
        message: "Informe o path da API"
      });
    }

    // Construir URL com hash
    const separator = path.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${path}${separator}user_api_hash=${encodeURIComponent(apiHash)}`;
    
    console.log("Chamando API:", url);
    console.log("Método:", method);
    console.log("Body:", body);

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

    const response = await fetch(url, options);
    const responseText = await response.text();
    
    console.log("Status da resposta:", response.status);
    console.log("Resposta:", responseText.substring(0, 500));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { 
        raw: responseText,
        status: 0,
        message: "Resposta não é JSON válido"
      };
    }

    return res.status(response.status).json(data);

  } catch (error) {
    console.error("Erro detalhado:", error);
    return res.status(500).json({
      status: 0,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
