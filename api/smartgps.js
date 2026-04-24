import fetch from "node-fetch";
import FormData from "form-data";

const BASE_URL = "https://sp.tracker-net.app";
const MAX_PAGES = 500; // Aumentado para 500 páginas (500 x 20 = 10.000 itens)

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
      
      url += `&page=${page}`;
      
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

    // Se for para buscar tudo (fetchAll) - OTIMIZADO PARA GRANDES VOLUMES
    if (fetchAll && method === "GET") {
      let allItems = [];
      let currentPage = 1;
      let totalPages = 1;
      let perPage = 20;
      
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
          perPage = firstPage.per_page || 20;
          
          // Buscar páginas restantes (agora até 500 páginas)
          const maxPages = Math.min(totalPages, MAX_PAGES);
          
          // Buscar em lotes de 5 páginas simultâneas para acelerar
          for (let batchStart = 2; batchStart <= maxPages; batchStart += 5) {
            const batchEnd = Math.min(batchStart + 4, maxPages);
            const promises = [];
            
            for (let page = batchStart; page <= batchEnd; page++) {
              promises.push(fetchPage(page));
            }
            
            const results = await Promise.all(promises);
            
            for (const pageData of results) {
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
        }
        
        // Marcar dispositivos com mais de 45 dias sem comunicação como "Manutenção"
        const now = new Date();
        const itemsComManutencao = allItems.map(item => {
          const lastUpdate = item.time || item.server_time || item.updated_at;
          if (lastUpdate) {
            const lastDate = new Date(lastUpdate.replace(' ', 'T'));
            const daysDiff = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
            if (daysDiff > 45) {
              return { ...item, maintenance_status: 'manutencao', days_without_communication: daysDiff };
            }
          }
          return item;
        });
        
        return res.status(200).json({
          status: 1,
          items: itemsComManutencao,
          total: itemsComManutencao.length,
          pages_fetched: Math.min(totalPages, MAX_PAGES),
          total_pages: totalPages,
          per_page: perPage
        });
        
      } catch (error) {
        return res.status(500).json({ status: 0, message: error.message });
      }
    }

    // Dentro do handler, adicione esta ação:
if (action === "sync_sheet") {
  const { sheetUrl, data } = body;
  // Aqui você pode fazer uma requisição HTTP para o Google Apps Script
  // Exemplo:
  const syncResponse = await fetch(sheetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.status(200).json({ status: 1, message: "Sincronizado com planilha" });
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
