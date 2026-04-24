# SmartGPS Dashboard

Painel operacional SmartGPS hospedado na Vercel.

## Variaveis De Ambiente

Configure em `Project Settings > Environment Variables` na Vercel:

```txt
SMARTGPS_BASE_URL=https://sp.tracker-net.app
SMARTGPS_API_HASH=seu_hash_novo
```

Tambem funciona com login dinamico:

```txt
SMARTGPS_EMAIL=seu_email
SMARTGPS_PASSWORD=sua_senha
```

Use preferencialmente um hash novo. Nunca coloque hash, login ou senha no `index.html`, no README ou em commits.

## O Que O Painel Faz

- Busca dispositivos e status em multiplas paginas.
- Corrige respostas agrupadas da SmartGPS, como `items.data[].items[]`.
- Consulta clientes, pedidos e tecnicos.
- Mantem estoque interno no navegador para movimentar rastreadores entre estoque, tecnico, instalado, removido e defeito.
- Centraliza a comunicacao com a SmartGPS em `/api/smartgps`, sem expor segredos no browser.
