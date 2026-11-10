const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const productGrid = document.querySelector('#product-grid');
const categoryFilters = document.querySelector('#category-filters');
const searchInput = document.querySelector('#product-search');
const productDialog = document.querySelector('#product-dialog');
const bagDrawer = document.querySelector('#bag-drawer');
const drawerScrim = document.querySelector('#drawer-scrim');
const checkoutFeedback = document.querySelector('#checkout-feedback');
const toast = document.querySelector('#toast');

let products = [];
let activeCategory = 'Todas';
let selectedProduct = null;
let selectedSize = '';
let selectedColor = '';
let selectedQuantity = 1;
let pendingCheckout = false;
let socket;
let reconnectTimer;
let toastTimer;
let bag = readStorage('bellaCosiBag', []);
const sessionId = getSessionId();
const currencyFormat = (value) => currency.format(value);

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function getSessionId() {
  let id = localStorage.getItem('bellaCosiSessionId');
  if (!id) {
    id =
      globalThis.crypto?.randomUUID?.() ??
      `bc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('bellaCosiSessionId', id);
  }
  return id;
}

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
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function renderProducts() {
  const term = searchInput.value.trim().toLocaleLowerCase('pt-BR');
  const filtered = products.filter((product) => {
    const matchesCategory =
      activeCategory === 'Todas' || product.category === activeCategory;
    const matchesSearch =
      `${product.name} ${product.category} ${product.description}`
        .toLocaleLowerCase('pt-BR')
        .includes(term);
    return matchesCategory && matchesSearch;
  });
  document.querySelector('#result-count').textContent =
    `${filtered.length} ${filtered.length === 1 ? 'peça' : 'peças'}`;
  document.querySelector('#empty-state').hidden = filtered.length !== 0;
  productGrid.innerHTML = filtered
    .map(
      (product, index) => `
    <article class="product-card">
      <div class="product-visual">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
        ${product.tag ? `<span class="product-tag">${escapeHtml(product.tag)}</span>` : ''}
        <button class="quick-add" type="button" data-product="${escapeHtml(product.id)}" aria-label="Ver detalhes de ${escapeHtml(product.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>
      <div class="product-info">
        <p class="product-category">${escapeHtml(product.category)}</p>
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <p class="product-price">${currencyFormat(product.price)}</p>
        <div class="product-swatches" aria-label="Cores disponíveis">${product.colors.map((color) => `<span class="product-swatch" title="${escapeHtml(color.name)}" style="background:${escapeHtml(color.hex)}"></span>`).join('')}</div>
      </div>
    </article>`,
    )
    .join('');
}

function openProduct(productId) {
  selectedProduct = products.find((product) => product.id === productId);
  if (!selectedProduct) return;
  selectedSize = selectedProduct.sizes[0];
  selectedColor = selectedProduct.colors[0].name;
  selectedQuantity = 1;
  productDialog.innerHTML = `
    <div class="product-dialog-content">
      <img class="dialog-product-image" src="${escapeHtml(selectedProduct.image)}" alt="${escapeHtml(selectedProduct.name)}">
      <div class="dialog-product-details">
        <button class="icon-button dialog-close" type="button" aria-label="Fechar detalhes">×</button>
        <p class="eyebrow">${escapeHtml(selectedProduct.category)}</p>
        <h2 id="product-dialog-title">${escapeHtml(selectedProduct.name)}</h2>
        <p class="dialog-price">${currencyFormat(selectedProduct.price)}</p>
        <p class="dialog-description">${escapeHtml(selectedProduct.description)}</p>
        <span class="choice-label">Tamanho</span>
        <div class="size-options">${selectedProduct.sizes.map((size) => `<button class="choice-button ${size === selectedSize ? 'is-selected' : ''}" type="button" data-size="${escapeHtml(size)}" aria-pressed="${size === selectedSize}">${escapeHtml(size)}</button>`).join('')}</div>
        <span class="choice-label">Cor · <span id="selected-color-name">${escapeHtml(selectedColor)}</span></span>
        <div class="color-options">${selectedProduct.colors.map((color, index) => `<button class="choice-button ${index === 0 ? 'is-selected' : ''}" type="button" data-color="${escapeHtml(color.name)}" aria-pressed="${index === 0}"><i class="color-dot" style="background:${escapeHtml(color.hex)}"></i>${escapeHtml(color.name)}</button>`).join('')}</div>
        <span class="choice-label">Quantidade</span>
        <div class="quantity-field"><button type="button" data-quantity="-1" aria-label="Diminuir quantidade">−</button><output id="selected-quantity">1</output><button type="button" data-quantity="1" aria-label="Aumentar quantidade">+</button></div>
        <button class="button button-primary add-to-bag" type="button">Adicionar à sacola <span aria-hidden="true">→</span></button>
      </div>
    </div>`;
  productDialog.showModal();
}

function persistBag() {
  localStorage.setItem('bellaCosiBag', JSON.stringify(bag));
  renderBag();
}

function addToBag(product, size, color, quantity) {
  const existing = bag.find(
    (line) =>
      line.productId === product.id &&
      line.size === size &&
      line.color === color,
  );
  if (existing) existing.quantity = Math.min(10, existing.quantity + quantity);
  else
    bag.push({
      productId: product.id,
      size,
      color,
      quantity,
      unitPrice: product.price,
    });
  persistBag();
  productDialog.close();
  showToast(`${product.name} foi adicionada à sacola.`);
}

function renderBag() {
  bag = bag.filter((line) =>
    products.some((product) => product.id === line.productId),
  );
  const count = bag.reduce((sum, line) => sum + line.quantity, 0);
  const total = bag.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  document.querySelector('#bag-count').textContent = count;
  document.querySelector('#drawer-item-count').textContent = count
    ? `(${count})`
    : '';
  document.querySelector('#bag-items').innerHTML = bag
    .map((line, index) => {
      const product = products.find((entry) => entry.id === line.productId);
      return `<article class="bag-line">
      <img src="${escapeHtml(product.image)}" alt="">
      <div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(line.color)} · Tam. ${escapeHtml(line.size)}</p><p class="bag-line-price">${currencyFormat(line.unitPrice * line.quantity)}</p>
        <div class="quantity-control"><button type="button" data-bag-quantity="-1" data-index="${index}" aria-label="Diminuir quantidade">−</button><span>${line.quantity}</span><button type="button" data-bag-quantity="1" data-index="${index}" aria-label="Aumentar quantidade">+</button></div>
      </div><button class="remove-line" type="button" data-remove-line="${index}" aria-label="Remover ${escapeHtml(product.name)}">×</button>
    </article>`;
    })
    .join('');
  document.querySelector('#bag-empty').hidden = bag.length !== 0;
  document.querySelector('#checkout-area').hidden = bag.length === 0;
  document.querySelector('#bag-subtotal').textContent = currencyFormat(total);
  if (bag.length === 0) checkoutFeedback.textContent = '';
}

function openBag() {
  drawerScrim.hidden = false;
  bagDrawer.inert = false;
  bagDrawer.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => bagDrawer.classList.add('is-open'));
  document.querySelector('.close-drawer').focus();
}

function closeBag() {
  bagDrawer.classList.remove('is-open');
  bagDrawer.setAttribute('aria-hidden', 'true');
  bagDrawer.inert = true;
  drawerScrim.hidden = true;
}

function connectSocket() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(
    `${protocol}//${location.host}/ws?role=customer&sessionId=${encodeURIComponent(sessionId)}`,
  );
  socket.addEventListener('open', () => {
    const savedName = readStorage('bellaCosiCustomerName', '');
    if (savedName)
      sendSocket({
        channel: 'chat_channel',
        type: 'chat:name',
        name: savedName,
      });
  });
  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.channel === 'chat_channel' && message.type === 'chat:snapshot')
      renderCustomerMessages(message.session.messages ?? []);
    if (
      message.channel === 'chat_channel' &&
      message.type === 'chat:message' &&
      message.message.sessionId === sessionId
    )
      appendChatMessage(message.message, 'customer-messages');
    if (
      message.channel === 'orders_channel' &&
      message.type === 'order:confirmed' &&
      pendingCheckout
    ) {
      pendingCheckout = false;
      bag = [];
      persistBag();
      closeBag();
      document.querySelector('#confirmation-order-id').textContent =
        message.order.id;
      document.querySelector('#confirmation-dialog').showModal();
      document.querySelector('#checkout-form').reset();
      localStorage.removeItem('bellaCosiCustomerName');
    }
    if (
      message.channel === 'orders_channel' &&
      message.type === 'order:error'
    ) {
      pendingCheckout = false;
      document.querySelector('.checkout-submit').disabled = false;
      checkoutFeedback.textContent =
        message.message ?? 'Não foi possível enviar o pedido.';
    }
  });
  socket.addEventListener('close', () => {
    reconnectTimer = setTimeout(connectSocket, 1800);
  });
}

