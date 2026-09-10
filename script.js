const messagesEl = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');

function addMessage(text, from) {
  const div = document.createElement('div');
  div.className = from;
  div.textContent = text;
  messagesEl.appendChild(div);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  input.value = '';
  // TODO: integrar Supabase (horários livres) + Groq (respostas curtas e diretas)
  addMessage('Recebido! Integração em construção.', 'bot');
});

addMessage('Olá! Quer ver horários livres para agendar?', 'bot');
