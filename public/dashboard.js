const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const statuses = [
  'Novo Pedido',
  'Em Separação',
  'Aguardando Pagamento',
  'Concluído',
];
const ordersById = new Map();
const sessionsById = new Map();
let selectedSessionId = null;
let socket;
let reconnectTimer;
let toastTimer;

const orderBoard = document.querySelector('#order-board');
const sessionList = document.querySelector('#session-list');
const consultantThread = document.querySelector('#consultant-thread');
const chatForm = document.querySelector('#consultant-chat-form');
const toast = document.querySelector('#dashboard-toast');

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function elapsed(isoDate) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes ? ` ${remainingMinutes}min` : ''}`;
}

function renderOrders() {
  const allOrders = [...ordersById.values()].sort(
    (first, second) => new Date(first.createdAt) - new Date(second.createdAt),
  );
  const pendingCount = allOrders.filter(
    (order) => order.status !== 'Concluído',
  ).length;
  document.querySelector('#pending-count').textContent = pendingCount;
  orderBoard.innerHTML = statuses
    .map((status) => {
      const columnOrders = allOrders.filter((order) => order.status === status);
      return `<section class="order-column" aria-label="${escapeHtml(status)}">
      <h3 class="column-heading"><span></span>${escapeHtml(status)}<span class="column-count">${columnOrders.length}</span></h3>
      <div class="order-list">${
        columnOrders.length
          ? columnOrders
              .map((order) => {
                const statusIndex = statuses.indexOf(order.status);
                const nextStatus = statuses[statusIndex + 1];
                const items = order.items
                  .map(
                    (item) =>
                      `<div class="order-item"><span>${item.quantity}× ${escapeHtml(item.name)}</span><span>${escapeHtml(item.size)} · ${escapeHtml(item.color)}</span></div>`,
                  )
                  .join('');
                return `<article class="order-card" data-order-id="${escapeHtml(order.id)}">
          <div class="order-card-top"><p class="order-number">PEDIDO #${escapeHtml(order.id)}</p><span class="elapsed-time" title="Recebido em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.createdAt))}">${elapsed(order.createdAt)}</span></div>
          <h4 class="order-customer">${escapeHtml(order.customerName)}</h4>
          <a class="order-phone" href="https://wa.me/55${String(order.phone).replace(/\D/g, '')}" target="_blank" rel="noreferrer">${escapeHtml(order.phone)}</a>
          <div class="order-items">${items}</div>
          <div class="order-total"><span>Total</span><strong>${currency.format(order.total)}</strong></div>
          <span class="status-badge">${escapeHtml(order.status)}</span>
          ${nextStatus ? `<button class="next-status" type="button" data-next-order="${escapeHtml(order.id)}" data-next-status="${escapeHtml(nextStatus)}">Avançar para ${escapeHtml(nextStatus)} <span aria-hidden="true">→</span></button>` : ''}
        </article>`;
              })
              .join('')
          : '<p class="order-empty">Nenhum pedido nesta etapa.</p>'
      }</div>
    </section>`;
    })
    .join('');
}

function renderSessions() {
  const sessions = [...sessionsById.values()].sort(
    (first, second) => new Date(second.lastSeenAt) - new Date(first.lastSeenAt),
  );
  document.querySelector('#chat-count').textContent = sessions.filter(
    (session) => session.online,
  ).length;
  if (!sessions.length) {
    sessionList.innerHTML =
      '<p class="session-empty">As conversas aparecerão aqui.</p>';
    return;
  }
  sessionList.innerHTML = sessions
    .map(
      (session) => `
    <button class="session-item ${selectedSessionId === session.sessionId ? 'is-selected' : ''}" type="button" data-session-id="${escapeHtml(session.sessionId)}">
      <span class="session-avatar">${escapeHtml((session.customerName || 'C').charAt(0).toLocaleUpperCase('pt-BR'))}</span>
      <span class="session-details"><strong>${escapeHtml(session.customerName || 'Cliente')}</strong><small>${escapeHtml(session.messages.at(-1)?.text ?? 'Inicie uma conversa')}</small></span>
      <i class="online-indicator ${session.online ? 'is-online' : ''}" title="${session.online ? 'Online' : 'Offline'}"></i>
    </button>`,
    )
    .join('');
}

function renderThread() {
  const session = sessionsById.get(selectedSessionId);
  if (!session) {
    consultantThread.innerHTML =
      '<div class="thread-empty"><span class="thread-mark" aria-hidden="true">bc.</span><p>Escolha uma conversa para começar.</p></div>';
    chatForm.hidden = true;
    return;
  }
  consultantThread.innerHTML = session.messages.length
    ? ''
    : '<div class="thread-empty"><span class="thread-mark" aria-hidden="true">bc.</span><p>Essa conversa ainda não tem mensagens.</p></div>';
  session.messages.forEach((message) => appendMessage(message));
  consultantThread.scrollTop = consultantThread.scrollHeight;
  chatForm.hidden = false;
  document.querySelector('#consultant-message-input').focus();
}

function appendMessage(message) {
  if (
    consultantThread.querySelector(
      `[data-message-id="${CSS.escape(message.id)}"]`,
    )
  )
    return;
  consultantThread.querySelector('.thread-empty')?.remove();
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${message.sender === 'consultant' ? 'is-own' : ''}`;
  bubble.dataset.messageId = message.id;
  const text = document.createElement('span');
  text.textContent = message.text;
  const time = document.createElement('small');
  time.className = 'message-time';
  time.textContent = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(message.createdAt));
  bubble.append(text, time);
  consultantThread.append(bubble);
  consultantThread.scrollTop = consultantThread.scrollHeight;
}

