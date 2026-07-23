// Cole este arquivo no Apps Script da sua planilha e publique como Web App.
// Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone with the link.

function doGet() {
  return sgJson_({ status: 1, message: 'SmartGPS Sheets endpoint ativo.' });
}

function doPost(e) {
  try {
    var payload = sgParseBody_(e);
    var action = payload.action || 'sync_dashboard';

    if (action === 'setup_database') {
      return sgJson_(sgSetupDatabase_(payload));
    }

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

    if (action === 'get_schedule_tracks') {
      return sgJson_(sgGetTypedRecords_('Controle Agenda'));
    }

    if (action === 'get_withdrawals' || action === 'get_cancellations') {
      return sgJson_(sgGetCancellationRecords_());
    }

    if (action === 'get_maintenance_tracks') {
      return sgJson_(sgGetTypedRecords_('Controle Manutencao'));
    }

    if (action === 'update_record_status') {
      return sgJson_(sgUpdateRecordStatus_(payload.sheet, payload.id, payload.status, payload.patch || {}));
    }

    if (action === 'update_cancellation_status') {
      return sgJson_(sgUpdateCancellationStatus_(payload.id, payload.status, payload.patch || {}));
    }

    if (action === 'get_links') {
      return sgJson_(sgGetLinks_());
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

function sgDb_() {
  var id = PropertiesService.getScriptProperties().getProperty('SMARTGPS_DB_SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) {}
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sgSchema_() {
  return {
    'Dashboard': ['Metrica','Valor','Atualizado em','Observacao'],
    'Cadastro': ['ID','Criado em','Data','Nome','CPF/CNPJ','Telefone','Placa','Rastreador','Servico','Tecnico','Status','Observacoes','Origem'],
    'Retirada': ['ID','Criado em','Data','Nome','CPF/CNPJ','Telefone','Placa','Rastreador','Servico','Tecnico','Status','Observacoes','Origem'],
    'Cancelamento': ['ID','Criado em','Data','Nome','CPF/CNPJ','Telefone','Placa','Rastreador','Motivo','Tecnico','Status','Observacoes','Origem'],
    'Controle Agenda': ['ID','Criado em','ID OS','Cliente','Placa','Tecnico','Tecnico ID','Data Servico','Hora','Status','Mensagem Tracker','Observacoes','Finalizado em','Origem'],
    'Retiradas': ['ID','Criado em','Data Entrada','Cliente','CPF/CNPJ','Telefone','Placa','Rastreador','Status','Ultimo Contato','Observacoes','Finalizado em','Origem'],
    'Controle de Cancelamentos': ['DATA CANCEL.','NOME','PLACA','RASTREADOR','TELEFONE','CONTATO?','RETORNO?','RETIRADO?','DATA RETIRADA','TECNICO RETIRADA','OBSERVACOES'],
    'Controle Manutencao': ['ID','Criado em','Data Entrada','Cliente','CPF/CNPJ','Telefone','Placa','IMEI','Tecnico','Status','Prioridade','Observacoes','Finalizado em','Origem'],
    'Tasks': ['ID','Criado em','Data','Tarefa','Prioridade','Categoria','Responsavel','Status','Hora','Observacoes','Finalizado em','Origem'],
    'OS': ['ID','Criado em','Data','Nome','Telefone','Placa','Veiculo','Chassi','Servico','Tecnico','Consultor','Localizacao','Status','Observacoes','Origem'],
    'Dispositivos': ['Nome','IMEI','Placa','Tecnico','Status','Velocidade','Latitude','Longitude','Endereco','Ultima Comunicacao','Manutencao'],
    'Pedidos': ['ID','Cliente','Placa','Servico','Status','Data'],
    'Estoque': ['IMEI','Modelo','SIM','Status','Tecnico','Cliente','Placa','Obs','Criado em'],
    'Manutencao': ['IMEI'],
    'Links': ['ID','Criado em','Nome','URL','Categoria','Observacao'],
    'Eventos': ['ID','Criado em','Tipo','JSON']
  };
}

function sgEnsureSchema_(ss) {
  var schema = sgSchema_();
  Object.keys(schema).forEach(function (name) {
    if (name === 'Controle de Cancelamentos') return;
    var headers = schema[name];
    var sheet = sgSheet_(ss, name, headers);
    var current = sheet.getLastRow() ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getDisplayValues()[0] : [];
    if (current[0] !== headers[0] || current.length < headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#111827').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    sheet.autoResizeColumns(1, headers.length);
  });
}

function sgSetupDatabase_(payload) {
  var source = SpreadsheetApp.getActiveSpreadsheet();
  var backup = source.copy('BACKUP ' + source.getName() + ' - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  var db = SpreadsheetApp.create(payload.name || 'Ajuda ai Alisson - Banco de Dados');
  PropertiesService.getScriptProperties().setProperty('SMARTGPS_DB_SPREADSHEET_ID', db.getId());
  sgEnsureSchema_(db);
  sgMigrateLegacy_(source, db);
  return {
    status: 1,
    message: 'Banco-planilha criado e migrado.',
    databaseId: db.getId(),
    databaseUrl: db.getUrl(),
    backupId: backup.getId(),
    backupUrl: backup.getUrl()
  };
}

function sgMigrateLegacy_(source, db) {
  var migrated = 0;
  var map = {
    'Cadastro': function (r) { return sgAppendCadastroRetirada_(db, 'Cadastro', { data:r[0], nome:r[1], cpf:r[2], placa:r[3], rastreador:r[4], servico:r[5], telefone:r[6], tecnico:r[7], status:r[8], obs:r[9], origem:'Migracao' }); },
    'Retirada': function (r) { return sgAppendCadastroRetirada_(db, 'Retirada', { data:r[0], nome:r[1], cpf:r[2], placa:r[3], rastreador:r[4], servico:r[5], telefone:r[6], tecnico:r[7], status:r[8], obs:r[9], origem:'Migracao' }); },
    'Agendamento': function (r) { return sgAppendScheduleTrack_(db, { serviceDate:r[0], client:r[1], plate:r[3], phone:r[4], technician:r[7], status:r[8] || 'Agendado', obs:r[9], origem:'Migracao' }); },
    'Cancelamento': function (r) { return sgAppendCancellationTrack_(db, { date:r[0], client:r[1], doc:r[2], phone:r[4], plate:r[3], tracker:r[4], obs:r[5] || r[8], technician:r[6], status:r[7] || 'Aguardando contato', origem:'Migracao' }); },
    'Task List': function (r) { return sgAppendTask_(db, { data:r[0], tarefa:r[1], prio:r[2], cat:r[3], resp:r[4], status:r[5], hora:r[6], obs:r[7], origem:'Migracao' }); },
    'Links': function (r) { return sgAppendLink_(db, { createdAt:r[0], title:r[1], url:r[2], category:r[3], obs:r[4], origem:'Migracao' }); }
  };
  Object.keys(map).forEach(function (name) {
    var sheet = source.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var startRow = name === 'Links' ? 2 : 3;
    if (sheet.getLastRow() < startRow) return;
    var values = sheet.getRange(startRow, 1, sheet.getLastRow() - startRow + 1, Math.min(sheet.getLastColumn(), 12)).getValues();
    values.forEach(function (row) {
      if (!row.some(function (cell) { return cell !== ''; })) return;
      try { map[name](row); migrated++; } catch (err) {}
    });
  });
  sgAddRecordTo_(db, 'Eventos', ['ID','Criado em','Tipo','JSON'], [sgId_('evt'), new Date(), 'Migracao', JSON.stringify({ migrated: migrated, source: source.getName() })]);
  return migrated;
}

function sgId_(prefix) {
  return prefix + '-' + Utilities.getUuid().slice(0, 8) + '-' + Date.now();
}

function sgAddRecordTo_(ss, sheetName, headers, row) {
  var sheet = sgSheet_(ss, sheetName, headers);
  sheet.appendRow(row);
  return { status: 1, sheet: sheetName, id: row[0] };
}

function sgSyncDashboard_(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = sgDb_();
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
      sgSheet_(ss, 'Dispositivos'),
      ['Nome', 'IMEI', 'Placa', 'Tecnico', 'Status', 'Velocidade', 'Latitude', 'Longitude', 'Endereco', 'Ultima Comunicacao', 'Manutencao'],
      devices.map(function (d) {
        return [d.name || '', d.imei || '', d.plate || '', d.technician || '', d.status || d.online || '', d.speed || 0, d.lat || '', d.lng || '', d.address || '', d.time || '', d.maintenance || 'ok'];
      })
    );

    sgReplace_(
      sgSheet_(ss, 'Pedidos'),
      ['ID', 'Cliente', 'Placa', 'Servico', 'Status', 'Data'],
      orders.map(function (o) {
        return [o.id || '', o.client || '', o.plate || '', o.service || '', o.status || '', o.date || ''];
      })
    );

    sgReplace_(
      sgSheet_(ss, 'Estoque'),
      ['IMEI', 'Modelo', 'SIM', 'Status', 'Tecnico', 'Cliente', 'Placa', 'Obs', 'Criado em'],
      stock.map(function (s) {
        return [s.imei || '', s.model || '', s.sim || '', s.status || '', s.tecnico || '', s.cliente || '', s.placa || '', s.obs || '', s.createdAt || ''];
      })
    );

    sgReplace_(
      sgSheet_(ss, 'Manutencao'),
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
  var sheet = sgSheet_(ss, 'Dashboard');
  sheet.clearContents();
  var rows = [
    ['Ajuda ai Alisson Dashboard', ''],
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
  var ss = sgDb_();
  var routed = sgRouteOperationalRecord_(ss, type, record || {});
  if (routed) return routed;

  var sheet = sgSheet_(ss, 'Eventos', sgSchema_()['Eventos']);
  sheet.appendRow([sgId_('evt'), new Date(), type, JSON.stringify(record || {})]);
  return { status: 1, message: 'Registro recebido.', type: type };
}

function sgRouteOperationalRecord_(ss, type, record) {
  var normalized = String(type || '').toLowerCase();
  if (normalized === 'cadastro') return sgAppendCadastroRetirada_(ss, 'Cadastro', record);
  if (normalized === 'retirada') return sgAppendCadastroRetirada_(ss, 'Retirada', record);
  if (normalized === 'agendamento') return sgAppendAgendamento_(ss, record);
  if (normalized === 'agendamentocontrole' || normalized === 'controle agenda') return sgAppendScheduleTrack_(ss, record);
  if (normalized === 'cancelamento') return sgAppendCancelamento_(ss, record);
  if (normalized === 'retiradacontrole' || normalized === 'retiradas') return sgAppendWithdrawal_(ss, record);
  if (normalized === 'cancelamentocontrole' || normalized === 'controle de cancelamentos' || normalized === 'cancelamentoscontrole') return sgAppendCancellationTrack_(ss, record);
  if (normalized === 'manutencaocontrole' || normalized === 'manutencaocrm' || normalized === 'controle manutencao') return sgAppendMaintenanceTrack_(ss, record);
  if (normalized === 'suspensao' || normalized === 'suspensÃ£o 120 dias') return sgAppendSuspensao_(ss, record);
  if (normalized === 'os' || normalized === 'ordem de serviÃ§o' || normalized === 'ordem de servico') return sgAppendOS_(ss, record);
  if (normalized === 'task' || normalized === 'tarefa') return sgAppendTask_(ss, record);
  if (normalized === 'link' || normalized === 'links') return sgAppendLink_(ss, record);
  return null;
}

function sgGetDashboard_() {
  var ss = sgDb_();
  var sheet = ss.getSheetByName('Dashboard') || ss.getSheetByName('SmartGPS Dashboard');
  if (!sheet) return { status: 1, rows: [] };
  var lastRow = Math.min(sheet.getLastRow(), 30);
  var lastCol = Math.min(sheet.getLastColumn(), 5);
  var rows = lastRow ? sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues() : [];
  return { status: 1, rows: rows };
}

function sgAppendCadastroRetirada_(ss, sheetName, record) {
  var sheet = sgSheet_(ss, sheetName, sgSchema_()[sheetName]);
  var id = record.id || sgId_(sheetName.toLowerCase().slice(0, 3));
  var row = [
    id,
    new Date(),
    sgDate_(record.data),
    record.nome || record.name || record.client_name || '',
    record.cpf || record.document || '',
    record.telefone || record.phone || '',
    String(record.placa || record.plate || record.plate_number || '').toUpperCase(),
    record.rastreador || record.imei || record.tracker || '',
    record.servico || record.service || 'Instalacao',
    record.tecnico || record.technician || '',
    record.status || 'Ativo',
    record.obs || record.observacoes || '',
    record.origem || record.origin || 'Sistema'
  ];
  sheet.appendRow(row);
  sheet.getRange(sheet.getLastRow(), 2, 1, 2).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: sheetName + ' salvo na planilha.', sheet: sheetName, id: id };
}

function sgAppendAgendamento_(ss, record) {
  return sgAppendScheduleTrack_(ss, {
    orderId: record.orderId || record.order_id || '',
    client: record.nome || record.name || record.client_name || '',
    plate: record.placa || record.plate || record.plate_number || '',
    technician: record.tecnico || record.technician || '',
    serviceDate: record.data || record.serviceDate || record.schedule_date || '',
    time: record.hora || record.time || '',
    status: record.status || 'Agendado',
    obs: record.obs || record.observacoes || record.localizacao || record.local || record.address || '',
    origem: record.origem || record.origin || 'Sistema'
  });
}

function sgAppendCancelamento_(ss, record) {
  var sheet = sgSheet_(ss, 'Cancelamento', sgSchema_()['Cancelamento']);
  var id = record.id || sgId_('can');
  sheet.appendRow([
    id,
    new Date(),
    sgDate_(record.data),
    record.nome || record.name || record.client_name || '',
    record.cpf || record.document || '',
    record.telefone || record.phone || '',
    String(record.placa || record.plate || record.plate_number || '').toUpperCase(),
    record.rastreador || record.imei || '',
    record.motivo || record.reason || '',
    record.tecnico || record.technician || '',
    record.status || 'Retirar equipamento',
    record.obs || record.observacoes || '',
    record.origem || record.origin || 'Sistema'
  ]);
  sheet.getRange(sheet.getLastRow(), 2, 1, 2).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Cancelamento salvo na planilha.', sheet: 'Cancelamento', id: id };
}

function sgAppendScheduleTrack_(ss, record) {
  var sheet = sgSheet_(ss, 'Controle Agenda', sgSchema_()['Controle Agenda']);
  var id = record.id || sgId_('age');
  sheet.appendRow([
    id,
    new Date(),
    record.orderId || record.order_id || record.pedido_id || '',
    record.client || record.nome || record.client_name || '',
    String(record.plate || record.placa || record.plate_number || '').toUpperCase(),
    record.technician || record.tecnico || record.technician_name || '',
    record.technicianId || record.technician_id || '',
    sgDate_(record.serviceDate || record.date || record.data),
    record.time || record.hora || '',
    record.status || 'Aguardando',
    record.trackerMessage || record.message || '',
    record.obs || record.observacoes || '',
    record.finishedAt || '',
    record.origem || record.origin || 'Sistema'
  ]);
  sheet.getRange(sheet.getLastRow(), 2).setNumberFormat('dd/MM/yyyy HH:mm');
  sheet.getRange(sheet.getLastRow(), 8).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Agendamento salvo no controle.', sheet: 'Controle Agenda', id: id };
}

function sgAppendWithdrawal_(ss, record) {
  var sheet = sgSheet_(ss, 'Retiradas', sgSchema_()['Retiradas']);
  var id = record.id || sgId_('ret');
  sheet.appendRow([
    id,
    new Date(),
    sgDate_(record.date || record.data),
    record.client || record.nome || record.client_name || '',
    record.doc || record.cpf || record.document || '',
    record.phone || record.telefone || '',
    String(record.plate || record.placa || record.plate_number || '').toUpperCase(),
    record.tracker || record.rastreador || record.imei || '',
    record.status || 'Contato pendente',
    record.lastContact || record.ultimoContato || '',
    record.obs || record.observacoes || record.motivo || '',
    record.finishedAt || '',
    record.origem || record.origin || 'Sistema'
  ]);
  sheet.getRange(sheet.getLastRow(), 2, 1, 2).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Retirada salva no controle.', sheet: 'Retiradas', id: id };
}

function sgCancellationHeaders_() {
  return ['DATA CANCEL.','NOME','PLACA','RASTREADOR','TELEFONE','CONTATO?','RETORNO?','RETIRADO?','DATA RETIRADA','TÉCNICO RETIRADA','OBSERVAÇÕES'];
}

function sgCancellationSheet_(ss) {
  var name = 'Controle de Cancelamentos';
  var sheet = ss.getSheetByName(name);
  var headers = sgCancellationHeaders_();
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).merge().setValue('✕ CONTROLE DE CANCELAMENTOS');
    sheet.getRange(1, 1).setFontWeight('bold').setBackground('#c5161d').setFontColor('#ffffff').setHorizontalAlignment('center');
    sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(2, 1, 1, headers.length).setFontWeight('bold').setBackground('#c5161d').setFontColor('#ffffff');
    sheet.setFrozenRows(2);
    return sheet;
  }
  var headerRow = sgCancellationHeaderRow_(sheet);
  if (!headerRow) {
    sheet.insertRowBefore(1);
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).merge().setValue('✕ CONTROLE DE CANCELAMENTOS');
    sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 2, headers.length).setFontWeight('bold').setBackground('#c5161d').setFontColor('#ffffff');
    sheet.setFrozenRows(2);
  }
  return sheet;
}

function sgCancellationHeaderRow_(sheet) {
  var max = Math.min(sheet.getLastRow(), 5);
  if (max < 1) return 0;
  var values = sheet.getRange(1, 1, max, Math.max(sheet.getLastColumn(), 11)).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i].map(function (v) { return sgNormHeader_(v); });
    if (row.indexOf('NOME') >= 0 && row.indexOf('PLACA') >= 0 && row.indexOf('CONTATO?') >= 0) return i + 1;
  }
  return 0;
}

function sgNormHeader_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function sgYes_(value) {
  var s = String(value || '').toLowerCase();
  return s === 'sim' || s === 's' || s === 'yes' || s === 'true' || s === '1' || s.indexOf('feito') >= 0 || s.indexOf('retir') >= 0;
}

function sgCancellationStatus_(row) {
  if (sgYes_(row['RETIRADO?'])) return 'Equipamento retirado';
  if (sgYes_(row['RETORNO?'])) return 'Retirada agendada';
  if (sgYes_(row['CONTATO?'])) return 'Contato feito';
  return 'Aguardando contato';
}

function sgGetCancellationRecords_() {
  var ss = sgDb_();
  var sheet = sgCancellationSheet_(ss);
  var headerRow = sgCancellationHeaderRow_(sheet) || 2;
  var last = sheet.getLastRow();
  if (last <= headerRow) return { status: 1, records: [] };
  var headers = sheet.getRange(headerRow, 1, 1, Math.max(sheet.getLastColumn(), 11)).getDisplayValues()[0];
  var values = sheet.getRange(headerRow + 1, 1, last - headerRow, headers.length).getDisplayValues();
  var records = [];
  values.forEach(function (row, i) {
    if (!row.some(function (cell) { return cell !== ''; })) return;
    var obj = {};
    headers.forEach(function (h, col) {
      var key = sgNormHeader_(h);
      if (key) obj[key] = row[col] || '';
    });
    var rowNumber = headerRow + 1 + i;
    records.push({
      id: 'cancelamento-' + rowNumber,
      tipo: 'CancelamentoControle',
      sheet: 'Controle de Cancelamentos',
      row: rowNumber,
      status: sgCancellationStatus_(obj),
      values: {
        'DATA CANCEL.': obj['DATA CANCEL.'] || obj['DATA CANCEL'] || '',
        'NOME': obj.NOME || '',
        'PLACA': obj.PLACA || '',
        'RASTREADOR': obj.RASTREADOR || '',
        'TELEFONE': obj.TELEFONE || '',
        'CONTATO?': obj['CONTATO?'] || '',
        'RETORNO?': obj['RETORNO?'] || '',
        'RETIRADO?': obj['RETIRADO?'] || '',
        'DATA RETIRADA': obj['DATA RETIRADA'] || '',
        'TÉCNICO RETIRADA': obj['TECNICO RETIRADA'] || '',
        'OBSERVAÇÕES': obj.OBSERVACOES || ''
      }
    });
  });
  return { status: 1, records: records };
}

function sgAppendCancellationTrack_(ss, record) {
  var sheet = sgCancellationSheet_(ss);
  var status = record.status || 'Aguardando contato';
  var flags = sgCancellationFlags_(status, record);
  var obs = record.obs || record.observacoes || record.motivo || '';
  if (record.doc || record.cpf || record.document) {
    obs = ['CPF/CNPJ: ' + (record.doc || record.cpf || record.document), obs].filter(Boolean).join(' | ');
  }
  sheet.appendRow([
    sgDate_(record.date || record.data || record.cancelDate),
    record.client || record.nome || record.client_name || '',
    String(record.plate || record.placa || record.plate_number || '').toUpperCase(),
    record.tracker || record.rastreador || record.imei || '',
    record.phone || record.telefone || '',
    flags.contato,
    flags.retorno,
    flags.retirado,
    record.withdrawalDate || record.dataRetirada || '',
    record.technician || record.tecnico || '',
    obs
  ]);
  var row = sheet.getLastRow();
  sheet.getRange(row, 1).setNumberFormat('dd/MM/yyyy');
  if (record.withdrawalDate || record.dataRetirada) sheet.getRange(row, 9).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Cancelamento salvo no controle.', sheet: 'Controle de Cancelamentos', id: 'cancelamento-' + row, row: row };
}

function sgCancellationFlags_(status, patch) {
  var s = String(status || '').toLowerCase();
  var contato = patch.contacted || patch.contato || '';
  var retorno = patch.returned || patch.retorno || '';
  var retirado = patch.removed || patch.retirado || '';
  if (s.indexOf('contato feito') >= 0 || s.indexOf('sem retorno') >= 0 || s.indexOf('retirada agendada') >= 0 || s.indexOf('equipamento retirado') >= 0 || s.indexOf('encerrado') >= 0) contato = 'Sim';
  if (s.indexOf('retirada agendada') >= 0 || s.indexOf('equipamento retirado') >= 0 || s.indexOf('encerrado') >= 0) retorno = 'Sim';
  if (s.indexOf('equipamento retirado') >= 0 || s.indexOf('encerrado') >= 0) retirado = 'Sim';
  return { contato: contato || 'Não', retorno: retorno || 'Não', retirado: retirado || 'Não' };
}

function sgUpdateCancellationStatus_(id, status, patch) {
  var ss = sgDb_();
  var sheet = sgCancellationSheet_(ss);
  var row = Number(patch.row || String(id || '').replace(/\D/g, ''));
  if (!row || row < 3 || row > sheet.getLastRow()) return { status: 0, message: 'Cancelamento nao encontrado: ' + id };
  var flags = sgCancellationFlags_(status, patch || {});
  sheet.getRange(row, 6).setValue(flags.contato);
  sheet.getRange(row, 7).setValue(flags.retorno);
  sheet.getRange(row, 8).setValue(flags.retirado);
  if (patch.withdrawalDate || patch.dataRetirada) {
    sheet.getRange(row, 9).setValue(sgDate_(patch.withdrawalDate || patch.dataRetirada)).setNumberFormat('dd/MM/yyyy');
  } else if (flags.retirado === 'Sim' && !sheet.getRange(row, 9).getValue()) {
    sheet.getRange(row, 9).setValue(new Date()).setNumberFormat('dd/MM/yyyy');
  }
  if (patch.technician || patch.tecnico) sheet.getRange(row, 10).setValue(patch.technician || patch.tecnico);
  if (patch.obs || patch.observacoes) sheet.getRange(row, 11).setValue(patch.obs || patch.observacoes);
  return { status: 1, message: 'Cancelamento atualizado.', sheet: 'Controle de Cancelamentos', id: id, row: row };
}

function sgAppendMaintenanceTrack_(ss, record) {
  var sheet = sgSheet_(ss, 'Controle Manutencao', sgSchema_()['Controle Manutencao']);
  var id = record.id || sgId_('man');
  sheet.appendRow([
    id,
    new Date(),
    sgDate_(record.date || record.data || record.createdAt),
    record.client || record.nome || record.client_name || '',
    record.doc || record.cpf || record.document || '',
    record.phone || record.telefone || '',
    String(record.plate || record.placa || record.plate_number || '').toUpperCase(),
    record.imei || record.tracker || record.rastreador || '',
    record.technician || record.tecnico || record.technician_name || '',
    record.status || 'Detectado',
    record.priority || record.prioridade || 'Normal',
    record.obs || record.observacoes || '',
    record.finishedAt || '',
    record.origem || record.origin || 'Sistema'
  ]);
  sheet.getRange(sheet.getLastRow(), 2, 1, 2).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Manutencao salva no controle.', sheet: 'Controle Manutencao', id: id };
}

function sgAppendSuspensao_(ss, record) {
  var sheet = sgSheet_(ss, 'Suspensao 120 dias', ['Empresa','ICCID','MSISDN','Ultima Conexao','Data Suspensao','Dias Passados','Dias Restantes','Situacao','Acao','Observacoes']);
  var today = new Date();
  today.setHours(0,0,0,0);
  sheet.appendRow([record.empresa || '', record.iccid || '', record.msisdn || '', record.ultimaConexao || record.uc || '', today, 0, 120, 'OK', '', record.obs || record.observacoes || '']);
  sheet.getRange(sheet.getLastRow(), 5).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Suspensao salva na planilha.', sheet: 'Suspensao 120 dias' };
}

function sgAppendOS_(ss, record) {
  var sheet = sgSheet_(ss, 'OS', sgSchema_()['OS']);
  var id = record.id || sgId_('os');
  sheet.appendRow([
    id,
    new Date(),
    sgDate_(record.data),
    record.nome || record.client_name || '',
    record.telefone || record.client_phone || '',
    String(record.placa || record.vehicle_plate || '').toUpperCase(),
    record.veiculo || record.vehicle_model || '',
    record.chassi || record.vehicle_chassi || '',
    record.servico || record.service || 'Instalacao',
    record.tecnico || record.technician || '',
    record.consultor || '',
    record.localizacao || record.client_address || '',
    record.status || 'Agendado',
    record.obs || record.observacoes || '',
    record.origem || record.origin || 'Sistema'
  ]);
  sheet.getRange(sheet.getLastRow(), 2, 1, 2).setNumberFormat('dd/MM/yyyy');
  sgAppendScheduleTrack_(ss, { orderId: id, client: record.nome || record.client_name || '', plate: record.placa || record.vehicle_plate || '', technician: record.tecnico || '', serviceDate: record.data || '', status: 'Aguardando', obs: 'OS registrada no sistema', origem: 'OS' });
  return { status: 1, message: 'OS salva na planilha.', sheet: 'OS', id: id };
}

function sgAppendTask_(ss, record) {
  var sheet = sgSheet_(ss, 'Tasks', sgSchema_()['Tasks']);
  var id = record.id || sgId_('tsk');
  sheet.appendRow([
    id,
    new Date(),
    sgDate_(record.data),
    record.tarefa || record.title || '',
    record.prio || record.priority || 'Normal',
    record.cat || record.categoria || 'Ajuda ai Alisson',
    record.resp || record.responsavel || '',
    record.status || 'Pendente',
    record.hora || '',
    record.obs || record.observacoes || '',
    record.finishedAt || '',
    record.origem || record.origin || 'Sistema'
  ]);
  sheet.getRange(sheet.getLastRow(), 2, 1, 2).setNumberFormat('dd/MM/yyyy');
  return { status: 1, message: 'Task salva na planilha.', sheet: 'Tasks', id: id };
}
function sgAppendLink_(ss, record) {
  var sheet = sgSheet_(ss, 'Links', sgSchema_()['Links']);
  var title = record.title || record.nome || record.name || '';
  var url = record.url || record.link || '';
  if (!title || !url) return { status: 0, message: 'Nome e URL do link sao obrigatorios.' };
  var existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 3, sheet.getLastRow() - 1, 2).getValues() : [];
  var key = String(title + '|' + url).toLowerCase();
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][0] + '|' + existing[i][1]).toLowerCase() === key) {
      return { status: 1, message: 'Link ja existia na planilha.', sheet: 'Links' };
    }
  }
  var id = record.id || sgId_('lnk');
  sheet.appendRow([
    id,
    sgDate_(record.createdAt || record.data),
    title,
    url,
    record.category || record.categoria || '',
    record.obs || record.observacao || record.observacoes || ''
  ]);
  sheet.getRange(sheet.getLastRow(), 2).setNumberFormat('dd/MM/yyyy HH:mm');
  return { status: 1, message: 'Link salvo na planilha.', sheet: 'Links', id: id };
}

