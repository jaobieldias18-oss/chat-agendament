// O ORÇAMENTO NA HORA — Pintor autônomo (HTML/CSS/JS puro)
// Parte 2: cálculo local + save lead. Parte 3 vai plugar Groq via Edge Function /functions/v1/chat
const SUPABASE_URL = 'https://rfqpnkymkuubnalqcrqs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HCZdt_B5gB6CDvGP2QDdOg_xehenqn_';

const messagesEl = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const panel = document.getElementById('panel');

const state = { step: 'name', name: '', phone: '', service: null, prices: [], qty: 0, total: 0, longe: false, taxa: 0 };

function say(text, from = 'bot') {
  const d = document.createElement('div');
  d.className = from;
  d.textContent = text;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function clearPanel() { panel.innerHTML = ''; }
function fmt(n) { return 'R$ ' + Number(n).toFixed(2).replace('.', ','); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// item f do professor: card de VALOR CALCULADO em destaque (+ taxa R$30 se longe)
function sayBudgetCard() {
  const d = document.createElement('div');
  d.className = 'card-orcamento';
  const base = Number(state.service.preco_por_comodo) * state.qty;
  let extra = '';
  if (state.taxa > 0) extra = '<div class="linha">Taxa de visita (longe): <b>' + fmt(state.taxa) + '</b></div>';
  d.innerHTML =
    '<span class="selo valor">💰 VALOR CALCULADO</span>' +
    '<h3>' + esc(state.service.nome_exibicao) + ' × ' + state.qty + ' cômodo(s)</h3>' +
    '<div class="linha">' + esc(state.service.nome_exibicao) + ' — ' + fmt(state.service.preco_por_comodo) + ' /cômodo</div>' +
    '<div class="linha">Quantidade: <b>' + state.qty + '</b> × ' + fmt(state.service.preco_por_comodo) + ' = ' + fmt(base) + '</div>' +
    extra +
    '<div class="valor-grande">' + fmt(state.total) + '</div>' +
    '<div class="linha">Orçamento aproximado na hora</div>';
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// item f do professor: card de CONFIRMAÇÃO DE LEAD SALVO
function saySuccessCard() {
  const d = document.createElement('div');
  d.className = 'card-sucesso';
  const hora = new Date().toLocaleString('pt-BR');
  const taxaTxt = state.taxa > 0 ? ' • inclui taxa visita ' + fmt(state.taxa) : '';
  d.innerHTML =
    '<span class="selo ok">✅ LEAD SALVO</span>' +
    '<h3>Pronto, ' + esc(state.name) + '!</h3>' +
    '<div class="linha">👤 ' + esc(state.name) + ' • 📱 ' + esc(state.phone) + '</div>' +
    '<div class="linha">' + esc(state.service ? state.service.nome_exibicao : '') + ' × ' + state.qty + ' cômodo(s)' + taxaTxt + '</div>' +
    '<div class="valor-grande">' + fmt(state.total) + '</div>' +
    '<div class="linha">O pintor vai te ligar. Salvo em ' + hora + '</div>';
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sb(path, opts = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {})
    }
  });
  if (!r.ok) throw new Error('Supabase erro ' + r.status);
  return r.json();
}

// Preços exatos do cliente — fallback local igual ao banco
const FALLBACK_PRICES = [
  { tipo: 'parede_lisa', nome_exibicao: 'Parede lisa', preco_por_comodo: 120 },
  { tipo: 'parede_textura', nome_exibicao: 'Parede com textura', preco_por_comodo: 180 },
  { tipo: 'teto', nome_exibicao: 'Teto', preco_por_comodo: 100 }
];

async function loadPrices() {
  try {
    const rows = await sb('precos?select=*&active=eq.true&order=nome_exibicao');
    state.prices = rows.length ? rows.map(p => ({
      tipo: p.tipo,
      nome_exibicao: p.nome_exibicao,
      preco_por_comodo: Number(p.preco_por_comodo)
    })) : [...FALLBACK_PRICES];
  } catch (e) {
    state.prices = [...FALLBACK_PRICES];
  }
}

function askName() {
  state.step = 'name';
  say('Oi! Sou o assistente virtual do pintor. 🎨');
  say('Qual é o seu nome?');
}

function askPhone() {
  state.step = 'phone';
  say(`Oi, ${state.name}! Qual seu telefone/WhatsApp com DDD?`);
}

