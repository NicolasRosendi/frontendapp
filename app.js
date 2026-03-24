// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
const API = 'https://backenddnd.onrender.com/api';

// ══════════════════════════════════════
//  APP STATE
// ══════════════════════════════════════
let currentUser = null;
let currentToken = null;
let currentCharId = null;
let authMode = 'login'; // 'login' | 'register'
let combatPollInterval = null;

const state = {
  editMode: false,
  inspiration: false,
  hasShield: false,
  deathSaves: [false,false,false,false,false,false],
  stats: { str:10, dex:10, con:10, int:10, wis:10, cha:10 },
  hpCurr:10, hpMax:10, hpTemp:0,
  profBonus:2,
  savingThrowProf:[],
  skillProf:[],
  skillExpertise:[],
  spellAbilityKey:'int',
  attacks:[],
  inventory:[],
  spells:{
    0:{slots:0,used:0,list:[],prep:[]},
    1:{slots:0,used:0,list:[],prep:[]},
    2:{slots:0,used:0,list:[],prep:[]},
    3:{slots:0,used:0,list:[],prep:[]},
    4:{slots:0,used:0,list:[],prep:[]},
    5:{slots:0,used:0,list:[],prep:[]},
    6:{slots:0,used:0,list:[],prep:[]},
    7:{slots:0,used:0,list:[],prep:[]},
    8:{slots:0,used:0,list:[],prep:[]},
    9:{slots:0,used:0,list:[],prep:[]},
  }
};

// Combat state
let combatState = {
  tableId: null,
  tableName: '',
  isOwner: false,
  turnOrder: [],
  currentTurn: 0,
  currentRound: 1,
  myCharacterId: null,
  selectedTarget: null,
  selectedWeapon: 0,
  hpStatus: [],
  log: [],
};

// ══════════════════════════════════════
//  API HELPERS
// ══════════════════════════════════════
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (currentToken) headers['Authorization'] = 'Bearer ' + currentToken;
  try {
    const res = await fetch(API + path, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch') throw new Error('No se pudo conectar al servidor');
    throw err;
  }
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.className = 'toast', 2500);
}

// ══════════════════════════════════════
//  SCREEN MANAGEMENT
// ══════════════════════════════════════
function showScreen(name) {
  document.getElementById('authScreen').style.display = name === 'auth' ? 'flex' : 'none';
  document.getElementById('lobbyScreen').className = 'lobby-screen' + (name === 'lobby' ? ' active' : '');
  document.getElementById('combatScreen').className = 'combat-screen' + (name === 'combat' ? ' active' : '');
  document.getElementById('appWrapper').className = 'app-wrapper' + (name === 'sheet' ? ' active' : '');
  if (name !== 'combat' && combatPollInterval) { clearInterval(combatPollInterval); combatPollInterval = null; }
}

// ══════════════════════════════════════
//  AUTH
// ══════════════════════════════════════
function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Iniciar Sesión' : 'Registro';
  document.getElementById('authSubmit').textContent = authMode === 'login' ? 'Entrar' : 'Registrarme';
  document.getElementById('authToggleText').textContent = authMode === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?';
  document.getElementById('authToggleLink').textContent = authMode === 'login' ? 'Registrate' : 'Iniciá sesión';
  document.getElementById('authError').className = 'auth-error';
}

async function handleAuth() {
  const user = document.getElementById('authUser').value.trim();
  const pass = document.getElementById('authPass').value;
  const errEl = document.getElementById('authError');
  const btn = document.getElementById('authSubmit');

  if (!user || !pass) { errEl.textContent = 'Completá usuario y contraseña'; errEl.className = 'auth-error show'; return; }

  btn.disabled = true;
  btn.textContent = 'Cargando...';
  try {
    const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
    const data = await api(endpoint, { method: 'POST', body: JSON.stringify({ username: user, password: pass }) });
    currentUser = data.user;
    currentToken = data.token;
    localStorage.setItem('dnd_token', data.token);
    localStorage.setItem('dnd_user', JSON.stringify(data.user));
    showToast(authMode === 'login' ? 'Bienvenido, ' + data.user.username : 'Cuenta creada. Bienvenido!');
    enterLobby();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.className = 'auth-error show';
  }
  btn.disabled = false;
  btn.textContent = authMode === 'login' ? 'Entrar' : 'Registrarme';
}

// Enter on password
document.getElementById('authPass').addEventListener('keydown', function(e) { if (e.key === 'Enter') handleAuth(); });

function logout() {
  currentUser = null;
  currentToken = null;
  localStorage.removeItem('dnd_token');
  localStorage.removeItem('dnd_user');
  showScreen('auth');
}

// ══════════════════════════════════════
//  LOBBY
// ══════════════════════════════════════
function enterLobby() {
  showScreen('lobby');
  document.getElementById('lobbyUser').textContent = currentUser.username;
  loadCharacters();
  loadTables();
  loadPublicTables();
}

function switchLobbyTab(name, btn) {
  document.querySelectorAll('.lobby-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.lobby-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('lobby-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'tables') { loadTables(); loadPublicTables(); }
}

// ── Characters ────────────────────────
async function loadCharacters() {
  const container = document.getElementById('charListContainer');
  container.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await api('/characters');
    if (data.characters.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-style:italic;">No tenés fichas todavía. Creá una!</div>';
      return;
    }
    container.innerHTML = data.characters.map(c => `
      <div class="char-list-item" onclick="openCharacter(${c.id})">
        <div>
          <div class="char-list-name">${c.name}</div>
          <div class="char-list-meta">Actualizado: ${new Date(c.updated_at).toLocaleDateString()}</div>
        </div>
        <div class="char-list-actions">
          <button class="char-action-btn" onclick="event.stopPropagation();openCharacter(${c.id})">Abrir</button>
          <button class="char-action-btn del" onclick="event.stopPropagation();deleteCharacter(${c.id},'${c.name}')">✕</button>
        </div>
      </div>
    `).join('');
  } catch (err) { container.innerHTML = '<div style="color:var(--red2);padding:12px;">Error: ' + err.message + '</div>'; }
}

async function createCharacter() {
  try {
    const data = await api('/characters', { method: 'POST', body: JSON.stringify({ name: 'Nuevo Personaje' }) });
    showToast('Ficha creada');
    openCharacter(data.character.id);
  } catch (err) { showToast(err.message, true); }
}

async function deleteCharacter(id, name) {
  if (!confirm('¿Borrar la ficha "' + name + '"?')) return;
  try {
    await api('/characters/' + id, { method: 'DELETE' });
    showToast('Ficha eliminada');
    loadCharacters();
  } catch (err) { showToast(err.message, true); }
}

async function openCharacter(id) {
  try {
    const data = await api('/characters/' + id);
    currentCharId = id;
    loadStateFromData(data.character.data, data.character.name);
    showScreen('sheet');
    renderAll();
  } catch (err) { showToast(err.message, true); }
}

function ensureSpells(spells) {
  var result = {};
  for (var lvl = 0; lvl <= 9; lvl++) {
    var existing = (spells && spells[lvl]) ? spells[lvl] : {};
    var list = (existing.list && Array.isArray(existing.list)) ? existing.list : [];
    var prep = (existing.prep && Array.isArray(existing.prep)) ? existing.prep : [];
    // Sync prep length
    while(prep.length < list.length) prep.push(false);
    while(prep.length > list.length) prep.pop();
    result[lvl] = {
      slots: existing.slots || 0,
      used: existing.used || 0,
      list: list,
      prep: prep
    };
  }
  return result;
}

function loadStateFromData(d, name) {
  state.editMode = false;
  state.inspiration = d.inspiration || false;
  state.hasShield = d.hasShield || false;
  state.deathSaves = d.deathSaves || [false,false,false,false,false,false];
  state.stats = d.stats || { str:10, dex:10, con:10, int:10, wis:10, cha:10 };
  state.hpCurr = d.hpCurr !== undefined ? d.hpCurr : 10;
  state.hpMax = d.hpMax !== undefined ? d.hpMax : 10;
  state.hpTemp = d.hpTemp || 0;
  state.profBonus = d.profBonus || 2;
  state.savingThrowProf = d.savingThrowProf || [];
  state.skillProf = d.skillProf || [];
  state.skillExpertise = d.skillExpertise || [];
  state.spellAbilityKey = d.spellAbilityKey || 'int';
  state.attacks = d.attacks || [];
  state.inventory = d.inventory || [];
  state.spells = ensureSpells(d.spells);
  // Text fields
  textFields = {};
  const tf = ['charName','class','level','race','subrace','background','alignment','player','xp','proficiencies','personality','ideals','bonds','flaws','traits','age','height','weight','eyes','skin','hair','appearance','backstory','allies','treasure','additionalTraits','ac','initiative','speed','hitDice','hdTotal','armorCA','armorName','coinPP','coinPO','coinPE','coinPPT','coinPC','spellAbility'];
  tf.forEach(k => { if (d[k] !== undefined) textFields[k] = String(d[k]); });
  if (name && !textFields.charName) textFields.charName = name;
}

function getStateForSave() {
  const d = {
    ...textFields,
    inspiration: state.inspiration,
    hasShield: state.hasShield,
    deathSaves: state.deathSaves,
    stats: state.stats,
    hpCurr: state.hpCurr,
    hpMax: state.hpMax,
    hpTemp: state.hpTemp,
    profBonus: state.profBonus,
    savingThrowProf: state.savingThrowProf,
    skillProf: state.skillProf,
    skillExpertise: state.skillExpertise,
    spellAbilityKey: state.spellAbilityKey,
    attacks: state.attacks,
    inventory: state.inventory,
    spells: state.spells,
  };
  return d;
}

async function saveCharacter() {
  if (!currentCharId) return;
  try {
    const d = getStateForSave();
    await api('/characters/' + currentCharId, {
      method: 'PUT',
      body: JSON.stringify({ name: textFields.charName || 'Sin nombre', data: d })
    });
  } catch (err) { console.error('Error guardando:', err); }
}

function backToLobby() {
  saveCharacter();
  showScreen('lobby');
  loadCharacters();
}

// ── Tables ────────────────────────────
async function loadTables() {
  const container = document.getElementById('tableListContainer');
  container.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await api('/tables');
    if (data.tables.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-style:italic;">No estás en ninguna mesa.</div>';
      return;
    }
    container.innerHTML = data.tables.map(t => `
      <div class="table-card">
        <div class="table-card-header">
          <div class="table-card-name">${t.name}</div>
          <div class="table-card-code">${t.code}</div>
        </div>
        <div class="table-card-info">${t.player_count} jugador(es) · ${t.is_owner ? 'Dueño' : 'Miembro'} · ${t.status === 'combat' ? '⚔ En combate' : 'Lobby'}</div>
        <div class="table-card-actions">
          <button class="char-action-btn" onclick="openTable(${t.id})">Entrar</button>
          ${t.is_owner && t.status === 'lobby' ? '<button class="char-action-btn" onclick="startCombat(' + t.id + ')">⚔ Iniciar Combate</button>' : ''}
          ${t.is_owner && t.status === 'combat' ? '<button class="char-action-btn del" onclick="endCombat(' + t.id + ')">Terminar</button>' : ''}
        </div>
      </div>
    `).join('');
  } catch (err) { container.innerHTML = '<div style="color:var(--red2);padding:12px;">Error: ' + err.message + '</div>'; }
}

let newTableVisibility = 'public';

function setTableVisibility(vis) {
  newTableVisibility = vis;
  const pubBtn = document.getElementById('visPublicBtn');
  const privBtn = document.getElementById('visPrivateBtn');
  const pwdRow = document.getElementById('tablePasswordRow');
  if (vis === 'public') {
    pubBtn.className = 'adv-btn adv-active';
    privBtn.className = 'adv-btn';
    pwdRow.style.display = 'none';
  } else {
    pubBtn.className = 'adv-btn';
    privBtn.className = 'adv-btn dis-active';
    pwdRow.style.display = 'block';
  }
}

async function createTable() {
  const name = document.getElementById('newTableName').value.trim();
  if (!name) { showToast('Ponele un nombre a la mesa', true); return; }
  try {
    const chars = await api('/characters');
    if (chars.characters.length === 0) {
      showToast('Creá una ficha primero antes de crear una mesa', true);
      return;
    }
    let charId;
    if (chars.characters.length === 1) {
      charId = chars.characters[0].id;
    } else {
      const names = chars.characters.map((c,i) => (i+1) + '. ' + c.name).join('\n');
      const choice = prompt('¿Con qué personaje te unís a la mesa?\n' + names + '\n\nIngresá el número:');
      const idx = parseInt(choice) - 1;
      if (isNaN(idx) || idx < 0 || idx >= chars.characters.length) { showToast('Selección inválida', true); return; }
      charId = chars.characters[idx].id;
    }
    const password = (document.getElementById('newTablePassword') || {}).value || null;
    const data = await api('/tables', {
      method: 'POST',
      body: JSON.stringify({ name, visibility: newTableVisibility, password: newTableVisibility === 'private' ? password : null })
    });
    await api('/tables/' + data.table.id + '/join', { method: 'POST', body: JSON.stringify({ character_id: charId }) });
    showToast('Mesa creada y te uniste! Código: ' + data.table.code);
    document.getElementById('newTableName').value = '';
    if (document.getElementById('newTablePassword')) document.getElementById('newTablePassword').value = '';
    loadTables();
    loadPublicTables();
  } catch (err) { showToast(err.message, true); }
}