function sgGetLinks_() {
  var ss = sgDb_();
  var sheet = sgSheet_(ss, 'Links', ['ID','Criado em','Nome','URL','Categoria','Observacao']);
  var last = sheet.getLastRow();
  if (last < 2) return { status: 1, links: [] };
  var values = sheet.getRange(2, 1, last - 1, Math.min(sheet.getLastColumn(), 6)).getDisplayValues();
  var links = values
    .filter(function (r) { return r[2] || r[3] || r[1]; })
    .map(function (r, i) {
      return { id: r[0] || 'sheet-' + (i + 2), data: r[1], title: r[2] || r[1], url: r[3] || r[2], category: r[4] || '', obs: r[5] || '' };
    });
  return { status: 1, links: links };
}

function sgSheetRecords_(ss, sheetName, type) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var headerRow = sgDetectHeaderRow_(sheet);
  if (!headerRow) return [];
  var values = sheet.getRange(headerRow, 1, sheet.getLastRow() - headerRow + 1, sheet.getLastColumn()).getDisplayValues();
  var headers = values.shift();
  return values
    .filter(function (row) { return row.some(function (cell) { return cell !== ''; }); })
    .map(function (row, index) {
      var obj = {};
      headers.forEach(function (h, i) { if (h) obj[h] = row[i] || ''; });
      return { id: obj.ID || sheetName + '-' + (index + headerRow + 1), tipo: type || sheetName, sheet: sheetName, row: index + headerRow + 1, values: obj };
    });
}

