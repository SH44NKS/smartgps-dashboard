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

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 0, message: 'Method not allowed' });
  }

  try {
    const { action, path, method = "GET", body = {}, fetchAll = false } = req.body || {};

    // Login
    const loginForm = new FormData();
    loginForm.append("email", process.env.SMARTGPS_EMAIL || "");
    loginForm.append("password", process.env.SMARTGPS_PASSWORD || "");

    const loginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      body: loginForm,
      headers: loginForm.getHeaders()
    });

    const loginData = await loginResponse.json();

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

    // Função para fazer requisição paginada
    async function fetchPage(page = 1) {
      const separator = path.includes("?") ? "&" : "?";
      let url = `${BASE_URL}${path}${separator}user_api_hash=${encodeURIComponent(apiHash)}`;
      
      // Adicionar página
      url += `&page=${page}`;
      
      // Parâmetros específicos
      if (path.includes('/api/get_devices_latest')) {
        url += '&time=0';
      }

      const options = {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      };

      const response = await fetch(url, options);
      const responseText = await response.text();
      
      try {
        return JSON.parse(responseText);
      } catch {
        return null;
      }
    }

    // Se for para buscar tudo (fetchAll)
    if (fetchAll && method === "GET") {
      let allItems = [];
      let currentPage = 1;
      let totalPages = 1;
      let totalItems = 0;
      
      try {
        // Primeira requisição para saber o total
        const firstPage = await fetchPage(1);
        
        if (!firstPage) {
          return res.status(500).json({ status: 0, message: "Erro ao buscar dados" });
        }

        // Extrair itens da primeira página
        let firstPageItems = [];
        if (firstPage.items && Array.isArray(firstPage.items)) {
          firstPageItems = firstPage.items;
        } else if (firstPage.data && Array.isArray(firstPage.data)) {
          firstPageItems = firstPage.data;
        } else if (Array.isArray(firstPage)) {
          firstPageItems = firstPage;
        }
        
        allItems = [...firstPageItems];
        
        // Verificar se tem paginação
        if (firstPage.last_page && firstPage.last_page > 1) {
          totalPages = firstPage.last_page;
          totalItems = firstPage.total || allItems.length;
          
          // Buscar páginas restantes (limitar a 50 páginas para não sobrecarregar)
          const maxPages = Math.min(totalPages, 50);
          
          for (let page = 2; page <= maxPages; page++) {
            const pageData = await fetchPage(page);
            
            if (pageData) {
              let pageItems = [];
              if (pageData.items && Array.isArray(pageData.items)) {
                pageItems = pageData.items;
              } else if (pageData.data && Array.isArray(pageData.data)) {
                pageItems = pageData.data;
              } else if (Array.isArray(pageData)) {
                pageItems = pageData;
              }
              
              allItems = [...allItems, ...pageItems];
            }
          }
        }
        
        return res.status(200).json({
          status: 1,
          items: allItems,
          total: allItems.length,
          pages_fetched: Math.min(totalPages, 50),
          total_pages: totalPages
        });
        
      } catch (error) {
        return res.status(500).json({ status: 0, message: error.message });
      }
    }

    // Comportamento normal (única página)
    const separator = path.includes("?") ? "&" : "?";
    let url = `${BASE_URL}${path}${separator}user_api_hash=${encodeURIComponent(apiHash)}`;
    
    if (path.includes('/api/get_devices_latest')) {
      url += '&time=0';
    }

    const options = {
      method,
      headers: {
        'Accept': 'application/json'
      }
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
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
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
