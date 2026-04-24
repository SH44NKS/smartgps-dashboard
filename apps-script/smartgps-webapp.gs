// Cole este arquivo no Apps Script da sua planilha e publique como Web App.
// Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone with the link.

function doGet() {
  return sgJson_({ status: 1, message: 'SmartGPS Sheets endpoint ativo.' });
}

function doPost(e) {
  try {
    var payload = sgParseBody_(e);
    var action = payload.action || 'sync_dashboard';

    if (action === 'sync_dashboard') {
      return sgJson_(sgSyncDashboard_(payload));
    }

    if (action === 'add_record') {
      return sgJson_(sgAddRecord_(payload.type || 'Evento', payload.record || {}));
    }

    return sgJson_({ status: 0, message: 'Acao desconhecida: ' + action });
  } catch (err) {
    return sgJson_({ status: 0, message: err.message || String(err) });
  }
}

function sgParseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function sgJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sgSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (headers && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#111827').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sgReplace_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#111827').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function sgSyncDashboard_(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var devices = data.devices || [];
    var orders = data.orders || [];
    var stock = data.stock || [];
    var maintenance = data.maintenance || [];
    var now = new Date();

    sgWriteDashboard_(ss, {
      devices: devices.length,
      online: devices.filter(function (d) { return String(d.online || '').toLowerCase() === 'online'; }).length,
      maintenance: maintenance.length,
      orders: orders.length,
      stock: stock.length,
      clients: data.clients || 0,
      technicians: data.technicians || 0,
      updatedAt: now
    });

    sgReplace_(
      sgSheet_(ss, 'SmartGPS Dispositivos'),
      ['Nome', 'IMEI', 'Placa', 'Online', 'Velocidade', 'Latitude', 'Longitude', 'Endereco', 'Ultima Comunicacao', 'Manutencao'],
      devices.map(function (d) {
        return [d.name || '', d.imei || '', d.plate || '', d.online || '', d.speed || 0, d.lat || '', d.lng || '', d.address || '', d.time || '', d.maintenance || 'ok'];
      })
    );

    sgReplace_(
      sgSheet_(ss, 'SmartGPS Pedidos'),
      ['ID', 'Cliente', 'Placa', 'Servico', 'Status', 'Data'],
      orders.map(function (o) {
        return [o.id || '', o.client || '', o.plate || '', o.service || '', o.status || '', o.date || ''];
      })
    );

    sgReplace_(
      sgSheet_(ss, 'SmartGPS Estoque'),
      ['IMEI', 'Modelo', 'SIM', 'Status', 'Tecnico', 'Cliente', 'Placa', 'Obs', 'Criado em'],
      stock.map(function (s) {
        return [s.imei || '', s.model || '', s.sim || '', s.status || '', s.tecnico || '', s.cliente || '', s.placa || '', s.obs || '', s.createdAt || ''];
      })
    );

    sgReplace_(
      sgSheet_(ss, 'SmartGPS Manutencao'),
      ['IMEI'],
      maintenance.map(function (imei) { return [imei]; })
    );

    sgAddRecord_('Sincronizacao', { origem: 'dashboard', devices: devices.length, orders: orders.length, stock: stock.length, maintenance: maintenance.length });
    return { status: 1, message: 'Sincronizado com sucesso.', devices: devices.length, orders: orders.length, stock: stock.length };
  } finally {
    lock.releaseLock();
  }
}

function sgWriteDashboard_(ss, totals) {
  var sheet = sgSheet_(ss, 'SmartGPS Dashboard');
  sheet.clearContents();
  var rows = [
    ['SmartGPS Dashboard', ''],
    ['Atualizado em', totals.updatedAt],
    ['Dispositivos', totals.devices],
    ['Online', totals.online],
    ['Manutencao +45d', totals.maintenance],
    ['Pedidos', totals.orders],
    ['Estoque interno', totals.stock],
    ['Clientes', totals.clients],
    ['Tecnicos', totals.technicians]
  ];
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#00e5ff').setFontColor('#000000');
  sheet.getRange('A2:A9').setFontWeight('bold');
  sheet.autoResizeColumns(1, 2);
}

function sgAddRecord_(type, record) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = sgSheet_(ss, 'SmartGPS Eventos', ['Data', 'Tipo', 'JSON']);
  sheet.appendRow([new Date(), type, JSON.stringify(record || {})]);
  return { status: 1, message: 'Registro recebido.', type: type };
}