function sgDetectHeaderRow_(sheet) {
  var max = Math.min(sheet.getLastRow(), 6);
  if (max < 1) return 0;
  var width = Math.max(sheet.getLastColumn(), 12);
  var rows = sheet.getRange(1, 1, max, width).getDisplayValues();
  var best = 0;
  var bestScore = -1;
  rows.forEach(function (row, idx) {
    var norm = row.map(function (v) { return sgNormHeader_(v); });
    var score = 0;
    ['NOME','CLIENTE','PLACA','CPF','CPF/CNPJ','RASTREADOR','TELEFONE','STATUS','DATA'].forEach(function (key) {
      if (norm.indexOf(key) >= 0) score += 2;
    });
    if (norm[0] === 'DATA') score += 3;
    if (norm[0] === 'ID' && norm.indexOf('CRIADO EM') >= 0) score += 1;
    if (idx === 1 && norm.indexOf('NOME') >= 0 && norm.indexOf('PLACA') >= 0) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = idx + 1;
    }
  });
  return bestScore > 0 ? best : 0;
}

function sgGetOperationalRecords_() {
  var ss = sgDb_();
  var sheets = [
    ['Cadastro','Cadastro'],
    ['Retirada','Retirada'],
    ['Cancelamento','Cancelamento'],
    ['Controle Agenda','AgendamentoControle'],
    ['Controle Manutencao','ManutencaoControle'],
    ['Tasks','Task'],
    ['OS','OS']
  ];
  var records = [];
  sheets.forEach(function (pair) { records = records.concat(sgSheetRecords_(ss, pair[0], pair[1])); });
  records = records.concat(sgGetCancellationRecords_().records || []);
  return { status: 1, records: records, summary: sgSummary_(records) };
}