function sendSocket(message) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify(message));
}

function setConnection(online) {
  document
    .querySelector('#connection-dot')
    .classList.toggle('is-online', online);
  document.querySelector('#connection-label').textContent = online
    ? 'Ao vivo'
    : 'Reconectando';
}

function connectSocket() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws?role=consultant`);
  socket.addEventListener('open', () => setConnection(true));
  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.channel === 'orders_channel' && message.type === 'snapshot') {
      ordersById.clear();
      message.orders.forEach((order) => ordersById.set(order.id, order));
      renderOrders();
    }
    if (
      message.channel === 'orders_channel' &&
      (message.type === 'order:created' || message.type === 'order:updated')
    ) {
      ordersById.set(message.order.id, message.order);
      renderOrders();
      if (message.type === 'order:created')
        showToast(`Novo pedido de ${message.order.customerName}.`);
    }
    if (message.channel === 'orders_channel' && message.type === 'order:error')
      showToast(message.message);
    if (message.channel === 'chat_channel' && message.type === 'sessions') {
      sessionsById.clear();
      message.sessions.forEach((session) =>
        sessionsById.set(session.sessionId, session),
      );
      renderSessions();
      renderThread();
    }
    if (message.channel === 'chat_channel' && message.type === 'chat:message') {
      const { message: chatMessage } = message;
      const session = sessionsById.get(chatMessage.sessionId);
      if (!session) return;
      if (!session.messages.some((item) => item.id === chatMessage.id))
        session.messages.push(chatMessage);
      renderSessions();
      if (selectedSessionId === chatMessage.sessionId)
        appendMessage(chatMessage);
    }
  });
  socket.addEventListener('close', () => {
    setConnection(false);
    reconnectTimer = setTimeout(connectSocket, 1800);
  });
  socket.addEventListener('error', () => setConnection(false));
}

orderBoard.addEventListener('click', (event) => {
  const button = event.target.closest('[data-next-order]');
  if (!button) return;
  button.disabled = true;
  sendSocket({
    channel: 'orders_channel',
    type: 'order:update',
    orderId: button.dataset.nextOrder,
    status: button.dataset.nextStatus,
  });
  setTimeout(() => {
    if (button.isConnected) button.disabled = false;
  }, 1200);
});

sessionList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-session-id]');
  if (!button) return;
  selectedSessionId = button.dataset.sessionId;
  renderSessions();
  renderThread();
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#consultant-message-input');
  const text = input.value.trim();
  if (!text || !selectedSessionId) return;
  if (socket?.readyState !== WebSocket.OPEN) {
    showToast('Reconectando ao atendimento...');
    return;
  }
  sendSocket({
    channel: 'chat_channel',
    type: 'chat:message',
    sessionId: selectedSessionId,
    text,
  });
  input.value = '';
});

document.querySelectorAll('.dashboard-tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    const showOrders = tab.dataset.view === 'orders';
    document
      .querySelectorAll('.dashboard-tab')
      .forEach((button) =>
        button.classList.toggle('is-active', button === tab),
      );
    document
      .querySelector('#orders-section')
      .classList.toggle('is-hidden', !showOrders);
    document
      .querySelector('#chat-section')
      .classList.toggle('is-visible', !showOrders);
  }),
);

setInterval(() => {
  if (ordersById.size) renderOrders();
}, 60000);
connectSocket();
