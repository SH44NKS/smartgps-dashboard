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

    if (action === 'get_dashboard') {
      return sgJson_(sgGetDashboard_());
    }

    if (action === 'get_operational_records') {
      return sgJson_(sgGetOperationalRecords_());
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
  var routed = sgRouteOperationalRecord_(ss, type, record || {});
  if (routed) return routed;

  var sheet = sgSheet_(ss, 'SmartGPS Eventos', ['Data', 'Tipo', 'JSON']);
  sheet.appendRow([new Date(), type, JSON.stringify(record || {})]);
  return { status: 1, message: 'Registro recebido.', type: type };
}

function sgRouteOperationalRecord_(ss, type, record) {
  var normalized = String(type || '').toLowerCase();
  if (normalized === 'cadastro') return sgAppendCadastroRetirada_(ss, 'Cadastro', record);
  if (normalized === 'retirada') return sgAppendCadastroRetirada_(ss, 'Retirada', record);
  if (normalized === 'agendamento') return sgAppendAgendamento_(ss, record);
  if (normalized === 'cancelamento') return sgAppendCancelamento_(ss, record);
  if (normalized === 'suspensao' || normalized === 'suspensão 120 dias') return sgAppendSuspensao_(ss, record);
  if (normalized === 'os' || normalized === 'ordem de serviço' || normalized === 'ordem de servico') return sgAppendOS_(ss, record);
  if (normalized === 'task' || normalized === 'tarefa') return sgAppendTask_(ss, record);
  return null;
}

function sgGetDashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SmartGPS Dashboard') || ss.getSheetByName('Dashboard');
  if (!sheet) return { status: 1, rows: [] };
  var lastRow = Math.min(sheet.getLastRow(), 30);
  var lastCol = Math.min(sheet.getLastColumn(), 5);
  var rows = lastRow ? sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues() : [];
  return { status: 1, rows: rows };
}

function sgGetOperationalRecords_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configs = [
    { type: 'Cadastro', names: ['Cadastro'] },
    { type: 'Retirada', names: ['Retirada'] },
    { type: 'Cancelamento', names: ['Cancelamento'] },
    { type: 'Suspensao', names: ['Suspensão 120 dias', 'Suspensao 120 dias', 'SuspensÃ£o 120 dias'] }
  ];
  var records = [];
  var summary = { total: 0, byType: {}, byMonth: {} };
  configs.forEach(function(config) {
    var sheet = sgFirstSheet_(ss, config.names);
    if (!sheet || sheet.getLastRow() < 2) {
      summary.byType[config.type] = 0;
      return;
    }
    var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getDisplayValues();
    var headers = values.shift();
    summary.byType[config.type] = values.length;
    values.forEach(function(row) {
      var record = { tipo: config.type, sheet: sheet.getName(), values: {} };
      headers.forEach(function(header, index) {
        record.values[header || ('Coluna ' + (index + 1))] = row[index] || '';
      });
      record.data = sgPickDateDisplay_(headers, row);
      records.push(record);
      summary.total++;
      var month = sgMonthKey_(record.data);
      if (month) {
        if (!summary.byMonth[month]) summary.byMonth[month] = {};
        summary.byMonth[month][config.type] = (summary.byMonth[month][config.type] || 0) + 1;
      }
    });
  });
  return { status: 1, records: records, summary: summary };
}

function sgFirstSheet_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (sheet) return sheet;
  }
  return null;
}

function sgPickDateDisplay_(headers, row) {
  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i] || '').toLowerCase();
    if (header.indexOf('data') >= 0 || header.indexOf('conexao') >= 0 || header.indexOf('conex') >= 0) {
      if (row[i]) return row[i];
    }
  }
  return row[0] || '';
}

function sgMonthKey_(value) {
  if (!value) return '';
  var text = String(value);
  var match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return match[3] + '-' + ('0' + match[2]).slice(-2);
  match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return match[1] + '-' + ('0' + match[2]).slice(-2);
  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return parsed.getFullYear() + '-' + ('0' + (parsed.getMonth() + 1)).slice(-2);
  return '';
}

function sgAppendCadastroRetirada_(ss, sheetName, record) {
  var sheet = sgSheet_(ss, sheetName, ['Data','Nome','CPF','Placa','Rastreador','Servico','Telefone','Tecnico','Status','Observacoes','Foto Veiculo','Foto Rastreador']);
  var fotoVeiculo = sgSavePhoto_(record.fotoVeiculo || record.foto_veiculo || record.fotoVeiculoUrl || record.foto_veiculo_url, sheetName, record.placa || record.plate || record.plate_number || 'sem-placa', 'veiculo');
  var fotoRastreador = sgSavePhoto_(record.fotoRastreador || record.foto_rastreador || record.fotoRastreadorUrl || record.foto_rastreador_url, sheetName, record.placa || record.plate || record.plate_number || 'sem-placa', 'rastreador');
  var row = [
    sgDate_(record.data),
    record.nome || record.name || record.client_name || '',
    record.cpf || record.document || '',
    String(record.placa || record.plate || record.plate_number || '').toUpperCase(),
    record.rastreador || record.imei || record.tracker || '',
    record.servico || record.service || 'Instalação',
    record.telefone || record.phone || '',
    record.tecnico || record.technician || '',
    record.status || 'Ativo',
    record.obs || record.observacoes || '',
    fotoVeiculo,
    fotoRastreador
  ];
  sheet.appendRow(row);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: sheetName + ' salvo na planilha.', sheet: sheetName };
}

