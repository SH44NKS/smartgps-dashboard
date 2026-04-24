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

## Integracao Com Google Sheets

O arquivo `apps-script/smartgps-webapp.gs` deve ser copiado para o Apps Script da planilha.

Passos:

1. Abra a planilha.
2. Va em `Extensoes > Apps Script`.
3. Cole o conteudo de `apps-script/smartgps-webapp.gs` no projeto da planilha.
4. Clique em `Deploy > New deployment > Web app`.
5. Configure `Execute as: Me` e `Who has access: Anyone with the link`.
6. Copie a URL terminada em `/exec`.
7. No painel SmartGPS, clique em `Sincronizar Planilha` e cole essa URL.

O painel salva a URL no navegador e passa a enviar:

- dashboard consolidado;
- dispositivos;
- pedidos;
- estoque;
- lista de manutencao +45 dias;
- eventos criados pelo painel.

Planilha usada no projeto:
https://docs.google.com/spreadsheets/d/1Hj37s6n3XTOyq3SqAoFTMQOrarcM18noC_QQoaTdn_U/edit