async function loadPublicTables() {
  const container = document.getElementById('publicTableListContainer');
  if (!container) return;
  container.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await api('/tables/public');
    if (data.tables.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--on-surface-muted);padding:20px;font-style:italic;">No hay mesas públicas.</div>';
      return;
    }
    container.innerHTML = data.tables.map(function(t) {
      const joined = t.already_joined;
      return '<div class="table-card">' +
        '<div class="table-card-header">' +
          '<div class="table-card-name">' + t.name + '</div>' +
          '<div class="table-card-code">' + t.code + '</div>' +
        '</div>' +
        '<div class="table-card-info">' + t.player_count + ' jugador(es) · Creada por ' + t.owner_name + ' · ' + (t.status === 'combat' ? '⚔ En combate' : 'Lobby') + '</div>' +
        '<div class="table-card-actions">' +
          (joined
            ? '<button class="char-action-btn" onclick="openTable(' + t.id + ')">Entrar</button>'
            : '<button class="char-action-btn" onclick="joinPublicTable(' + t.id + ',\'' + t.name + '\')">Unirse</button>'
          ) +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    container.innerHTML = '<div style="color:var(--red-bright);padding:12px;">Error: ' + err.message + '</div>';
  }
}

async function joinPublicTable(tableId, tableName) {
  try {
    const chars = await api('/characters');
    if (chars.characters.length === 0) {
      showToast('Creá una ficha primero', true);
      return;
    }
    let charId;
    if (chars.characters.length === 1) {
      charId = chars.characters[0].id;
    } else {
      const names = chars.characters.map(function(c,i) { return (i+1) + '. ' + c.name; }).join('\n');
      const choice = prompt('¿Con qué personaje te unís?\n' + names + '\n\nIngresá el número:');
      const idx = parseInt(choice) - 1;
      if (isNaN(idx) || idx < 0 || idx >= chars.characters.length) { showToast('Selección inválida', true); return; }
      charId = chars.characters[idx].id;
    }
    await api('/tables/' + tableId + '/join', { method: 'POST', body: JSON.stringify({ character_id: charId }) });
    showToast('Te uniste a ' + tableName);
    loadTables();
    loadPublicTables();
  } catch (err) { showToast(err.message, true); }
}

async function joinTableByCode() {
  const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
  if (!code || code.length < 4) { showToast('Ingresá el código de la mesa', true); return; }
  try {
    const found = await api('/tables/join/' + code);
    // Si es privada con password, pedirla
    let password = null;
    if (found.table.visibility === 'private' && found.table.password) {
      password = prompt('Esta mesa es privada. Ingresá la contraseña:');
      if (password === null) return;
    }
    const chars = await api('/characters');
    if (chars.characters.length === 0) {
      showToast('Creá una ficha primero', true);
      return;
    }
    let charId;
    if (chars.characters.length === 1) {
      charId = chars.characters[0].id;
    } else {
      const names = chars.characters.map((c,i) => (i+1) + '. ' + c.name).join('\n');
      const choice = prompt('¿Con qué personaje te unís?\n' + names + '\n\nIngresá el número:');
      const idx = parseInt(choice) - 1;
      if (isNaN(idx) || idx < 0 || idx >= chars.characters.length) { showToast('Selección inválida', true); return; }
      charId = chars.characters[idx].id;
    }
    await api('/tables/' + found.table.id + '/join', { method: 'POST', body: JSON.stringify({ character_id: charId, password: password }) });
    showToast('Te uniste a ' + found.table.name);
    document.getElementById('joinCodeInput').value = '';
    loadTables();
    loadPublicTables();
  } catch (err) { showToast(err.message, true); }
}

// ── Table / Combat ────────────────────
async function openTable(tableId) {
  try {
    const data = await api('/tables/' + tableId);
    combatState.tableId = tableId;
    combatState.tableName = data.table.name;
    combatState.isOwner = data.table.owner_id === currentUser.id;

    if (data.table.status === 'combat' && data.combat && data.combat.status === 'active') {
      enterCombatView(data);
    } else {
      // Show table details
      const playerList = data.players.map(p => p.username + ' → ' + p.character_name).join('\n');
      alert('Mesa: ' + data.table.name + '\nCódigo: ' + data.table.code + '\nEstado: ' + data.table.status + '\n\nJugadores:\n' + (playerList || '(vacío)'));
    }
  } catch (err) { showToast(err.message, true); }
}

async function startCombat(tableId) {
  try {
    const data = await api('/tables/' + tableId + '/combat/start', { method: 'POST' });
    showToast('Combate iniciado!');
    const tableData = await api('/tables/' + tableId);
    combatState.tableId = tableId;
    combatState.tableName = tableData.table.name;
    combatState.isOwner = true;
    enterCombatView(tableData);
  } catch (err) { showToast(err.message, true); }
}

async function endCombat(tableId) {
  if (!confirm('¿Terminar el combate?')) return;
  try {
    await api('/tables/' + tableId + '/combat/end', { method: 'POST' });
    showToast('Combate finalizado');
    loadTables();
  } catch (err) { showToast(err.message, true); }
}

// ══════════════════════════════════════
//  COMBAT VIEW
// ══════════════════════════════════════
function enterCombatView(data) {
  showScreen('combat');
  const combat = data.combat;
  combatState.turnOrder = combat.turn_order || [];
  combatState.currentTurn = combat.current_turn;
  combatState.currentRound = combat.current_round;
  combatState.log = data.log || [];

  // Find my character in this table
  const myPlayer = data.players.find(p => p.user_id === currentUser.id);
  combatState.myCharacterId = myPlayer ? myPlayer.character_id : null;

  // Build HP status from players
  combatState.hpStatus = data.players.map(p => ({
    character_id: p.character_id,
    name: p.character_name,
    user_id: p.user_id,
    hpCurr: p.character_data.hpCurr || 0,
    hpMax: p.character_data.hpMax || 1,
    ac: parseInt(p.character_data.ac) || 10,
    attacks: p.character_data.attacks || [],
  }));

  renderCombatView();
  startCombatPolling();
}

function renderCombatView() {
  document.getElementById('combatTableName').textContent = '⚔ ' + combatState.tableName;
  document.getElementById('combatRound').textContent = 'Ronda ' + combatState.currentRound;

  // Initiative tracker
  const tracker = document.getElementById('initTracker');
  tracker.innerHTML = combatState.turnOrder.map((t, i) => {
    const hp = combatState.hpStatus.find(h => h.character_id === t.character_id);
    const isCurrent = i === combatState.currentTurn;
    const isDown = hp && hp.hpCurr <= 0;
    return `<div class="init-token${isCurrent ? ' current' : ''}${isDown ? ' down' : ''}">
      <div class="init-token-name">${t.character_name}</div>
      <div class="init-token-hp">${hp ? hp.hpCurr + '/' + hp.hpMax : '?'}</div>
      <div class="init-token-init">Init: ${t.total}</div>
    </div>`;
  }).join('');

  // Whose turn?
  const current = combatState.turnOrder[combatState.currentTurn];
  if (!current) return;
  const isMyTurn = current.user_id === currentUser.id;

  document.getElementById('combatTurnName').textContent = current.character_name;
  document.getElementById('combatMyTurnArea').style.display = isMyTurn ? 'block' : 'none';
  document.getElementById('combatWaiting').style.display = isMyTurn ? 'none' : 'block';

  if (isMyTurn) {
    renderTargets();
    renderWeapons();
  }

  renderCombatLog();
}

function renderTargets() {
  const list = document.getElementById('targetList');
  const targets = combatState.hpStatus.filter(h => h.character_id !== combatState.myCharacterId && h.hpCurr > 0);
  list.innerHTML = targets.map(t => {
    const pct = Math.max(0, (t.hpCurr / t.hpMax) * 100);
    const sel = combatState.selectedTarget === t.character_id;
    return `<div class="target-item${sel ? ' selected' : ''}" onclick="selectTarget(${t.character_id})">
      <div><div class="target-name">${t.name}</div><div class="target-ac">CA ${t.ac}</div></div>
      <div style="text-align:right;">
        <div style="font-size:12px;color:var(--muted);">${t.hpCurr}/${t.hpMax}</div>
        <div class="target-hp-bar"><div class="target-hp-fill" style="width:${pct}%;${pct < 25 ? 'background:var(--red2);' : pct < 50 ? 'background:var(--gold);' : ''}"></div></div>
      </div>
    </div>`;
  }).join('');
  if (targets.length === 0) list.innerHTML = '<div style="color:var(--muted);font-style:italic;padding:8px;">No hay objetivos disponibles</div>';
}

function renderWeapons() {
  const me = combatState.hpStatus.find(h => h.character_id === combatState.myCharacterId);
  const weapons = me ? me.attacks : [];
  const select = document.getElementById('weaponSelect');
  if (weapons.length === 0) {
    select.innerHTML = '<div class="weapon-option selected"><div class="weapon-name">Ataque sin arma</div><div class="weapon-stats">+0 · 1d4</div></div>';
    return;
  }
  select.innerHTML = weapons.map((w, i) => `
    <div class="weapon-option${combatState.selectedWeapon === i ? ' selected' : ''}" onclick="selectWeapon(${i})">
      <div class="weapon-name">${w.name}</div>
      <div class="weapon-stats">${w.bonus} · ${w.dmg}</div>
    </div>
  `).join('');
}

function selectTarget(charId) {
  combatState.selectedTarget = charId;
  renderTargets();
  document.getElementById('attackBtn').disabled = false;
}

function selectWeapon(idx) {
  combatState.selectedWeapon = idx;
  renderWeapons();
}

async function performAttack() {
  if (!combatState.selectedTarget) { showToast('Seleccioná un objetivo', true); return; }
  const btn = document.getElementById('attackBtn');
  btn.disabled = true;
  btn.textContent = 'Atacando...';
  try {
    const data = await api('/tables/' + combatState.tableId + '/combat/attack', {
      method: 'POST',
      body: JSON.stringify({
        defender_character_id: combatState.selectedTarget,
        attack_index: combatState.selectedWeapon
      })
    });
    showAttackResult(data.result);
    // Update HP
    if (data.result.hits && data.result.defender_hp_remaining !== null) {
      const hp = combatState.hpStatus.find(h => h.character_id === combatState.selectedTarget);
      if (hp) hp.hpCurr = data.result.defender_hp_remaining;
    }
    // Check if combat ended
    if (data.combat_ended) {
      if (combatPollInterval) { clearInterval(combatPollInterval); combatPollInterval = null; }
      setTimeout(function() {
        var msg = '¡Combate terminado!';
        if (data.winner) msg += ' Ganador: ' + data.winner;
        alert(msg);
        showScreen('lobby');
        loadTables();
        loadPublicTables();
      }, 2000);
    } else {
      combatState.currentTurn = data.next_turn.turn_index;
      combatState.currentRound = data.next_turn.round;
      combatState.selectedTarget = null;
      combatState.selectedWeapon = 0;
      renderCombatView();
    }
  } catch (err) { showToast(err.message, true); }
  btn.disabled = false;
  btn.textContent = '⚔ Atacar';
}

function showAttackResult(r) {
  const splash = document.getElementById('attackSplash');
  const cls = r.is_crit ? 'crit' : (r.hits ? 'hit' : 'miss');
  splash.className = 'attack-result-splash show ' + cls;
  let html = `<div class="splash-detail">${r.attacker} → ${r.defender} (${r.weapon})</div>`;
  html += `<div class="splash-roll ${cls}">${r.attack_total}</div>`;
  html += `<div class="splash-detail">d20(${r.attack_roll}) + ${r.attack_bonus} vs CA ${r.defender_ac}</div>`;
  if (r.is_crit) html += '<div style="color:var(--gold2);font-family:Cinzel,serif;letter-spacing:3px;margin-top:4px;">✦ CRÍTICO ✦</div>';
  if (r.is_fumble) html += '<div style="color:var(--red2);font-family:Cinzel,serif;letter-spacing:3px;margin-top:4px;">✖ PIFIA ✖</div>';
  if (r.hits && r.damage) {
    html += `<div class="splash-damage">−${r.damage.total} HP</div>`;
    html += `<div class="splash-detail">${r.damage.formula} = ${r.damage.total}</div>`;
    if (r.defender_down) html += '<div style="color:var(--red2);font-family:Cinzel,serif;font-size:14px;margin-top:8px;letter-spacing:2px;">☠ CAÍDO ☠</div>';
  }
  if (!r.hits) html += '<div class="splash-label" style="margin-top:8px;">Falla</div>';
  splash.innerHTML = html;
  setTimeout(() => { splash.className = 'attack-result-splash'; }, 5000);
}

async function passTurn() {
  try {
    const data = await api('/tables/' + combatState.tableId + '/combat/pass', { method: 'POST' });
    combatState.currentTurn = data.next_turn.turn_index;
    combatState.currentRound = data.next_turn.round;
    renderCombatView();
  } catch (err) { showToast(err.message, true); }
}