function sgGetTypedRecords_(sheetName) {
  var ss = sgDb_();
  return { status: 1, records: sgSheetRecords_(ss, sheetName, sheetName) };
}

function sgSummary_(records) {
  var byType = {};
  var byMonth = {};
  records.forEach(function (record) {
    byType[record.tipo] = (byType[record.tipo] || 0) + 1;
    var data = record.values.Data || record.values['Data Entrada'] || record.values['Data Servico'] || record.values['DATA CANCEL.'] || record.values['Criado em'] || '';
    var m = String(data).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    var key = m ? m[3] + '-' + String(m[2]).padStart(2, '0') : 'Sem data';
    if (!byMonth[key]) byMonth[key] = {};
    byMonth[key][record.tipo] = (byMonth[key][record.tipo] || 0) + 1;
  });
  return { total: records.length, byType: byType, byMonth: byMonth };
}

function sgUpdateRecordStatus_(sheetName, id, status, patch) {
  var ss = sgDb_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { status: 0, message: 'Aba nao encontrada: ' + sheetName };
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { status: 0, message: 'Aba vazia.' };
  var headers = values[0];
  var idCol = headers.indexOf('ID') + 1;
  var statusCol = headers.indexOf('Status') + 1;
  if (!idCol || !statusCol) return { status: 0, message: 'Aba sem ID/Status.' };
  for (var r = 2; r <= values.length; r++) {
    if (String(values[r - 1][idCol - 1]) === String(id)) {
      sheet.getRange(r, statusCol).setValue(status);
      Object.keys(patch || {}).forEach(function (key) {
        var col = headers.indexOf(key) + 1;
        if (col) sheet.getRange(r, col).setValue(patch[key]);
      });
      var finishCol = headers.indexOf('Finalizado em') + 1;
      if (finishCol && ['Finalizado','Retirado','Equipamento retirado','Encerrado','Resolvido','Cancelado'].indexOf(status) >= 0) sheet.getRange(r, finishCol).setValue(new Date());
      return { status: 1, message: 'Status atualizado.', sheet: sheetName, id: id };
    }
  }
  return { status: 0, message: 'ID nao encontrado: ' + id };
}

function sgDate_(value) {
  if (!value) return new Date();
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  var parts = String(value).split('-');
  if (parts.length === 3) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}