function sgSavePhoto_(photo, type, plate, kind) {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  if (!photo.base64) return photo.url || '';
  var folder = sgPhotoFolder_();
  var safePlate = String(plate || 'sem-placa').replace(/[^A-Za-z0-9_-]/g, '_');
  var safeKind = String(kind || 'foto').replace(/[^A-Za-z0-9_-]/g, '_');
  var mime = photo.mimeType || 'image/jpeg';
  var ext = mime.indexOf('png') >= 0 ? 'png' : mime.indexOf('webp') >= 0 ? 'webp' : 'jpg';
  var bytes = Utilities.base64Decode(photo.base64);
  var blob = Utilities.newBlob(bytes, mime, [type, safePlate, safeKind, new Date().getTime()].join('_') + '.' + ext);
  var file = folder.createFile(blob);
  return file.getUrl();
}

function sgPhotoFolder_() {
  var name = 'SmartGPS Fotos';
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function sgAppendAgendamento_(ss, record) {
  var sheet = sgSheet_(ss, 'Agendamento', ['Data','Nome','CPF','Placa','Telefone','Servico','Localizacao','Tecnico','Status','Observacoes']);
  var row = [
    sgDate_(record.data),
    record.nome || record.name || record.client_name || '',
    record.cpf || record.document || '',
    String(record.placa || record.plate || record.plate_number || '').toUpperCase(),
    record.telefone || record.phone || '',
    record.servico || record.service || 'Instalação',
    record.localizacao || record.local || record.address || '',
    record.tecnico || record.technician || '',
    record.status || 'Agendado',
    record.obs || record.observacoes || ''
  ];
  sheet.appendRow(row);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Agendamento salvo na planilha.', sheet: 'Agendamento' };
}

function sgAppendCancelamento_(ss, record) {
  var sheet = sgSheet_(ss, 'Cancelamento', ['Data','Nome','CPF','Placa','Rastreador','Motivo','Tecnico','Status','Observacoes','']);
  sheet.appendRow([
    sgDate_(record.data),
    record.nome || record.name || record.client_name || '',
    record.cpf || record.document || '',
    String(record.placa || record.plate || record.plate_number || '').toUpperCase(),
    record.rastreador || record.imei || '',
    record.motivo || record.reason || '',
    record.tecnico || record.technician || '',
    record.status || 'Retirar equipamento',
    record.obs || record.observacoes || '',
    ''
  ]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Cancelamento salvo na planilha.', sheet: 'Cancelamento' };
}

function sgAppendSuspensao_(ss, record) {
  var sheet = sgSheet_(ss, 'Suspensão 120 dias', ['Empresa','ICCID','MSISDN','Ultima Conexao','Data Suspensao','Dias Passados','Dias Restantes','Situacao','Acao','Observacoes']);
  var today = new Date();
  today.setHours(0,0,0,0);
  sheet.appendRow([
    record.empresa || '',
    record.iccid || '',
    record.msisdn || '',
    record.ultimaConexao || record.uc || '',
    today,
    0,
    120,
    '🟢 OK',
    '',
    record.obs || record.observacoes || ''
  ]);
  sheet.getRange(sheet.getLastRow(), 5).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Suspensao salva na planilha.', sheet: 'Suspensão 120 dias' };
}

function sgAppendOS_(ss, record) {
  return sgAppendAgendamento_(ss, {
    nome: record.nome || record.client_name || '',
    placa: record.placa || record.vehicle_plate || '',
    telefone: record.telefone || record.client_phone || '',
    servico: record.servico || record.service || 'Instalação',
    localizacao: record.localizacao || record.client_address || '',
    tecnico: record.tecnico || record.technician || '',
    status: 'Agendado',
    obs: [record.veiculo || record.vehicle_model || '', record.consultor ? 'Consultor: ' + record.consultor : ''].filter(Boolean).join(' | ')
  });
}

function sgAppendTask_(ss, record) {
  var sheet = sgSheet_(ss, 'Task List', ['Data','Tarefa','Prioridade','Categoria','Responsavel','Status','Hora','Observacoes']);
  sheet.appendRow([
    sgDate_(record.data),
    record.tarefa || record.title || '',
    record.prio || record.priority || 'Normal',
    record.cat || record.categoria || 'Ajuda ai Alisson',
    record.resp || record.responsavel || '',
    record.status || 'Pendente',
    record.hora || '',
    record.obs || record.observacoes || ''
  ]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Task salva na planilha.', sheet: 'Task List' };
}

function sgDate_(value) {
  if (!value) return new Date();
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  var parts = String(value).split('-');
  if (parts.length === 3) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}