function renderCombatLog() {
  const logEl = document.getElementById('combatLog');
  logEl.innerHTML = combatState.log.map(l => {
    const cls = l.hit ? (l.attack_roll === 20 ? 'crit' : 'hit') : 'miss';
    let txt = `<span class="log-attacker">${l.attacker_name}</span> → <span class="log-defender">${l.defender_name}</span>: `;
    txt += `d20(${l.attack_roll})+${l.attack_bonus}=${l.attack_total} vs CA${l.defender_ac} `;
    if (l.hit) {
      txt += `<span class="log-damage">→ ${l.damage_total} daño</span>`;
      if (l.attack_roll === 20) txt += ' ✦CRIT';
    } else {
      txt += '<span class="log-miss-text">→ Falla</span>';
    }
    return `<div class="log-entry ${cls}">${txt}</div>`;
  }).join('');
}

// Polling para actualizar el estado del combate
function startCombatPolling() {
  if (combatPollInterval) clearInterval(combatPollInterval);
  combatPollInterval = setInterval(async () => {
    try {
      const data = await api('/tables/' + combatState.tableId);
      if (data.table.status !== 'combat' || !data.combat || data.combat.status !== 'active') {
        clearInterval(combatPollInterval);
        combatPollInterval = null;
        showToast('Combate finalizado');
        showScreen('lobby');
        loadTables();
        return;
      }
      combatState.turnOrder = data.combat.turn_order || [];
      combatState.currentTurn = data.combat.current_turn;
      combatState.currentRound = data.combat.current_round;
      combatState.log = data.log || [];
      combatState.hpStatus = data.players.map(p => ({
        character_id: p.character_id,
        name: p.character_name,
        user_id: p.user_id,
        hpCurr: p.character_data.hpCurr || 0,
        hpMax: p.character_data.hpMax || 1,
        ac: parseInt(p.character_data.ac) || 10,
        attacks: p.character_data.attacks || [],
      }));
      renderCombatView();
    } catch (err) { /* silenciar errores de polling */ }
  }, 3000);
}

function leaveCombatView() {
  if (combatPollInterval) { clearInterval(combatPollInterval); combatPollInterval = null; }
  showScreen('lobby');
  loadTables();
}

// ══════════════════════════════════════
//  CHARACTER SHEET LOGIC (original)
// ══════════════════════════════════════
const STAT_NAMES={str:'Fuerza',dex:'Destreza',con:'Constitución',int:'Inteligencia',wis:'Sabiduría',cha:'Carisma'};
const SAVES=[{key:'str',label:'Fuerza'},{key:'dex',label:'Destreza'},{key:'con',label:'Constitución'},{key:'int',label:'Inteligencia'},{key:'wis',label:'Sabiduría'},{key:'cha',label:'Carisma'}];
const SKILLS=[
  {key:'acrobatics',label:'Acrobacias',stat:'dex'},{key:'animalHandling',label:'T. con Animales',stat:'wis'},
  {key:'arcana',label:'C. Arcano',stat:'int'},{key:'athletics',label:'Atletismo',stat:'str'},
  {key:'deception',label:'Engaño',stat:'cha'},{key:'history',label:'Historia',stat:'int'},
  {key:'insight',label:'Perspicacia',stat:'wis'},{key:'intimidation',label:'Intimidación',stat:'cha'},
  {key:'investigation',label:'Investigación',stat:'int'},{key:'medicine',label:'Medicina',stat:'wis'},
  {key:'nature',label:'Naturaleza',stat:'int'},{key:'perception',label:'Percepción',stat:'wis'},
  {key:'performance',label:'Interpretación',stat:'cha'},{key:'persuasion',label:'Persuasión',stat:'cha'},
  {key:'religion',label:'Religión',stat:'int'},{key:'sleightOfHand',label:'Juego de Manos',stat:'dex'},
  {key:'stealth',label:'Sigilo',stat:'dex'},{key:'survival',label:'Supervivencia',stat:'wis'},
];

function mod(s){return Math.floor((s-10)/2);}
function fmt(v){return v>=0?'+'+v:''+v;}

function renderStats(){
  const g=document.getElementById('statsGrid'); g.innerHTML='';
  for(const[key,val]of Object.entries(state.stats)){
    const capped=val>=20; const m=mod(val); const mc=m>0?'plus':(m<0?'neg':'');
    g.innerHTML+=`<div class="stat-box${capped?' capped':''}"><div class="stat-name">${STAT_NAMES[key]}</div><div class="stat-mod ${mc}${capped?' capped':''}">${fmt(m)}</div><div class="stat-score">${state.editMode?`<input type="number" min="1" max="20" value="${val}" onchange="updateStat('${key}',this.value)" style="width:48px;text-align:center;background:#0a0805;border:1px solid var(--gold);border-radius:4px;color:var(--text);font-size:13px;padding:2px;outline:none;">`:val+(capped?' ★':'')}</div></div>`;
  }
}
function renderSaves(){
  const el=document.getElementById('savesList'); el.innerHTML='';
  for(const s of SAVES){ const prof=state.savingThrowProf.includes(s.key); const t=mod(state.stats[s.key])+(prof?state.profBonus:0); const c=t>0?'pos':(t<0?'neg':'');
    const clickHandler=state.editMode?` onclick="toggleSaveProf('${s.key}')" style="cursor:pointer;"`:' style="cursor:default;"';
    el.innerHTML+=`<div class="save-item ${prof?'proficient':''}"${clickHandler}><div class="save-check"></div><span class="save-val ${c}">${fmt(t)}</span><span class="save-name">${s.label}</span>${state.editMode?'<span style="font-size:9px;color:var(--muted);margin-left:auto;">click para toggle</span>':''}</div>`;
  }
}
function renderSkills(){
  const el=document.getElementById('skillsList'); el.innerHTML='';
  for(const sk of SKILLS){ const prof=state.skillProf.includes(sk.key); const exp=state.skillExpertise.includes(sk.key); const bonus=exp?state.profBonus*2:(prof?state.profBonus:0); const t=mod(state.stats[sk.stat])+bonus; const c=t>0?'pos':(t<0?'neg':''); const ic=exp?'expertise':(prof?'proficient':'');
    const clickHandler=state.editMode?` onclick="toggleSkillProf('${sk.key}')" style="cursor:pointer;"`:' style="cursor:default;"';
    const tag=exp?'<span style="font-size:8px;color:var(--accent2);margin-left:auto;">EXP</span>':(prof&&state.editMode?'<span style="font-size:8px;color:var(--gold);margin-left:auto;">PROF</span>':'');
    el.innerHTML+=`<div class="skill-item ${ic}"${clickHandler}><div class="skill-dot"></div><span class="skill-val ${c}">${fmt(t)}</span><span class="skill-name">${sk.label}</span><span class="skill-attr">${sk.stat.substring(0,3).toUpperCase()}</span>${state.editMode?tag:''}</div>`;
  }
  const pb=mod(state.stats.wis)+(state.skillProf.includes('perception')?state.profBonus:0);
  document.getElementById('passivePerc').textContent='Percepción Pasiva: '+(10+pb);
}
function renderAttacks(){
  const el=document.getElementById('attacksList'); el.innerHTML='';
  const inpStyle='background:#0a0805;border:1px solid var(--gold);border-radius:4px;color:var(--text);font-family:"Cinzel",serif;font-size:12px;padding:3px 5px;width:100%;outline:none;';
  state.attacks.forEach((atk,i)=>{
    el.innerHTML+=`<div class="attack-row ${state.editMode?'edit':'view'}"><div class="attack-name">${state.editMode?`<input value="${atk.name}" onchange="state.attacks[${i}].name=this.value" style="${inpStyle}">`:atk.name}</div><div class="attack-bonus" style="text-align:center;">${state.editMode?`<input value="${atk.bonus}" onchange="state.attacks[${i}].bonus=this.value" style="width:46px;text-align:center;${inpStyle}">`:atk.bonus}</div><div class="attack-dmg">${state.editMode?`<input value="${atk.dmg}" onchange="state.attacks[${i}].dmg=this.value" style="${inpStyle}">`:atk.dmg}</div>${state.editMode?`<button class="del-btn" onclick="delAttack(${i})">✕</button>`:''}</div>`;
  });
}
function renderInventory(){
  const el=document.getElementById('invList'); el.innerHTML='';
  const inpStyle='flex:1;background:#0a0805;border:1px solid var(--gold);border-radius:4px;color:var(--text);font-family:"Crimson Text",serif;font-size:14px;padding:3px 6px;outline:none;';
  state.inventory.forEach((item,i)=>{
    el.innerHTML+=`<div class="inv-item"><span class="inv-bullet">◆</span>${state.editMode?`<input value="${item}" onchange="state.inventory[${i}]=this.value" style="${inpStyle}"><button class="del-btn" onclick="delInvItem(${i})">✕</button>`:`<span class="inv-name">${item}</span>`}</div>`;
  });
}
function renderSpellMeta(){
  const abilityKey=state.spellAbilityKey||'int'; const abilityMod=mod(state.stats[abilityKey]); const saveDC=8+abilityMod+state.profBonus; const atkBonus=abilityMod+state.profBonus;
  const dcEl=document.getElementById('spellSaveDC'); const atkEl=document.getElementById('spellAttackBonus');
  if(dcEl) dcEl.textContent=saveDC; if(atkEl) atkEl.textContent=fmt(atkBonus);
}
function renderSpells(){
  const el=document.getElementById('spellLevels'); if(!el)return; el.innerHTML=''; renderSpellMeta();
  const lnames=['Trucos','Nivel 1','Nivel 2','Nivel 3','Nivel 4','Nivel 5','Nivel 6','Nivel 7','Nivel 8','Nivel 9'];
  const inpStyle='flex:1;background:var(--surface-dim,#111010);border:none;border-bottom:1px solid var(--tertiary-container,#4c2a8c);color:var(--on-surface,#e8e1dd);font-family:Crimson Text,serif;font-size:15px;padding:4px 6px;outline:none;';
  const slotInpStyle='width:34px;text-align:center;background:var(--surface-dim,#111010);border:none;border-bottom:1px solid var(--tertiary-container,#4c2a8c);color:var(--on-surface,#e8e1dd);font-size:12px;padding:2px;outline:none;';

  for(let lvl=0;lvl<=9;lvl++){
    // Asegurar que el nivel existe
    if(!state.spells[lvl]){
      state.spells[lvl] = {slots:0, used:0, list:[], prep:[]};
    }
    const d = state.spells[lvl];
    if(!d.list) d.list = [];
    if(!d.prep) d.prep = d.list.map(()=>false);
    // Sync prep length with list
    while(d.prep.length < d.list.length) d.prep.push(false);

    // En modo vista: ocultar niveles vacíos (3+) sin slots
    const hasContent = d.list.some(s=>s && s.trim());
    if(!state.editMode && lvl > 2 && !hasContent && d.slots === 0) continue;

    // Slots de nivel (bolitas gastables)
    let slotsHTML = '';
    if(lvl > 0 && d.slots > 0){
      let dots = '';
      for(let i=0;i<d.slots;i++){
        dots += '<div class="spell-slot '+(i<d.used?'used':'')+'" onclick="toggleSlot('+lvl+','+i+')"></div>';
      }
      slotsHTML = '<div class="spell-slots-row">'+dots+'<span class="spell-slots-label">'+d.used+'/'+d.slots+'</span></div>';
    }

    // Slot count editor (solo en edit mode, solo niveles 1+)
    let slotEditor = '';
    if(state.editMode && lvl > 0){
      slotEditor = '<input type="number" min="0" max="9" value="'+d.slots+'" onchange="state.spells['+lvl+'].slots=+this.value;renderSpells()" style="'+slotInpStyle+'">';
    }

    // Lista de conjuros
    let listHTML = '';
    d.list.forEach(function(sp, i){
      // En modo vista, no mostrar vacíos
      if(!state.editMode && (!sp || !sp.trim())) return;
      const isPrepared = d.prep[i] || false;
      let entry = '<div class="spell-entry">';
      // Dot de preparado (TODOS los niveles, incluido trucos)
      entry += '<div class="spell-dot '+(isPrepared?'prepared':'')+'" onclick="togglePrepared('+lvl+','+i+')" title="'+(isPrepared?'Preparado':'Sin preparar')+'"></div>';
      if(state.editMode){
        entry += '<input value="'+(sp||'').replace(/"/g,'&quot;')+'" placeholder="Nombre del conjuro..." onchange="state.spells['+lvl+'].list['+i+']=this.value" style="'+inpStyle+'">';
        entry += '<button class="del-btn" onclick="removeSpell('+lvl+','+i+')" style="margin-left:4px;">✕</button>';
      } else {
        entry += '<span class="spell-name">'+sp+'</span>';
      }
      entry += '</div>';
      listHTML += entry;
    });

    // Si no hay nada y no estamos editando
    if(!listHTML && !state.editMode){
      listHTML = '<span style="color:var(--on-surface-muted,#7a6f63);font-size:13px;font-style:italic;">Sin conjuros</span>';
    }

    // Botón agregar (siempre en edit mode)
    let addBtn = '';
    if(state.editMode){
      addBtn = '<button class="add-btn" onclick="addSpell('+lvl+')" style="margin-top:4px;">+ Agregar '+(lvl===0?'truco':'conjuro')+'</button>';
    }

    el.innerHTML += '<div class="spell-level-block">' +
      '<div class="spell-level-header">' +
        '<span class="spell-level-num">'+lvl+'</span>' +
        '<span class="spell-level-title">'+lnames[lvl]+'</span>' +
        slotsHTML + slotEditor +
      '</div>' +
      '<div class="spell-list">' + listHTML + addBtn + '</div>' +
    '</div>';
  }
}
function renderHP(){
  const hpCurrEl=document.getElementById('hpCurr');
  const hpMaxEl=document.getElementById('hpMax');
  const hpTempEl=document.getElementById('hpTemp');
  const hpInpStyle='width:48px;text-align:center;background:#0a0805;border:1px solid var(--gold);border-radius:4px;color:var(--text);font-family:Cinzel,serif;font-size:13px;padding:2px;outline:none;';
  if(state.editMode){
    hpCurrEl.innerHTML=`<input type="number" min="0" value="${state.hpCurr}" onchange="state.hpCurr=Math.max(0,+this.value);renderHP();" style="${hpInpStyle}">`;
    hpMaxEl.innerHTML=`<input type="number" min="1" value="${state.hpMax}" onchange="state.hpMax=Math.max(1,+this.value);state.hpCurr=Math.min(state.hpCurr,state.hpMax);renderHP();" style="${hpInpStyle}">`;
    hpTempEl.innerHTML=`<input type="number" min="0" value="${state.hpTemp}" onchange="state.hpTemp=Math.max(0,+this.value);" style="${hpInpStyle}">`;
  }else{
    hpCurrEl.textContent=state.hpCurr;
    hpMaxEl.textContent=state.hpMax;
    hpTempEl.textContent=state.hpTemp;
  }
  const pct=Math.max(0,Math.min(100,(state.hpCurr/state.hpMax)*100)); const bar=document.getElementById('hpBar');
  bar.style.width=pct+'%'; bar.style.background=pct>50?'linear-gradient(90deg,var(--hp-green),var(--hp-green2))':pct>25?'linear-gradient(90deg,#7a6020,var(--gold))':'linear-gradient(90deg,var(--red),var(--red2))';
}

let textFields={};
function renderEditableFields(){
  document.querySelectorAll('#appWrapper [data-field]').forEach(el=>{
    if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')return;
    const key=el.getAttribute('data-field');
    if(!textFields[key])textFields[key]=el.textContent.trim();
    const val=textFields[key];
    if(state.editMode){
      const multi=el.classList.contains('text-block');
      if(multi){ const ta=document.createElement('textarea'); ta.value=val; ta.className='ei'; ta.style.cssText+='resize:vertical;min-height:60px;'; ta.addEventListener('input',()=>{textFields[key]=ta.value;}); el.innerHTML=''; el.appendChild(ta); }
      else{ const inp=document.createElement('input'); inp.value=val; inp.className='ei sm'; inp.addEventListener('input',()=>{ textFields[key]=inp.value; if(key==='charName')document.getElementById('headerName').textContent=inp.value.split('(')[0].trim(); }); el.innerHTML=''; el.appendChild(inp); }
    }else{
      el.textContent=val;
      if(key==='charName')document.getElementById('headerName').textContent=val.split('(')[0].trim();
    }
  });
}

function renderAll(){
  renderStats(); renderSaves(); renderSkills(); renderAttacks(); renderInventory(); renderSpells(); renderHP(); renderEditableFields(); renderSpellMeta(); renderDiceGrid();
  const profEl=document.getElementById('profBonusDisp');
  if(state.editMode){
    profEl.innerHTML=`<input type="number" min="1" max="10" value="${state.profBonus}" onchange="state.profBonus=Math.max(1,Math.min(10,+this.value));renderAll();" style="width:42px;text-align:center;background:var(--surface-dim);border:none;border-bottom:1px solid var(--primary-dim);color:var(--primary);font-family:Cinzel,serif;font-size:18px;padding:2px;outline:none;">`;
  }else{
    profEl.textContent=fmt(state.profBonus);
  }
  // Shield toggle state
  var shEl=document.getElementById('shieldToggle');
  if(shEl){
    shEl.textContent=state.hasShield?'Escudo ✓':'Escudo ✗';
    shEl.style.background=state.hasShield?'var(--tertiary-container,#4c2a8c)':'';
  }
}

// Interactions
function toggleEdit(){
  if(state.editMode) saveCharacter(); // Auto-save on exit edit mode
  state.editMode=!state.editMode;
  const btn=document.getElementById('editToggle'); btn.textContent=state.editMode?'GUARDAR':'EDITAR'; btn.classList.toggle('active',state.editMode);
  renderAll();
}
function switchTab(name,btn){ document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); document.getElementById('tab-'+name).classList.add('active'); btn.classList.add('active'); }
function switchSub(name,btn){ document.querySelectorAll('.sub-content').forEach(t=>t.classList.remove('active')); document.querySelectorAll('.sub-tab-btn').forEach(b=>b.classList.remove('active')); document.getElementById('sub-'+name).classList.add('active'); btn.classList.add('active'); }
function toggleInspiration(){ state.inspiration=!state.inspiration; document.getElementById('inspBox').classList.toggle('lit',state.inspiration); document.getElementById('inspVal').textContent=state.inspiration?'✦':'—'; }
function toggleShield(){
  state.hasShield=!state.hasShield;
  var el=document.getElementById('shieldToggle');
  if(el){
    el.textContent=state.hasShield?'Escudo ✓':'Escudo ✗';
    el.style.background=state.hasShield?'var(--tertiary-container,#4c2a8c)':'';
  }
}
function toggleDS(idx){ state.deathSaves[idx]=!state.deathSaves[idx]; const id=idx<3?'ds'+idx:'df'+(idx-3); document.getElementById(id).classList.toggle('filled',state.deathSaves[idx]); }
function updateStat(key,val){ let v=Math.max(1,Math.min(20,parseInt(val)||1)); state.stats[key]=v; renderStats(); renderSaves(); renderSkills(); }
function toggleSaveProf(key){
  const idx=state.savingThrowProf.indexOf(key);
  if(idx===-1) state.savingThrowProf.push(key);
  else state.savingThrowProf.splice(idx,1);
  renderSaves();
}
function toggleSkillProf(key){
  const isProf=state.skillProf.includes(key);
  const isExp=state.skillExpertise.includes(key);
  if(!isProf&&!isExp){
    // nada → proficiente
    state.skillProf.push(key);
  }else if(isProf&&!isExp){
    // proficiente → expertise
    state.skillExpertise.push(key);
  }else{
    // expertise → nada
    state.skillProf=state.skillProf.filter(k=>k!==key);
    state.skillExpertise=state.skillExpertise.filter(k=>k!==key);
  }
  renderSkills();
}
function changeHP(dir){ const inp=document.getElementById('hpChange'); const amt=parseInt(inp.value)||0; if(amt<=0)return; state.hpCurr=Math.max(0,Math.min(state.hpMax,state.hpCurr+dir*amt)); inp.value=''; renderHP(); }
function toggleSlot(lvl,idx){ const d=state.spells[lvl]; d.used=idx<d.used?idx:idx+1; renderSpells(); }
function addAttack(){ state.attacks.push({name:'Nueva arma',bonus:'+0',dmg:'1d6'}); renderAttacks(); }
function delAttack(i){ state.attacks.splice(i,1); renderAttacks(); }
function addInvItem(){ state.inventory.push('Nuevo objeto'); renderInventory(); }
function delInvItem(i){ state.inventory.splice(i,1); renderInventory(); }
function togglePrepared(lvl,idx){ if(!state.spells[lvl].prep) state.spells[lvl].prep=state.spells[lvl].list.map(()=>false); state.spells[lvl].prep[idx]=!state.spells[lvl].prep[idx]; renderSpells(); }
function addSpell(lvl){
  if(!state.spells[lvl]) return;
  state.spells[lvl].list.push('');
  state.spells[lvl].prep.push(false);
  renderSpells();
}
function removeSpell(lvl,idx){
  if(!state.spells[lvl]) return;
  state.spells[lvl].list.splice(idx,1);
  state.spells[lvl].prep.splice(idx,1);
  renderSpells();
}