function sendSocket(message) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify(message));
}

function appendChatMessage(message, targetId) {
  const container = document.getElementById(targetId);
  if (
    !container ||
    container.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)
  )
    return;
  const welcome = container.querySelector('.chat-welcome');
  if (welcome) welcome.remove();
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${(message.sender === 'customer' && targetId === 'customer-messages') || (message.sender === 'consultant' && targetId === 'consultant-thread') ? 'is-own' : ''}`;
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
  container.append(bubble);
  container.scrollTop = container.scrollHeight;
}

function renderCustomerMessages(messages) {
  const container = document.querySelector('#customer-messages');
  container.innerHTML =
    '<p class="chat-welcome">Olá! Que bom ter você por aqui. Como podemos ajudar?</p>';
  messages.forEach((message) =>
    appendChatMessage(message, 'customer-messages'),
  );
}

productGrid.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-product]');
  if (trigger) openProduct(trigger.dataset.product);
});

categoryFilters.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-category]');
  if (!chip) return;
  activeCategory = chip.dataset.category;
  categoryFilters
    .querySelectorAll('.filter-chip')
    .forEach((button) => button.classList.toggle('is-active', button === chip));
  renderProducts();
});

searchInput.addEventListener('input', renderProducts);

document.querySelectorAll('[data-category-link]').forEach((link) =>
  link.addEventListener('click', () => {
    activeCategory = link.dataset.categoryLink;
    categoryFilters
      .querySelectorAll('.filter-chip')
      .forEach((button) =>
        button.classList.toggle(
          'is-active',
          button.dataset.category === activeCategory,
        ),
      );
    renderProducts();
  }),
);

productDialog.addEventListener('click', (event) => {
  if (event.target.closest('.dialog-close')) productDialog.close();
  const sizeButton = event.target.closest('[data-size]');
  if (sizeButton) {
    selectedSize = sizeButton.dataset.size;
    productDialog.querySelectorAll('[data-size]').forEach((button) => {
      button.classList.toggle('is-selected', button === sizeButton);
      button.setAttribute('aria-pressed', String(button === sizeButton));
    });
  }
  const colorButton = event.target.closest('[data-color]');
  if (colorButton) {
    selectedColor = colorButton.dataset.color;
    productDialog.querySelector('#selected-color-name').textContent =
      selectedColor;
    productDialog.querySelectorAll('[data-color]').forEach((button) => {
      button.classList.toggle('is-selected', button === colorButton);
      button.setAttribute('aria-pressed', String(button === colorButton));
    });
  }
  const quantityButton = event.target.closest('[data-quantity]');
  if (quantityButton) {
    selectedQuantity = Math.min(
      10,
      Math.max(1, selectedQuantity + Number(quantityButton.dataset.quantity)),
    );
    productDialog.querySelector('#selected-quantity').textContent =
      selectedQuantity;
  }
  if (event.target.closest('.add-to-bag') && selectedProduct)
    addToBag(selectedProduct, selectedSize, selectedColor, selectedQuantity);
});

document.querySelector('.bag-trigger').addEventListener('click', openBag);
document.querySelector('.close-drawer').addEventListener('click', closeBag);
drawerScrim.addEventListener('click', closeBag);
document
  .querySelector('.continue-shopping')
  .addEventListener('click', closeBag);
document.querySelector('#bag-items').addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove-line]');
  const quantity = event.target.closest('[data-bag-quantity]');
  if (remove) bag.splice(Number(remove.dataset.removeLine), 1);
  if (quantity) {
    const line = bag[Number(quantity.dataset.index)];
    line.quantity = Math.min(
      10,
      Math.max(0, line.quantity + Number(quantity.dataset.bagQuantity)),
    );
    if (line.quantity === 0) bag.splice(Number(quantity.dataset.index), 1);
  }
  if (remove || quantity) persistBag();
});

document.querySelector('#checkout-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!bag.length || pendingCheckout) return;
  if (socket?.readyState !== WebSocket.OPEN) {
    checkoutFeedback.textContent =
      'Reconectando à boutique. Tente novamente em instantes.';
    return;
  }
  const data = new FormData(event.currentTarget);
  pendingCheckout = true;
  document.querySelector('.checkout-submit').disabled = true;
  checkoutFeedback.textContent = 'Enviando seu pedido...';
  sendSocket({
    channel: 'orders_channel',
    type: 'order:create',
    customerName: data.get('customerName'),
    phone: data.get('phone'),
    items: bag.map(({ productId, size, color, quantity }) => ({
      productId,
      size,
      color,
      quantity,
    })),
  });
  localStorage.setItem(
    'bellaCosiCustomerName',
    String(data.get('customerName')).trim(),
  );
  sendSocket({
    channel: 'chat_channel',
    type: 'chat:name',
    name: String(data.get('customerName')).trim(),
  });
  setTimeout(() => {
    if (pendingCheckout) {
      pendingCheckout = false;
      document.querySelector('.checkout-submit').disabled = false;
      checkoutFeedback.textContent =
        'A confirmação demorou. Verifique a conexão e tente novamente.';
    }
  }, 8000);
});

document
  .querySelector('.confirmation-close')
  .addEventListener('click', () =>
    document.querySelector('#confirmation-dialog').close(),
  );
document
  .querySelector('.dialog-close')
  ?.addEventListener('click', () => productDialog.close());
document
  .querySelector('.confirmation-dialog .dialog-close')
  .addEventListener('click', () =>
    document.querySelector('#confirmation-dialog').close(),
  );

const chatLauncher = document.querySelector('#chat-launcher');
const chatWidget = document.querySelector('#customer-chat');
function toggleChat(open) {
  chatWidget.hidden = !open;
  chatLauncher.setAttribute('aria-expanded', String(open));
  if (open) document.querySelector('#customer-message-input').focus();
}
chatLauncher.addEventListener('click', () => toggleChat(chatWidget.hidden));
document
  .querySelector('.close-chat')
  .addEventListener('click', () => toggleChat(false));
document
  .querySelector('#customer-chat-form')
  .addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.querySelector('#customer-message-input');
    const text = input.value.trim();
    if (!text) return;
    if (socket?.readyState !== WebSocket.OPEN) {
      showToast('Reconectando ao atendimento...');
      return;
    }
    sendSocket({ channel: 'chat_channel', type: 'chat:message', text });
    input.value = '';
  });

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && bagDrawer.classList.contains('is-open'))
    closeBag();
});

fetch('/api/products')
  .then((response) => response.json())
  .then((data) => {
    products = data;
    renderProducts();
    renderBag();
    connectSocket();
  })
  .catch(() => {
    productGrid.innerHTML =
      '<p class="empty-state">Não foi possível carregar a coleção agora.</p>';
  });