// Reconhecimento de nome: saudação sozinha NÃO é nome; "meu nome é X" extrai X
function normTxt(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').trim().replace(/\s+/g, ' ');
}
function isGreetingOnly(t) {
  const s = normTxt(t);
  const g = ['oi', 'oie', 'oii', 'oiii', 'ola', 'ei', 'opa', 'eae', 'eai', 'hello', 'hi', 'hey', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'tudo bom', 'como vai', 'fala', 'salve', 'fala ai', 'opa tudo bem'];
  if (g.includes(s)) return true;
  const w = s.split(' ');
  if (w.length <= 3 && (w[0] === 'oi' || w[0] === 'ola' || w[0] === 'opa' || w[0] === 'ei')) return true;
  return false;
}
function capName(s) {
  return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
function extractName(t) {
  const m = t.match(/(?:meu nome [ée] |me chamo |sou o?a? |aqui [ée] o?a? |quem fala [ée] o?a? )([A-Za-zÀ-ÖØ-öø-ÿ]+(?: [A-Za-zÀ-ÖØ-öø-ÿ]+)?)/i);
  if (m) return capName(m[1]);
  return null;
}
function handleName(t) {
  const ext = extractName(t);
  if (ext) { state.name = ext; askPhone(); return; }
  if (isGreetingOnly(t)) { say('Oi! Tudo bem? 😊 Qual é o seu nome?'); return; }
  if (t.trim().length < 2) { say('Me diz seu nome pra continuar?'); return; }
  if (/\d/.test(t)) { say('Esse parece um telefone. Me diz primeiro o seu nome? 😊'); return; }
  state.name = capName(t);
  askPhone();
}

function askService() {
  state.step = 'service';
  say('Qual tipo de serviço você quer orçar? Toque numa opção:');
  clearPanel();
  state.prices.forEach(p => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.innerHTML = esc(p.nome_exibicao) + '<small>' + fmt(p.preco_por_comodo) + ' /cômodo</small>';
    b.onclick = () => {
      state.service = p;
      say(p.nome_exibicao, 'user');
      askQty();
    };
    panel.appendChild(b);
  });
}

function askQty() {
  state.step = 'qty';
  clearPanel();
  say(`Quantos cômodos de ${state.service.nome_exibicao}? (digite só o número)`);
}

// EXTRA taxa de visita R$30: só se for muito longe
function askVisita() {
  state.step = 'visita';
  say('O local é muito longe? A taxa de visita é R$ 30,00 (só se for longe).');
  clearPanel();
  const sim = document.createElement('button');
  sim.className = 'chip';
  sim.textContent = 'Sim, é longe (+R$ 30)';
  sim.onclick = () => { state.longe = true; state.taxa = 30; say('Sim, é longe', 'user'); showBudget(); };
  const nao = document.createElement('button');
  nao.className = 'chip';
  nao.textContent = 'Não, é perto (sem taxa)';
  nao.onclick = () => { state.longe = false; state.taxa = 0; say('Não, é perto', 'user'); showBudget(); };
  panel.append(sim, nao);
}

function showBudget() {
  state.step = 'confirm';
  state.total = Number(state.service.preco_por_comodo) * state.qty + Number(state.taxa || 0);
  sayBudgetCard();
  clearPanel();
  const ok = document.createElement('button');
  ok.className = 'primary';
  ok.textContent = `✅ Salvar orçamento — ${fmt(state.total)}`;
  ok.onclick = saveLead;
  const back = document.createElement('button');
  back.className = 'ghost';
  back.textContent = 'Trocar tipo de serviço';
  back.onclick = askService;
  panel.append(ok, back);
}

async function saveLead() {
  say('Confirmado', 'user');
  say('Salvando...');
  clearPanel();
  try {
    await sb('orcamentos', {
      method: 'POST',
      body: JSON.stringify([{
        nome: state.name,
        telefone: state.phone,
        tipo_servico: state.service.tipo,
        quantidade_comodos: state.qty,
        valor_calculado: state.total
      }])
    });
    saySuccessCard();
  } catch (e) {
    say('Erro ao salvar. Tente de novo ou chame o pintor direto.');
  }
  state.step = 'done';
  clearPanel();
  const again = document.createElement('button');
  again.className = 'primary';
  again.textContent = '🔄 Novo orçamento';
  again.onclick = () => { state.step = 'name'; state.name = ''; state.phone = ''; askName(); };
  panel.appendChild(again);
}

// Parte 3 FINAL (vale nota): IA via Edge Function
const chatHistory = [];
async function askGroq(text) {
  const el = document.createElement('div');
  el.className = 'bot typing';
  el.textContent = 'Digitando...';
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/chat', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: text, history: chatHistory.slice(-10) })
    });
    const data = await r.json();
    el.classList.remove('typing');
    el.textContent = data.reply || data.error || 'Tive um problema. Tente de novo.';
    if (data.valor_calculado) {
      state.total = Number(data.valor_calculado);
      // tenta montar card mesmo vindo da IA
      const d = document.createElement('div');
      d.className = 'card-orcamento';
      d.innerHTML = '<span class="selo valor">💰 VALOR CALCULADO (IA)</span><div class="valor-grande">' + fmt(state.total) + '</div>';
      messagesEl.appendChild(d);
    }
    if (data.lead_salvo) {
      const d = document.createElement('div');
      d.className = 'card-sucesso';
      d.innerHTML = '<span class="selo ok">✅ LEAD SALVO (IA)</span><h3>O pintor vai te ligar!</h3>';
      messagesEl.appendChild(d);
      clearPanel();
      state.step = 'done';
    }
    chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: el.textContent });
  } catch (e) {
    el.textContent = 'Sem conexão com a IA agora. Use os botões acima. 👆';
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const t = input.value.trim();
  if (!t) return;
  say(t, 'user');
  input.value = '';

  if (state.step === 'name') {
    handleName(t);
  } else if (state.step === 'phone') {
    const digits = t.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      say('Esse número parece incompleto. Manda seu WhatsApp com DDD, só números. 📱');
    } else {
      state.phone = t;
      askService();
    }
  } else if (state.step === 'qty') {
    const q = parseInt(t, 10);
    if (!Number.isInteger(q) || q <= 0) {
      say('Digite uma quantidade válida, ex: 2');
    } else {
      state.qty = q;
      askVisita();
    }
  } else {
    askGroq(t);
  }
});

(async () => {
  await loadPrices();
  askName();
})();