// ══════════════════════════════════════
//  DICE (original)
// ══════════════════════════════════════
const DICE=[2,4,6,8,10,12,20,100];
function dieSVG(faces,selected){
  const col=selected?'#e8c96a':'#6b5240';
  const s={
    2:`<ellipse cx="22" cy="22" rx="10" ry="18" fill="none" stroke="${col}" stroke-width="2"/><line x1="22" y1="4" x2="22" y2="40" stroke="${col}" stroke-width="1.5" stroke-dasharray="3,2"/>`,
    4:`<polygon points="22,4 40,38 4,38" fill="none" stroke="${col}" stroke-width="2"/><line x1="22" y1="4" x2="22" y2="38" stroke="${col}" stroke-width="1" opacity=".4"/>`,
    6:`<rect x="5" y="5" width="34" height="34" rx="5" fill="none" stroke="${col}" stroke-width="2"/>`,
    8:`<polygon points="22,3 40,22 22,41 4,22" fill="none" stroke="${col}" stroke-width="2"/><line x1="4" y1="22" x2="40" y2="22" stroke="${col}" stroke-width="1" opacity=".4"/>`,
    10:`<polygon points="22,3 38,15 32,36 12,36 6,15" fill="none" stroke="${col}" stroke-width="2"/><line x1="22" y1="3" x2="22" y2="36" stroke="${col}" stroke-width="1" opacity=".4"/>`,
    12:`<polygon points="22,3 36,10 40,26 30,40 14,40 4,26 8,10" fill="none" stroke="${col}" stroke-width="2"/>`,
    20:`<polygon points="22,3 40,14 40,32 22,42 4,32 4,14" fill="none" stroke="${col}" stroke-width="2"/><line x1="4" y1="14" x2="40" y2="14" stroke="${col}" stroke-width="1" opacity=".4"/><line x1="4" y1="32" x2="40" y2="32" stroke="${col}" stroke-width="1" opacity=".4"/>`,
    100:`<circle cx="22" cy="22" r="18" fill="none" stroke="${col}" stroke-width="2"/><circle cx="22" cy="22" r="11" fill="none" stroke="${col}" stroke-width="1" opacity=".5"/><text x="22" y="26" text-anchor="middle" font-family="Cinzel,serif" font-size="9" fill="${col}">%</text>`,
  };
  return`<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">${s[faces]||''}</svg>`;
}
const diceState={selected:null,qty:1,history:[],advMode:null};
function renderDiceGrid(){
  const grid=document.getElementById('diceGrid'); if(!grid)return; grid.innerHTML='';
  DICE.forEach(function(d){ const sel=diceState.selected===d; const btn=document.createElement('button'); btn.className='die-btn'+(sel?' selected':'');
    btn.innerHTML=`<div class="die-selected-badge"></div><div class="die-icon">${dieSVG(d,sel)}</div><div class="die-label">d${d}</div>`;
    btn.addEventListener('click',function(){selectDie(d);}); grid.appendChild(btn);
  });
  const rollBtn=document.getElementById('rollBtn'); if(rollBtn)rollBtn.disabled=diceState.selected===null;
}
function selectDie(faces){ diceState.selected=diceState.selected===faces?null:faces; renderDiceGrid(); }
function changeQty(delta){ diceState.qty=Math.max(1,Math.min(20,diceState.qty+delta)); const el=document.getElementById('diceQty'); if(el)el.textContent=diceState.qty; }
function toggleAdvDis(mode){
  diceState.advMode=diceState.advMode===mode?null:mode;
  const advBtn=document.getElementById('advBtn'); const disBtn=document.getElementById('disBtn'); const note=document.getElementById('advNote');
  if(advBtn) advBtn.className='adv-btn'+(diceState.advMode==='advantage'?' adv-active':'');
  if(disBtn) disBtn.className='adv-btn'+(diceState.advMode==='disadvantage'?' dis-active':'');
  if(note){ if(diceState.advMode==='advantage'){note.textContent='Se lanzan 2 dados — se toma el mayor';note.style.display='block';}else if(diceState.advMode==='disadvantage'){note.textContent='Se lanzan 2 dados — se toma el menor';note.style.display='block';}else{note.style.display='none';} }
}
function rollDice(){
  const faces=diceState.selected; if(!faces)return;
  const modRaw=parseInt(document.getElementById('diceMod').value)||0; const advMode=diceState.advMode;
  if(advMode){
    const qty=diceState.qty;
    const rollA=Array.from({length:qty},function(){return Math.floor(Math.random()*faces)+1;});
    const rollB=Array.from({length:qty},function(){return Math.floor(Math.random()*faces)+1;});
    const sumA=rollA.reduce(function(a,b){return a+b;},0)+modRaw; const sumB=rollB.reduce(function(a,b){return a+b;},0)+modRaw;
    const isAdv=advMode==='advantage'; const winnerIsA=isAdv?(sumA>=sumB):(sumA<=sumB); const finalVal=winnerIsA?sumA:sumB;
    const formula=qty+'d'+faces+(modRaw!==0?(modRaw>0?' + '+modRaw:' − '+Math.abs(modRaw)):'');
    function chipsHTML(rolls){return rolls.map(function(r){const cls=r===faces?'max':(r===1?'min':'');return'<div class="result-die-chip '+cls+'" style="font-size:14px;padding:4px 8px;">'+r+'</div>';}).join('');}
    function blockHTML(rolls,total,isWinner){const disWin=!isAdv&&isWinner;return'<div class="adv-die-block'+(isWinner?' winner'+(disWin?' dis-win':''):' loser')+'">'+(isWinner?'<span class="adv-crown">'+(isAdv?'▲':'▼')+'</span>':'<span class="adv-crown" style="opacity:0">▲</span>')+'<div class="adv-block-label">Tirada '+(rolls===rollA?'A':'B')+'</div><div class="adv-block-dice">'+chipsHTML(rolls)+'</div>'+(modRaw!==0?'<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">'+(modRaw>0?'+':'')+modRaw+'</div>':'')+'<div class="adv-block-total">'+total+'</div></div>';}
    const modeLabel=isAdv?'VENTAJA':'DESVENTAJA'; const area=document.getElementById('diceResultArea');
    area.innerHTML='<div class="result-formula">'+formula+' — '+modeLabel+'</div><div class="adv-results-row">'+blockHTML(rollA,sumA,winnerIsA)+blockHTML(rollB,sumB,!winnerIsA)+'</div><div class="result-divider"></div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Resultado final</div><div class="result-total'+(isAdv?' critical':' fumble')+'" style="font-size:42px;">'+finalVal+'</div>';
    diceState.history.unshift({formula:formula+' ('+modeLabel+')',rolls:[sumA-modRaw,sumB-modRaw],modRaw:modRaw,total:finalVal});
    if(diceState.history.length>8)diceState.history.pop(); renderHistory(); return;
  }
  const qty=diceState.qty; const rolls=Array.from({length:qty},function(){return Math.floor(Math.random()*faces)+1;}); const sum=rolls.reduce(function(a,b){return a+b;},0); const total=sum+modRaw;
  const isCrit=qty===1&&rolls[0]===faces; const isFumble=qty===1&&rolls[0]===1;
  const modStr=modRaw!==0?(modRaw>0?' + '+modRaw:' − '+Math.abs(modRaw)):''; const formula=qty+'d'+faces+modStr;
  const chips=rolls.map(function(r){const cls=r===faces?'max':(r===1?'min':'');return'<div class="result-die-chip '+cls+'">'+r+'</div>';}).join('');
  var breakdown=''; if(qty>1||modRaw!==0){var rollStr=rolls.join(' + ');breakdown=modRaw!==0?'('+rollStr+') '+(modRaw>=0?'+':'−')+' '+Math.abs(modRaw):rollStr;}
  const area=document.getElementById('diceResultArea'); if(!area)return;
  area.innerHTML='<div class="result-formula">'+formula+'</div><div class="result-dice-row">'+chips+'</div>'+(breakdown?'<div class="result-divider"></div><div class="result-breakdown">'+breakdown+'</div>':'')+'<div class="result-total'+(isCrit?' critical':'')+(isFumble?' fumble':'')+'">'+total+'</div>'+(isCrit?'<div style="color:var(--gold2);font-size:12px;margin-top:6px;font-family:\'Cinzel\',serif;letter-spacing:3px;">✦ CRÍTICO ✦</div>':'')+(isFumble?'<div style="color:var(--red2);font-size:12px;margin-top:6px;font-family:\'Cinzel\',serif;letter-spacing:3px;">✖ PIFIA ✖</div>':'');
  diceState.history.unshift({formula:formula,rolls:rolls,modRaw:modRaw,total:total}); if(diceState.history.length>8)diceState.history.pop(); renderHistory();
}
function renderHistory(){
  const hist=document.getElementById('diceHistory'); const card=document.getElementById('historyCard'); if(!hist||!card)return;
  if(diceState.history.length===0){card.style.display='none';return;} card.style.display='block';
  hist.innerHTML=diceState.history.map(function(h,i){const rollsStr=h.rolls.length>1?' ['+h.rolls.join(', ')+']':'';return'<div class="history-item" style="'+(i===0?'':'opacity:.5;')+'"><span>'+h.formula+rollsStr+'</span><span class="history-total" style="'+(i===0?'color:var(--gold2)':'')+'">'+h.total+'</span></div>';}).join('');
}
function clearHistory(){ diceState.history=[]; renderHistory(); }

