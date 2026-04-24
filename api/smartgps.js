import fetch from "node-fetch";
import FormData from "form-data";

const BASE_URL = "https://sp.tracker-net.app";

export default async function handler(req, res) {
  try {
    const { action, path, method = "GET", body = {} } = req.body || {};

    let apiHash;

    const loginForm = new FormData();
    loginForm.append("email", process.env.SMARTGPS_EMAIL);
    loginForm.append("password", process.env.SMARTGPS_PASSWORD);

    const loginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      body: loginForm
    });

    const loginData = await loginResponse.json();

    if (!loginData.user_api_hash) {
      return res.status(401).json({
        status: 0,
        message: "Erro ao fazer login na SmartGPS",
        loginData
      });
    }

    apiHash = loginData.user_api_hash;

    if (action === "login") {
      return res.status(200).json({
        status: 1,
        message: "Login OK",
        user_api_hash: apiHash
      });
    }

    if (!path) {
      return res.status(400).json({
        status: 0,
        message: "Informe o path da API"
      });
    }

    const separator = path.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${path}${separator}user_api_hash=${encodeURIComponent(apiHash)}`;

    const options = {
      method
    };

    if (method !== "GET") {
      const form = new FormData();

      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          form.append(key, value);
        }
      });

      options.body = form;
    }

    const response = await fetch(url, options);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({
      status: 0,
      message: error.message
    });
  }
}