// ══════════════════════════════════════
//  INIT — check stored token
// ══════════════════════════════════════
(function init(){
  const token = localStorage.getItem('dnd_token');
  const user = localStorage.getItem('dnd_user');
  if (token && user) {
    currentToken = token;
    currentUser = JSON.parse(user);
    // Verify token is still valid
    api('/auth/me').then(data => {
      currentUser = data.user;
      enterLobby();
    }).catch(() => {
      logout();
    });
  } else {
    showScreen('auth');
  }
})();

// ══════════════════════════════════════
//  COMBAT MODES: Auto / Manual / Spell
// ══════════════════════════════════════
let combatMode = 'auto';
let manualDmgDie = null;
let manualDmgQty = 1;
let spellSaveStat = null;
let spellDmgDie = null;
let spellDmgQty = 1;

function setCombatMode(mode) {
  combatMode = mode;
  document.getElementById('modeAutoBtn').className = 'adv-btn' + (mode === 'auto' ? ' adv-active' : '');
  document.getElementById('modeManualBtn').className = 'adv-btn' + (mode === 'manual' ? ' adv-active' : '');
  document.getElementById('modeSpellBtn').className = 'adv-btn' + (mode === 'spell' ? ' adv-active' : '');
  document.getElementById('combatAutoPanel').style.display = mode === 'auto' ? 'block' : 'none';
  document.getElementById('combatManualPanel').style.display = mode === 'manual' ? 'block' : 'none';
  document.getElementById('combatSpellPanel').style.display = mode === 'spell' ? 'block' : 'none';
  // Reset sub-panels
  if (mode === 'manual') {
    document.getElementById('manualDmgPanel').style.display = 'none';
    document.getElementById('manualAtkResult').innerHTML = '<div class="result-empty" style="padding:8px 0;">Seleccioná objetivo y tirá</div>';
    renderManualDmgGrid();
    updateManualAtkBtn();
  }
  if (mode === 'spell') {
    spellSaveStat = null;
    spellSaveOnSuccess = 'none';
    document.getElementById('spellDmgPanel').style.display = 'none';
    document.getElementById('spellSaveResult').innerHTML = '<div class="result-empty" style="padding:8px 0;">Seleccioná objetivo y stat</div>';
    // Auto-set spell DC from character sheet
    var dcDisplay = document.getElementById('spellDCDisplay');
    if (dcDisplay) dcDisplay.textContent = getMySpellDC();
    renderSpellStatBtns();
    renderSpellDmgGrid();
    updateSpellSaveBtn();
    setSpellSaveOnSuccess('none');
  }
}

// ── MANUAL ATTACK ─────────────────────
function updateManualAtkBtn() {
  var btn = document.getElementById('manualAtkRollBtn');
  if (btn) btn.disabled = !combatState.selectedTarget;
}

function rollManualAttack() {
  if (!combatState.selectedTarget) return;
  var modRaw = parseInt(document.getElementById('manualAtkMod').value) || 0;
  var roll = Math.floor(Math.random() * 20) + 1;
  var total = roll + modRaw;
  var isCrit = roll === 20;
  var isFumble = roll === 1;
  var target = combatState.hpStatus.find(function(h) { return h.character_id === combatState.selectedTarget; });
  var targetAC = target ? target.ac : 10;
  var hits = isCrit || (!isFumble && total >= targetAC);

  var area = document.getElementById('manualAtkResult');
  area.innerHTML =
    '<div class="result-formula">d20 + ' + modRaw + ' vs CA ' + targetAC + '</div>' +
    '<div class="result-dice-row"><div class="result-die-chip ' + (isCrit ? 'max' : '') + (isFumble ? 'min' : '') + '">' + roll + '</div></div>' +
    '<div class="result-total' + (isCrit ? ' critical' : '') + (isFumble ? ' fumble' : '') + '" style="font-size:36px;">' + total + '</div>' +
    (isCrit ? '<div style="color:var(--primary);font-size:11px;margin-top:4px;font-family:Cinzel,serif;letter-spacing:3px;">✦ CRÍTICO ✦</div>' : '') +
    (isFumble ? '<div style="color:var(--red-bright,#d94f4f);font-size:11px;margin-top:4px;font-family:Cinzel,serif;letter-spacing:3px;">✖ PIFIA ✖</div>' : '') +
    '<div style="margin-top:8px;font-family:Cinzel,serif;font-size:14px;color:' + (hits ? 'var(--green-bright)' : 'var(--on-surface-muted)') + ';">' + (hits ? '¡IMPACTA!' : 'FALLA') + '</div>';

  if (hits) {
    document.getElementById('manualDmgPanel').style.display = 'block';
  } else {
    document.getElementById('manualDmgPanel').style.display = 'none';
    // Fallo: pasar turno automáticamente después de 1.5s
    setTimeout(function() { passTurn(); }, 1500);
  }
}

function renderManualDmgGrid() {
  var grid = document.getElementById('manualDmgDiceGrid');
  if (!grid) return;
  grid.innerHTML = '';
  DICE.forEach(function(d) {
    var sel = manualDmgDie === d;
    var btn = document.createElement('button');
    btn.className = 'die-btn' + (sel ? ' selected' : '');
    btn.innerHTML = '<div class="die-selected-badge"></div><div class="die-icon">' + dieSVG(d, sel) + '</div><div class="die-label">d' + d + '</div>';
    btn.addEventListener('click', function() {
      manualDmgDie = manualDmgDie === d ? null : d;
      renderManualDmgGrid();
    });
    grid.appendChild(btn);
  });
  var rollBtn = document.getElementById('manualDmgRollBtn');
  if (rollBtn) rollBtn.disabled = manualDmgDie === null;
}

function changeManualDmgQty(delta) {
  manualDmgQty = Math.max(1, Math.min(20, manualDmgQty + delta));
  var el = document.getElementById('manualDmgQty');
  if (el) el.textContent = manualDmgQty;
}

async function rollManualDamage() {
  if (!manualDmgDie || !combatState.selectedTarget) return;
  var modRaw = parseInt(document.getElementById('manualDmgMod').value) || 0;
  var rolls = [];
  for (var i = 0; i < manualDmgQty; i++) rolls.push(Math.floor(Math.random() * manualDmgDie) + 1);
  var sum = rolls.reduce(function(a, b) { return a + b; }, 0);
  var total = Math.max(0, sum + modRaw);

  var area = document.getElementById('manualDmgResult');
  var chips = rolls.map(function(r) { return '<div class="result-die-chip' + (r === manualDmgDie ? ' max' : '') + (r === 1 ? ' min' : '') + '">' + r + '</div>'; }).join('');
  area.innerHTML =
    '<div class="result-formula">' + manualDmgQty + 'd' + manualDmgDie + (modRaw ? (modRaw > 0 ? '+' : '') + modRaw : '') + '</div>' +
    '<div class="result-dice-row">' + chips + '</div>' +
    '<div class="result-total" style="font-size:36px;color:var(--red-bright);">' + total + ' daño</div>';

  // Aplicar daño al servidor
  try {
    var desc = manualDmgQty + 'd' + manualDmgDie + (modRaw ? (modRaw > 0 ? '+' : '') + modRaw : '');
    var data = await api('/tables/' + combatState.tableId + '/combat/manual-damage', {
      method: 'POST',
      body: JSON.stringify({ defender_character_id: combatState.selectedTarget, damage: total, description: desc })
    });
    var hp = combatState.hpStatus.find(function(h) { return h.character_id === combatState.selectedTarget; });
    if (hp) hp.hpCurr = data.defender_hp;

    if (data.combat_ended) {
      if (combatPollInterval) { clearInterval(combatPollInterval); combatPollInterval = null; }
      setTimeout(function() {
        var msg = '¡Combate terminado!';
        if (data.winner) msg += ' Ganador: ' + data.winner;
        alert(msg);
        showScreen('lobby'); loadTables(); loadPublicTables();
      }, 2000);
    } else {
      combatState.currentTurn = data.next_turn.turn_index;
      combatState.currentRound = data.next_turn.round;
      combatState.selectedTarget = null;
      setTimeout(function() { renderCombatView(); }, 1500);
    }
  } catch (err) { showToast(err.message, true); }
}

// ── SPELL (SAVING THROW) ─────────────
let spellSaveOnSuccess = 'none'; // 'none' or 'half'

function getMySpellDC() {
  var abilityKey = state.spellAbilityKey || 'int';
  var abilityMod = Math.floor(((state.stats[abilityKey] || 10) - 10) / 2);
  return 8 + abilityMod + (state.profBonus || 2);
}

function renderSpellStatBtns() {
  var row = document.getElementById('spellSaveStatRow');
  if (!row) return;
  var stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  var labels = ['FUE', 'DES', 'CON', 'INT', 'SAB', 'CAR'];
  row.innerHTML = stats.map(function(s, i) {
    return '<button class="adv-btn' + (spellSaveStat === s ? ' adv-active' : '') + '" onclick="setSpellSaveStat(\'' + s + '\')" style="flex:1;">' + labels[i] + '</button>';
  }).join('');
}

function setSpellSaveStat(stat) {
  spellSaveStat = stat;
  renderSpellStatBtns();
  updateSpellSaveBtn();
}

function setSpellSaveOnSuccess(mode) {
  spellSaveOnSuccess = mode;
  var noneBtn = document.getElementById('spellSuccessNoneBtn');
  var halfBtn = document.getElementById('spellSuccessHalfBtn');
  if (noneBtn) noneBtn.className = 'adv-btn' + (mode === 'none' ? ' adv-active' : '');
  if (halfBtn) halfBtn.className = 'adv-btn' + (mode === 'half' ? ' adv-active' : '');
}

function updateSpellSaveBtn() {
  var btn = document.getElementById('spellSaveRollBtn');
  if (btn) btn.disabled = !combatState.selectedTarget || !spellSaveStat;
}

async function rollSpellSave() {
  if (!combatState.selectedTarget || !spellSaveStat) return;
  var spellDC = getMySpellDC();
  // Update display
  var dcDisp = document.getElementById('spellDCDisplay');
  if (dcDisp) dcDisp.textContent = spellDC;

  // Show rolling animation
  var area = document.getElementById('spellSaveResult');
  area.innerHTML = '<div style="text-align:center;padding:16px;"><div class="spinner"></div><div style="margin-top:8px;font-family:Cinzel,serif;font-size:12px;color:var(--on-surface-muted);letter-spacing:2px;">TIRANDO SALVACIÓN...</div></div>';

  // Small delay for dramatic effect
  await new Promise(function(r) { setTimeout(r, 800); });

  try {
    var data = await api('/tables/' + combatState.tableId + '/combat/saving-throw', {
      method: 'POST',
      body: JSON.stringify({ defender_character_id: combatState.selectedTarget, stat: spellSaveStat, spell_dc: spellDC })
    });

    var success = data.success;

    // Animate the result
    area.innerHTML =
      '<div class="result-formula">' + data.defender_name + ' — Salvación de ' + data.stat_name + '</div>' +
      '<div style="font-size:10px;color:var(--on-surface-muted);margin-bottom:8px;">CD ' + spellDC + ' | Mod ' + (data.stat_mod >= 0 ? '+' : '') + data.stat_mod + (data.prof_bonus ? ' | Prof +' + data.prof_bonus : '') + '</div>' +
      '<div class="result-dice-row" style="animation:fadeIn .3s ease;"><div class="result-die-chip' + (data.roll === 20 ? ' max' : '') + (data.roll === 1 ? ' min' : '') + '" style="font-size:24px;padding:10px 16px;">' + data.roll + '</div></div>' +
      '<div class="result-total" style="font-size:36px;color:' + (success ? 'var(--green-bright)' : 'var(--red-bright)') + ';animation:' + (success ? 'pulseGold' : 'pulseRed') + ' .5s ease;">' + data.total + '</div>' +
      '<div style="margin-top:8px;font-family:Cinzel,serif;font-size:14px;letter-spacing:2px;color:' + (success ? 'var(--green-bright)' : 'var(--red-bright)') + ';">' + (success ? '✓ SALVACIÓN EXITOSA' : '✖ FALLA LA SALVACIÓN') + '</div>';

    if (!success) {
      // Failed save: show damage panel
      document.getElementById('spellDmgPanel').style.display = 'block';
    } else if (spellSaveOnSuccess === 'half') {
      // Success but half damage
      document.getElementById('spellDmgPanel').style.display = 'block';
      var dmgLabel = document.getElementById('spellDmgPanelLabel');
      if (dmgLabel) dmgLabel.textContent = 'Daño del Conjuro (mitad por salvación exitosa)';
    } else {
      // Full success, no damage
      document.getElementById('spellDmgPanel').style.display = 'none';
      setTimeout(function() { passTurn(); }, 2500);
    }
  } catch (err) { showToast(err.message, true); }
}

function renderSpellDmgGrid() {
  var grid = document.getElementById('spellDmgDiceGrid');
  if (!grid) return;
  grid.innerHTML = '';
  DICE.forEach(function(d) {
    var sel = spellDmgDie === d;
    var btn = document.createElement('button');
    btn.className = 'die-btn' + (sel ? ' selected' : '');
    btn.innerHTML = '<div class="die-selected-badge"></div><div class="die-icon">' + dieSVG(d, sel) + '</div><div class="die-label">d' + d + '</div>';
    btn.addEventListener('click', function() {
      spellDmgDie = spellDmgDie === d ? null : d;
      renderSpellDmgGrid();
    });
    grid.appendChild(btn);
  });
  var rollBtn = document.getElementById('spellDmgRollBtn');
  if (rollBtn) rollBtn.disabled = spellDmgDie === null;
}

function changeSpellDmgQty(delta) {
  spellDmgQty = Math.max(1, Math.min(20, spellDmgQty + delta));
  var el = document.getElementById('spellDmgQty');
  if (el) el.textContent = spellDmgQty;
}

async function rollSpellDamage() {
  if (!spellDmgDie || !combatState.selectedTarget) return;
  var modRaw = parseInt(document.getElementById('spellDmgMod').value) || 0;
  var rolls = [];
  for (var i = 0; i < spellDmgQty; i++) rolls.push(Math.floor(Math.random() * spellDmgDie) + 1);
  var sum = rolls.reduce(function(a, b) { return a + b; }, 0);
  var rawTotal = Math.max(0, sum + modRaw);

  // Check if this is half damage (successful save with half-on-success)
  var isHalf = false;
  var spellResult = document.getElementById('spellSaveResult');
  if (spellResult && spellResult.innerHTML.indexOf('EXITOSA') !== -1 && spellSaveOnSuccess === 'half') {
    isHalf = true;
  }
  var total = isHalf ? Math.floor(rawTotal / 2) : rawTotal;

  var area = document.getElementById('spellDmgResult');
  var chips = rolls.map(function(r) { return '<div class="result-die-chip' + (r === spellDmgDie ? ' max' : '') + (r === 1 ? ' min' : '') + '">' + r + '</div>'; }).join('');
  area.innerHTML =
    '<div class="result-formula">' + spellDmgQty + 'd' + spellDmgDie + (modRaw ? (modRaw > 0 ? '+' : '') + modRaw : '') + '</div>' +
    '<div class="result-dice-row">' + chips + '</div>' +
    (isHalf ? '<div style="font-size:11px;color:var(--on-surface-muted);margin:4px 0;">Total: ' + rawTotal + ' → Mitad: ' + total + '</div>' : '') +
    '<div class="result-total" style="font-size:36px;color:var(--red-bright);">' + total + ' daño</div>' +
    (isHalf ? '<div style="font-size:10px;color:var(--on-surface-muted);font-family:Manrope,sans-serif;">Daño reducido por salvación exitosa</div>' : '');

  try {
    var desc = 'Conjuro ' + spellDmgQty + 'd' + spellDmgDie + (modRaw ? (modRaw > 0 ? '+' : '') + modRaw : '') + (isHalf ? ' (mitad)' : '');
    var data = await api('/tables/' + combatState.tableId + '/combat/manual-damage', {
      method: 'POST',
      body: JSON.stringify({ defender_character_id: combatState.selectedTarget, damage: total, description: desc })
    });
    var hp = combatState.hpStatus.find(function(h) { return h.character_id === combatState.selectedTarget; });
    if (hp) hp.hpCurr = data.defender_hp;

    if (data.combat_ended) {
      if (combatPollInterval) { clearInterval(combatPollInterval); combatPollInterval = null; }
      setTimeout(function() {
        var msg = '¡Combate terminado!';
        if (data.winner) msg += ' Ganador: ' + data.winner;
        alert(msg);
        showScreen('lobby'); loadTables(); loadPublicTables();
      }, 2000);
    } else {
      combatState.currentTurn = data.next_turn.turn_index;
      combatState.currentRound = data.next_turn.round;
      combatState.selectedTarget = null;
      setTimeout(function() { renderCombatView(); }, 1500);
    }
  } catch (err) { showToast(err.message, true); }
}

// Override selectTarget to also update manual/spell buttons
var _origSelectTarget = selectTarget;
selectTarget = function(charId) {
  _origSelectTarget(charId);
  updateManualAtkBtn();
  updateSpellSaveBtn();
};

// Render grids when entering combat
var _origEnterCombat = enterCombatView;
enterCombatView = function(data) {
  _origEnterCombat(data);
  setCombatMode('auto');
  renderManualDmgGrid();
  renderSpellDmgGrid();
};

// ══════════════════════════════════════
//  ENCYCLOPEDIA
// ══════════════════════════════════════
var encCategory = 'spells';
var encSpellLevel = 'all';
var encSpellClass = 'all';
var encExpandedSpell = null;

function setEncCategory(cat) {
  encCategory = cat;
  // Update buttons
  var btns = document.getElementById('encCategoryRow');
  if (btns) {
    var children = btns.querySelectorAll('.adv-btn');
    var labels = ['spells','classes','races','combat','spellrules'];
    children.forEach(function(b, i) {
      b.className = 'adv-btn' + (labels[i] === cat ? ' adv-active' : '');
    });
  }
  // Show/hide spell filters
  var filters = document.getElementById('encSpellFilters');
  if (filters) filters.style.display = cat === 'spells' ? 'block' : 'none';
  encExpandedSpell = null;
  renderEncyclopedia();
}

function setEncSpellLevel(lvl) {
  encSpellLevel = lvl;
  // Update buttons
  var ids = ['All',0,1,2,3,4,5,6,7,8,9];
  ids.forEach(function(id) {
    var btn = document.getElementById('encLvl' + (id === 'All' ? 'All' : id));
    if (btn) btn.className = 'adv-btn' + ((lvl === 'all' && id === 'All') || lvl === id ? ' adv-active' : '');
  });
  renderEncyclopedia();
}

function setEncSpellClass(cls) {
  encSpellClass = cls;
  var classes = ['all','Bardo','Brujo','Clérigo','Druida','Hechicero','Mago','Paladín'];
  classes.forEach(function(c) {
    var btn = document.getElementById('encCls' + (c === 'all' ? 'All' : c));
    if (btn) btn.className = 'adv-btn' + (encSpellClass === c ? ' adv-active' : '');
  });
  renderEncyclopedia();
}

function toggleEncSpell(idx) {
  encExpandedSpell = encExpandedSpell === idx ? null : idx;
  renderEncyclopedia();
}

function renderEncyclopedia() {
  var container = document.getElementById('encResults');
  var countEl = document.getElementById('encSpellCount');
  if (!container) return;

  if (encCategory === 'spells') {
    renderEncSpells(container, countEl);
  } else if (encCategory === 'classes') {
    renderEncClasses(container);
    if (countEl) countEl.textContent = '';
  } else if (encCategory === 'races') {
    renderEncRaces(container);
    if (countEl) countEl.textContent = '';
  } else if (encCategory === 'combat') {
    renderEncRules(container, ENCYCLOPEDIA_DATA.combat_rules, 'Reglas de Combate');
    if (countEl) countEl.textContent = '';
  } else if (encCategory === 'spellrules') {
    renderEncRules(container, ENCYCLOPEDIA_DATA.spell_rules, 'Reglas de Magia');
    if (countEl) countEl.textContent = '';
  }
}

function renderEncSpells(container, countEl) {
  var search = (document.getElementById('encSearchInput') || {}).value || '';
  search = search.toLowerCase().trim();

  var filtered = SPELLS_DATA.filter(function(s) {
    if (encSpellLevel !== 'all' && s.level !== encSpellLevel) return false;
    if (encSpellClass !== 'all' && s.classes.indexOf(encSpellClass) === -1) return false;
    if (search && s.name.toLowerCase().indexOf(search) === -1 && s.school.toLowerCase().indexOf(search) === -1) return false;
    return true;
  });

  if (countEl) countEl.textContent = filtered.length + ' conjuro' + (filtered.length !== 1 ? 's' : '') + ' encontrado' + (filtered.length !== 1 ? 's' : '');

  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--on-surface-muted);font-style:italic;">No se encontraron conjuros</div>';
    return;
  }

  var schoolColors = {
    'Abjuración': '#4a9eff',
    'Adivinación': '#c8c8c8',
    'Conjuración': '#ffcc44',
    'Encantamiento': '#ff69b4',
    'Evocación': '#ff6644',
    'Ilusión': '#bf7fff',
    'Nigromancia': '#66cc66',
    'Transmutación': '#ff9933'
  };

  var schoolIcons = {
    'Abjuración': '🛡',
    'Adivinación': '👁',
    'Conjuración': '✦',
    'Encantamiento': '💫',
    'Evocación': '🔥',
    'Ilusión': '🌀',
    'Nigromancia': '💀',
    'Transmutación': '⚗'
  };

  container.innerHTML = filtered.map(function(s, idx) {
    var realIdx = SPELLS_DATA.indexOf(s);
    var isExpanded = encExpandedSpell === realIdx;
    var color = schoolColors[s.school] || '#c9a84c';
    var icon = schoolIcons[s.school] || '✦';
    var levelText = s.level === 0 ? 'Truco' : 'Nivel ' + s.level;

    var html = '<div class="enc-spell-card" onclick="toggleEncSpell(' + realIdx + ')" style="border-left-color:' + color + ';">';
    html += '<div class="enc-spell-header">';
    html += '<div class="enc-spell-icon" style="color:' + color + ';">' + icon + '</div>';
    html += '<div class="enc-spell-info">';
    html += '<div class="enc-spell-name">' + s.name + '</div>';
    html += '<div class="enc-spell-meta">' + s.school + ' · ' + levelText + (s.ritual ? ' · <span style="color:var(--tertiary);font-weight:600;">Ritual</span>' : '') + '</div>';
    html += '</div>';
    html += '<div class="enc-spell-level" style="color:' + color + ';">' + (s.level === 0 ? '⊙' : s.level) + '</div>';
    html += '</div>';

    if (isExpanded) {
      html += '<div class="enc-spell-details">';
      if (s.ritual) {
        html += '<div style="display:inline-block;font-family:Manrope,sans-serif;font-size:10px;font-weight:600;color:var(--tertiary);background:rgba(76,42,140,0.15);padding:3px 10px;margin-bottom:8px;letter-spacing:1px;">✦ RITUAL — Se puede lanzar sin gastar espacio de conjuro (+10 min)</div>';
      }
      html += '<div class="enc-detail-row"><span class="enc-detail-label">Tiempo</span><span>' + (s.casting_time || '—') + '</span></div>';
      html += '<div class="enc-detail-row"><span class="enc-detail-label">Alcance</span><span>' + (s.range || '—') + '</span></div>';
      html += '<div class="enc-detail-row"><span class="enc-detail-label">Componentes</span><span>' + (s.components || '—') + '</span></div>';
      html += '<div class="enc-detail-row"><span class="enc-detail-label">Duración</span><span>' + (s.duration || '—') + '</span></div>';
      if (s.classes && s.classes.length > 0) {
        html += '<div class="enc-detail-row"><span class="enc-detail-label">Clases</span><span>' + s.classes.join(', ') + '</span></div>';
      }
      html += '<div class="enc-spell-desc">' + (s.description || 'Sin descripción disponible.') + '</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }).join('');
}

var encExpandedFeature = null; // 'class:feat' or 'class:sub:name'

function toggleEncFeature(key) {
  encExpandedFeature = encExpandedFeature === key ? null : key;
  renderEncyclopedia();
}

function renderEncClasses(container) {
  var classes = ENCYCLOPEDIA_DATA.classes;
  container.innerHTML = '<div class="enc-section-title">Clases de Personaje</div>' +
    classes.map(function(c) {
      var featuresHTML = '';
      if (typeof c.features === 'object' && !Array.isArray(c.features)) {
        featuresHTML = Object.keys(c.features).map(function(fname) {
          var key = c.name + ':feat:' + fname;
          var expanded = encExpandedFeature === key;
          return '<div class="enc-tag enc-tag-clickable" onclick="event.stopPropagation();toggleEncFeature(\'' + key.replace(/'/g,"\\'") + '\')">' + fname + (expanded ? ' ▾' : ' ▸') + '</div>' +
            (expanded ? '<div class="enc-feature-desc">' + c.features[fname] + '</div>' : '');
        }).join('');
      } else if (Array.isArray(c.features)) {
        featuresHTML = c.features.map(function(f) { return '<span class="enc-tag">' + f + '</span>'; }).join('');
      }

      var subHTML = '';
      if (typeof c.subclasses === 'object' && !Array.isArray(c.subclasses)) {
        subHTML = Object.keys(c.subclasses).map(function(sname) {
          var key = c.name + ':sub:' + sname;
          var expanded = encExpandedFeature === key;
          return '<div class="enc-tag enc-tag-accent enc-tag-clickable" onclick="event.stopPropagation();toggleEncFeature(\'' + key.replace(/'/g,"\\'") + '\')">' + sname + (expanded ? ' ▾' : ' ▸') + '</div>' +
            (expanded ? '<div class="enc-feature-desc enc-feature-accent">' + c.subclasses[sname] + '</div>' : '');
        }).join('');
      } else if (Array.isArray(c.subclasses)) {
        subHTML = c.subclasses.map(function(s) { return '<span class="enc-tag enc-tag-accent">' + s + '</span>'; }).join('');
      }

      return '<div class="enc-class-card">' +
        '<div class="enc-class-header">' +
          '<div class="enc-class-name">' + c.name + '</div>' +
          '<div class="enc-class-die">' + c.hit_die + '</div>' +
        '</div>' +
        '<div class="enc-detail-row"><span class="enc-detail-label">Característica principal</span><span>' + c.primary + '</span></div>' +
        '<div class="enc-detail-row"><span class="enc-detail-label">Salvaciones</span><span>' + c.saves + '</span></div>' +
        '<div class="enc-detail-row"><span class="enc-detail-label">Armaduras</span><span>' + c.armor + '</span></div>' +
        '<div class="enc-detail-row"><span class="enc-detail-label">Armas</span><span>' + c.weapons + '</span></div>' +
        '<div class="enc-class-section">Rasgos de clase — toca para ver detalle</div>' +
        '<div class="enc-tags-wrap">' + featuresHTML + '</div>' +
        '<div class="enc-class-section">Subclases — toca para ver detalle</div>' +
        '<div class="enc-tags-wrap">' + subHTML + '</div>' +
      '</div>';
    }).join('');
}

function renderEncRaces(container) {
  var races = ENCYCLOPEDIA_DATA.races;
  container.innerHTML = '<div class="enc-section-title">Razas Jugables</div>' +
    races.map(function(r) {
      var traitsHTML = '';
      if (typeof r.traits === 'object' && !Array.isArray(r.traits)) {
        traitsHTML = Object.keys(r.traits).map(function(tname) {
          var key = r.name + ':trait:' + tname;
          var expanded = encExpandedFeature === key;
          return '<div class="enc-tag enc-tag-clickable" onclick="event.stopPropagation();toggleEncFeature(\'' + key.replace(/'/g,"\\'") + '\')">' + tname + (expanded ? ' ▾' : ' ▸') + '</div>' +
            (expanded ? '<div class="enc-feature-desc">' + r.traits[tname] + '</div>' : '');
        }).join('');
      } else if (Array.isArray(r.traits)) {
        traitsHTML = r.traits.map(function(t) { return '<span class="enc-tag">' + t + '</span>'; }).join('');
      }

      var subHTML = '';
      if (typeof r.subraces === 'object' && !Array.isArray(r.subraces)) {
        var keys = Object.keys(r.subraces);
        if (keys.length > 0) {
          subHTML = '<div class="enc-class-section">Subrazas — toca para ver detalle</div><div class="enc-tags-wrap">' +
            keys.map(function(sname) {
              var key = r.name + ':subrace:' + sname;
              var expanded = encExpandedFeature === key;
              return '<div class="enc-tag enc-tag-accent enc-tag-clickable" onclick="event.stopPropagation();toggleEncFeature(\'' + key.replace(/'/g,"\\'") + '\')">' + sname + (expanded ? ' ▾' : ' ▸') + '</div>' +
                (expanded ? '<div class="enc-feature-desc enc-feature-accent">' + r.subraces[sname] + '</div>' : '');
            }).join('') + '</div>';
        }
      }

      return '<div class="enc-class-card">' +
        '<div class="enc-class-header">' +
          '<div class="enc-class-name">' + r.name + '</div>' +
          '<div class="enc-class-die" style="font-size:11px;">' + r.ability_increase + '</div>' +
        '</div>' +
        '<div class="enc-detail-row"><span class="enc-detail-label">Velocidad</span><span>' + r.speed + '</span></div>' +
        '<div class="enc-detail-row"><span class="enc-detail-label">Tamaño</span><span>' + r.size + '</span></div>' +
        '<div class="enc-class-section">Rasgos raciales — toca para ver detalle</div>' +
        '<div class="enc-tags-wrap">' + traitsHTML + '</div>' +
        subHTML +
      '</div>';
    }).join('');
}

function renderEncRules(container, rules, title) {
  container.innerHTML = '<div class="enc-section-title">' + title + '</div>' +
    rules.map(function(r) {
      return '<div class="enc-rule-card">' +
        '<div class="enc-rule-title">' + r.title + '</div>' +
        '<div class="enc-rule-content">' + r.content + '</div>' +
      '</div>';
    }).join('');
}

// ══════════════════════════════════════
//  FICHA ↔ ENCYCLOPEDIA INTEGRATION
// ══════════════════════════════════════

// Class/Race/Level selectors in edit mode
function renderClassRaceSelectors() {
  if (!state.editMode) {
    // Update spells link visibility
    var link = document.getElementById('spellsAvailableLink');
    var cls = textFields['class'] || '';
    var casterClasses = ['Bardo','Brujo','Clérigo','Druida','Explorador','Hechicero','Mago','Paladín'];
    if (link) link.style.display = casterClasses.indexOf(cls) !== -1 ? 'block' : 'none';
    return;
  }

  var classEl = document.getElementById('classField');
  var levelEl = document.getElementById('levelField');
  var raceEl = document.getElementById('raceField');

  if (classEl && classEl.tagName !== 'SELECT') {
    var currentClass = textFields['class'] || '';
    var classNames = ['—','Bárbaro','Bardo','Brujo','Clérigo','Druida','Explorador','Guerrero','Hechicero','Mago','Monje','Paladín','Pícaro'];
    var sel = document.createElement('select');
    sel.className = 'ei sm';
    sel.style.cssText = 'width:100%;background:var(--surface-dim);border:none;border-bottom:1px solid var(--primary-dim);color:var(--on-surface);font-family:Cinzel,serif;font-size:13px;padding:4px;outline:none;';
    classNames.forEach(function(cn) {
      var opt = document.createElement('option');
      opt.value = cn === '—' ? '' : cn;
      opt.textContent = cn;
      if (cn === currentClass || (cn === '—' && !currentClass)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function() {
      textFields['class'] = sel.value;
      onClassChanged(sel.value);
    });
    classEl.innerHTML = '';
    classEl.appendChild(sel);
  }

  if (levelEl && levelEl.tagName !== 'INPUT') {
    var currentLevel = parseInt(textFields['level']) || 1;
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.min = 1;
    inp.max = 20;
    inp.value = currentLevel;
    inp.className = 'ei sm';
    inp.style.cssText = 'width:60px;text-align:center;background:var(--surface-dim);border:none;border-bottom:1px solid var(--primary-dim);color:var(--on-surface);font-family:Cinzel,serif;font-size:13px;padding:4px;outline:none;';
    inp.addEventListener('change', function() {
      var v = Math.max(1, Math.min(20, parseInt(inp.value) || 1));
      inp.value = v;
      textFields['level'] = String(v);
      onLevelChanged(v);
    });
    levelEl.innerHTML = '';
    levelEl.appendChild(inp);
  }

  if (raceEl && raceEl.tagName !== 'SELECT') {
    var currentRace = textFields['race'] || '';
    var raceNames = ['—','Enano','Elfo','Mediano','Humano','Dracónido','Gnomo','Semielfo','Semiorco','Tiefling'];
    var sel2 = document.createElement('select');
    sel2.className = 'ei sm';
    sel2.style.cssText = 'width:100%;background:var(--surface-dim);border:none;border-bottom:1px solid var(--primary-dim);color:var(--on-surface);font-family:Cinzel,serif;font-size:13px;padding:4px;outline:none;';
    raceNames.forEach(function(rn) {
      var opt = document.createElement('option');
      opt.value = rn === '—' ? '' : rn;
      opt.textContent = rn;
      if (rn === currentRace || (rn === '—' && !currentRace)) opt.selected = true;
      sel2.appendChild(opt);
    });
    sel2.addEventListener('change', function() {
      textFields['race'] = sel2.value;
      onRaceChanged(sel2.value);
    });
    raceEl.innerHTML = '';
    raceEl.appendChild(sel2);
  }

  // Spells link
  var link = document.getElementById('spellsAvailableLink');
  if (link) link.style.display = 'none'; // hide in edit mode
}

function onClassChanged(className) {
  if (!className || typeof CLASS_PROGRESSION === 'undefined') return;
  var cls = CLASS_PROGRESSION.find(function(c) { return c.name === className; });
  if (!cls) return;

  // Auto-set proficiency bonus based on level
  var level = parseInt(textFields['level']) || 1;
  var profByLevel = {1:2,2:2,3:2,4:2,5:3,6:3,7:3,8:3,9:4,10:4,11:4,12:4,13:5,14:5,15:5,16:5,17:6,18:6,19:6,20:6};
  state.profBonus = profByLevel[level] || 2;

  // Auto-set saving throw proficiencies
  if (cls.saves) {
    state.savingThrowProf = cls.saves.slice();
  }

  // Set spell ability key
  var spellKeyMap = {'Bardo':'cha','Brujo':'cha','Clérigo':'wis','Druida':'wis','Explorador':'wis','Hechicero':'cha','Mago':'int','Paladín':'cha'};
  if (spellKeyMap[className]) {
    state.spellAbilityKey = spellKeyMap[className];
    textFields['spellAbility'] = spellKeyMap[className].toUpperCase();
  }

  renderAll();
  showToast('Clase: ' + className + ' · Salvaciones y competencia actualizados');
}

function onLevelChanged(level) {
  var profByLevel = {1:2,2:2,3:2,4:2,5:3,6:3,7:3,8:3,9:4,10:4,11:4,12:4,13:5,14:5,15:5,16:5,17:6,18:6,19:6,20:6};
  state.profBonus = profByLevel[level] || 2;
  renderAll();
}

function onRaceChanged(raceName) {
  var container = document.getElementById('subraceFieldContainer');
  var subraceEl = document.getElementById('subraceField');
  if (!container || !subraceEl) return;

  // Find race in encyclopedia data
  var raceData = null;
  if (ENCYCLOPEDIA_DATA && ENCYCLOPEDIA_DATA.races) {
    raceData = ENCYCLOPEDIA_DATA.races.find(function(r) { return r.name === raceName; });
  }

  var subraces = [];
  if (raceData && typeof raceData.subraces === 'object' && !Array.isArray(raceData.subraces)) {
    subraces = Object.keys(raceData.subraces);
  }

  if (subraces.length > 0 && state.editMode) {
    container.style.display = 'block';
    var currentSub = textFields['subrace'] || '';
    var sel = document.createElement('select');
    sel.className = 'ei sm';
    sel.style.cssText = 'width:100%;background:var(--surface-dim);border:none;border-bottom:1px solid var(--primary-dim);color:var(--on-surface);font-family:Cinzel,serif;font-size:13px;padding:4px;outline:none;';
    var opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = '— Elegir subraza —';
    sel.appendChild(opt0);
    subraces.forEach(function(sn) {
      var opt = document.createElement('option');
      opt.value = sn; opt.textContent = sn;
      if (sn === currentSub) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function() {
      textFields['subrace'] = sel.value;
      showToast('Subraza: ' + sel.value);
    });
    subraceEl.innerHTML = '';
    subraceEl.appendChild(sel);
  } else if (subraces.length > 0 && textFields['subrace']) {
    container.style.display = 'block';
    subraceEl.textContent = textFields['subrace'];
  } else {
    container.style.display = 'none';
  }

  showToast('Raza: ' + raceName);
}

function goToClassSpells() {
  var cls = textFields['class'] || '';
  if (!cls) { showToast('Elegí una clase primero', true); return; }
  // Go to lobby > encyclopedia > spells filtered by class
  backToLobby();
  setTimeout(function() {
    // Switch to encyclopedia tab
    var btn = document.querySelectorAll('.lobby-nav-btn')[2]; // 3rd tab = encyclopedia
    if (btn) { switchLobbyTab('encyclopedia', btn); }
    setTimeout(function() {
      setEncCategory('spells');
      setEncSpellClass(cls);
    }, 100);
  }, 200);
}

// Hook into renderAll to add selectors
var _origRenderAll = renderAll;
renderAll = function() {
  _origRenderAll();
  renderClassRaceSelectors();
};

// ══════════════════════════════════════
//  CLASS FULL VIEW (expanded progression)
// ══════════════════════════════════════
var encClassFullView = null; // class name or null

function openClassFullView(className) {
  encClassFullView = className;
  renderEncyclopedia();
  // Scroll to top of results
  var r = document.getElementById('encResults');
  if (r) r.scrollIntoView({behavior:'smooth'});
}

function closeClassFullView() {
  encClassFullView = null;
  renderEncyclopedia();
}

function renderClassFullViewHTML(className) {
  // Find class in both data sources
  var cls = null;
  if (typeof CLASS_PROGRESSION !== 'undefined') {
    cls = CLASS_PROGRESSION.find(function(c) { return c.name === className; });
  }
  var encCls = null;
  if (ENCYCLOPEDIA_DATA && ENCYCLOPEDIA_DATA.classes) {
    encCls = ENCYCLOPEDIA_DATA.classes.find(function(c) { return c.name === className; });
  }
  if (!cls && !encCls) return '<div>Clase no encontrada</div>';

  var html = '';
  html += '<button class="add-btn" onclick="closeClassFullView()" style="margin-bottom:12px;text-align:center;">← Volver a la lista de clases</button>';

  // Header
  html += '<div class="enc-class-card" style="border-left-color:var(--primary);">';
  html += '<div class="enc-class-header"><div class="enc-class-name" style="font-size:24px;">' + className + '</div>';
  html += '<div class="enc-class-die" style="font-size:18px;">' + (cls ? cls.hit_die : (encCls ? encCls.hit_die : '')) + '</div></div>';

  // Basic info
  if (cls) {
    html += '<div class="enc-detail-row"><span class="enc-detail-label">PG nivel 1</span><span>' + cls.hp_first + '</span></div>';
    html += '<div class="enc-detail-row"><span class="enc-detail-label">PG niveles superiores</span><span>' + cls.hp_higher + '</span></div>';
    html += '<div class="enc-detail-row"><span class="enc-detail-label">Característica principal</span><span>' + cls.primary + '</span></div>';
    html += '<div class="enc-detail-row"><span class="enc-detail-label">Salvaciones</span><span>' + cls.saves.map(function(s){var n={str:'FUE',dex:'DES',con:'CON',int:'INT',wis:'SAB',cha:'CAR'};return n[s]||s;}).join(', ') + '</span></div>';
    html += '<div class="enc-detail-row"><span class="enc-detail-label">Armaduras</span><span>' + cls.armor + '</span></div>';
    html += '<div class="enc-detail-row"><span class="enc-detail-label">Armas</span><span>' + cls.weapons + '</span></div>';
    if (cls.skills_from) {
      html += '<div class="enc-detail-row"><span class="enc-detail-label">Habilidades (elegir ' + cls.skills_choose + ')</span><span>' + cls.skills_from.join(', ') + '</span></div>';
    }
  } else if (encCls) {
    html += '<div class="enc-detail-row"><span class="enc-detail-label">Característica principal</span><span>' + encCls.primary + '</span></div>';
    html += '<div class="enc-detail-row"><span class="enc-detail-label">Salvaciones</span><span>' + encCls.saves + '</span></div>';
    html += '<div class="enc-detail-row"><span class="enc-detail-label">Armaduras</span><span>' + encCls.armor + '</span></div>';
    html += '<div class="enc-detail-row"><span class="enc-detail-label">Armas</span><span>' + encCls.weapons + '</span></div>';
  }
  html += '</div>';

  // Progression table
  if (cls && cls.progression) {
    html += '<div class="enc-class-card">';
    html += '<div class="card-title">Progresión por Nivel</div>';
    cls.progression.forEach(function(p) {
      if (p.features.length === 0) return;
      var featsHTML = p.features.map(function(f) {
        // Check if we have detail for this feature
        var detail = null;
        if (cls.features_detail && cls.features_detail[f]) {
          detail = cls.features_detail[f];
        }
        if (detail) {
          var key = className + ':prog:' + f;
          var expanded = encExpandedFeature === key;
          return '<div class="enc-tag enc-tag-clickable" onclick="event.stopPropagation();toggleEncFeature(\'' + key.replace(/'/g,"\\'") + '\')">' + f + (expanded ? ' ▾' : ' ▸') + '</div>' +
            (expanded ? '<div class="enc-feature-desc">' + detail + '</div>' : '');
        }
        return '<span class="enc-tag">' + f + '</span>';
      }).join('');

      html += '<div class="enc-level-row">';
      html += '<div class="enc-level-num">' + p.level + '</div>';
      html += '<div class="enc-level-prof">+' + p.prof_bonus + '</div>';
      html += '<div class="enc-level-feats">' + featsHTML + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Subclasses detail
  if (cls && cls.subclasses_detail) {
    html += '<div class="enc-class-card">';
    html += '<div class="card-title">Subclases</div>';
    Object.keys(cls.subclasses_detail).forEach(function(subName) {
      var sub = cls.subclasses_detail[subName];
      var key = className + ':subfull:' + subName;
      var expanded = encExpandedFeature === key;

      html += '<div class="enc-tag enc-tag-accent enc-tag-clickable" style="font-size:13px;padding:8px 12px;margin-bottom:4px;" onclick="toggleEncFeature(\'' + key.replace(/'/g,"\\'") + '\')">' + subName + (expanded ? ' ▾' : ' ▸') + '</div>';

      if (expanded) {
        html += '<div class="enc-feature-desc enc-feature-accent" style="margin-bottom:12px;">';
        if (sub.description) html += '<div style="margin-bottom:8px;font-style:italic;">' + sub.description + '</div>';
        if (sub.features) {
          var levels = Object.keys(sub.features).map(Number).sort(function(a,b){return a-b;});
          levels.forEach(function(lvl) {
            var feat = sub.features[lvl];
            html += '<div style="margin-bottom:6px;"><span style="font-family:Cinzel,serif;font-weight:700;color:var(--primary);font-size:12px;">Nivel ' + lvl + ' — ' + feat.name + '</span><br>' + feat.desc + '</div>';
          });
        }
        html += '</div>';
      }
    });
    html += '</div>';
  } else if (encCls && typeof encCls.subclasses === 'object' && !Array.isArray(encCls.subclasses)) {
    html += '<div class="enc-class-card">';
    html += '<div class="card-title">Subclases</div>';
    Object.keys(encCls.subclasses).forEach(function(subName) {
      var key = className + ':subfull:' + subName;
      var expanded = encExpandedFeature === key;
      html += '<div class="enc-tag enc-tag-accent enc-tag-clickable" style="font-size:13px;padding:8px 12px;margin-bottom:4px;" onclick="toggleEncFeature(\'' + key.replace(/'/g,"\\'") + '\')">' + subName + (expanded ? ' ▾' : ' ▸') + '</div>';
      if (expanded) {
        html += '<div class="enc-feature-desc enc-feature-accent">' + encCls.subclasses[subName] + '</div>';
      }
    });
    html += '</div>';
  }

  // If caster, show spell slot table
  if (cls && cls.spellcaster && cls.spell_slots) {
    html += '<div class="enc-class-card">';
    html += '<div class="card-title">Espacios de Conjuro por Nivel</div>';
    html += '<div style="font-family:Crimson Text,serif;font-size:13px;color:var(--on-surface-dim);margin-bottom:8px;line-height:1.5;">Los espacios de conjuro son "cargas" que gastás para lanzar conjuros. Se recuperan tras un descanso prolongado' + (cls.caster_type === 'warlock' ? ' (corto para brujos)' : '') + '. Los trucos se lanzan ilimitadamente.</div>';

    if (cls.caster_type === 'warlock') {
      // Warlock: simpler table
      html += '<div style="overflow-x:auto;">';
      html += '<table style="width:100%;border-collapse:collapse;font-family:Manrope,sans-serif;font-size:11px;">';
      html += '<tr style="border-bottom:1px solid var(--outline-variant);"><th style="padding:6px 4px;text-align:left;color:var(--primary);font-size:10px;">NV</th><th style="padding:6px 4px;color:var(--on-surface-muted);">Trucos</th><th style="padding:6px 4px;color:var(--on-surface-muted);">Espacios</th><th style="padding:6px 4px;color:var(--on-surface-muted);">Nv. Espacio</th></tr>';
      for (var wlvl = 1; wlvl <= 20; wlvl++) {
        var ws = cls.spell_slots[wlvl];
        var wcantrips = cls.cantrips_by_level ? (cls.cantrips_by_level[wlvl] || 0) : 0;
        html += '<tr style="border-bottom:1px solid rgba(77,70,55,0.15);"><td style="padding:4px;font-weight:700;color:var(--primary);">' + wlvl + '</td><td style="padding:4px;text-align:center;">' + wcantrips + '</td><td style="padding:4px;text-align:center;color:var(--tertiary);">' + ws.slots + '</td><td style="padding:4px;text-align:center;">' + ws.level + 'º</td></tr>';
      }
      html += '</table></div>';
    } else {
      // Full/half caster table
      var maxSpellLvl = cls.caster_type === 'half' ? 5 : 9;
      html += '<div style="overflow-x:auto;">';
      html += '<table style="width:100%;border-collapse:collapse;font-family:Manrope,sans-serif;font-size:10px;">';
      html += '<tr style="border-bottom:1px solid var(--outline-variant);"><th style="padding:4px 2px;text-align:left;color:var(--primary);font-size:9px;">NV</th>';
      if (cls.cantrips_by_level) html += '<th style="padding:4px 2px;color:var(--on-surface-muted);font-size:9px;">T</th>';
      for (var si = 1; si <= maxSpellLvl; si++) html += '<th style="padding:4px 2px;color:var(--on-surface-muted);font-size:9px;">' + si + 'º</th>';
      html += '</tr>';
      for (var slvl = 1; slvl <= 20; slvl++) {
        var slots = cls.spell_slots[slvl];
        if (!slots) continue;
        html += '<tr style="border-bottom:1px solid rgba(77,70,55,0.1);"><td style="padding:3px 2px;font-weight:700;color:var(--primary);">' + slvl + '</td>';
        if (cls.cantrips_by_level) {
          var ct = cls.cantrips_by_level[String(slvl)] || 0;
          html += '<td style="padding:3px 2px;text-align:center;color:var(--tertiary);">' + ct + '</td>';
        }
        for (var ssi = 0; ssi < maxSpellLvl; ssi++) {
          var sv = slots[ssi] || 0;
          html += '<td style="padding:3px 2px;text-align:center;' + (sv > 0 ? 'color:var(--on-surface);' : 'color:var(--outline-variant);') + '">' + (sv > 0 ? sv : '—') + '</td>';
        }
        html += '</tr>';
      }
      html += '</table></div>';
    }

    html += '<button class="add-btn" onclick="setEncCategory(\'spells\');setEncSpellClass(\'' + className + '\');" style="margin-top:10px;text-align:center;">✦ Ver conjuros disponibles para ' + className + '</button>';
    html += '</div>';
  }

  return html;
}

// Override renderEncClasses to support full view
var _origRenderEncClasses = renderEncClasses;
renderEncClasses = function(container) {
  if (encClassFullView) {
    container.innerHTML = renderClassFullViewHTML(encClassFullView);
    return;
  }
  // Use the existing render but add click-to-expand on class names
  _origRenderEncClasses(container);
  // Add click handlers to class names
  var names = container.querySelectorAll('.enc-class-name');
  names.forEach(function(el) {
    var name = el.textContent;
    el.style.cursor = 'pointer';
    el.title = 'Click para ver progresión completa';
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      openClassFullView(name);
    });
  });
};
