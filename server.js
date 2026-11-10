const { createServer } = require('node:http');
const { createHash, randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { extname, join, normalize, sep } = require('node:path');
const {
  chatSessions,
  databaseSchema,
  orderStatuses,
  orders,
  products,
} = require('./data.js');

const root = join(__dirname, 'public');
const port = Number(process.env.PORT ?? 4173);
const connected = new Set();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function sendFrame(socket, payload, opcode = 0x1) {
  if (socket.destroyed || !socket.writable) return;
  const body = Buffer.from(
    typeof payload === 'string' ? payload : JSON.stringify(payload),
  );
  let header;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  socket.write(Buffer.concat([header, body]));
}

function broadcast(channel, type, payload, predicate = () => true) {
  const message = { channel, type, ...payload };
  for (const client of connected) {
    if (predicate(client)) sendFrame(client.socket, message);
  }
}

function sessionSnapshot() {
  return [...chatSessions.values()].map(({ messages, ...session }) => ({
    ...session,
    messages,
  }));
}

function broadcastPresence() {
  broadcast('chat_channel', 'sessions', { sessions: sessionSnapshot() });
}

function updateOrder(orderId, status) {
  const order = orders.find((entry) => entry.id === orderId);
  if (!order || !orderStatuses.includes(status)) return null;
  const previous = orderStatuses.indexOf(order.status);
  if (orderStatuses.indexOf(status) !== previous + 1) return null;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  broadcast('orders_channel', 'order:updated', { order });
  return order;
}

function createOrder(payload) {
  const customerName = String(payload.customerName ?? '')
    .trim()
    .slice(0, 100);
  const phone = String(payload.phone ?? '')
    .trim()
    .slice(0, 30);
  if (
    customerName.length < 2 ||
    phone.length < 8 ||
    !Array.isArray(payload.items) ||
    !payload.items.length
  )
    return null;

  const items = [];
  for (const requested of payload.items) {
    const product = products.find((entry) => entry.id === requested.productId);
    const quantity = Math.min(10, Math.max(1, Number(requested.quantity) || 1));
    const size = String(requested.size ?? '');
    const color = product?.colors.find(
      (entry) => entry.name === requested.color,
    )?.name;
    if (!product || !product.sizes.includes(size) || !color) return null;
    items.push({
      productId: product.id,
      name: product.name,
      size,
      color,
      quantity,
      unitPrice: product.price,
    });
  }

  const timestamp = new Date().toISOString();
  const order = {
    id: `BC-${1027 + orders.length - 3}`,
    customerName,
    phone,
    items,
    total: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    status: orderStatuses[0],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  orders.push(order);
  broadcast('orders_channel', 'order:created', { order });
  return order;
}

function handleMessage(client, text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }

  if (message.channel === 'orders_channel') {
    if (message.type === 'order:create' && client.role === 'customer') {
      const order = createOrder(message);
      sendFrame(client.socket, {
        channel: 'orders_channel',
        type: order ? 'order:confirmed' : 'order:error',
        order,
        message: order ? undefined : 'Confira seus dados e os itens da sacola.',
      });
    }
    if (message.type === 'order:update' && client.role === 'consultant') {
      const order = updateOrder(
        String(message.orderId),
        String(message.status),
      );
      if (!order)
        sendFrame(client.socket, {
          channel: 'orders_channel',
          type: 'order:error',
          message: 'Não foi possível avançar este pedido.',
        });
    }
  }

  if (message.channel === 'chat_channel') {
    if (message.type === 'chat:message') {
      const sessionId =
        client.role === 'customer'
          ? client.sessionId
          : String(message.sessionId ?? '');
      const session = chatSessions.get(sessionId);
      const textValue = String(message.text ?? '')
        .trim()
        .slice(0, 2000);
      if (!session || !textValue) return;
      const chatMessage = {
        id: randomUUID(),
        sessionId,
        sender: client.role === 'consultant' ? 'consultant' : 'customer',
        text: textValue,
        createdAt: new Date().toISOString(),
      };
      session.messages.push(chatMessage);
      session.lastSeenAt = chatMessage.createdAt;
      broadcast(
        'chat_channel',
        'chat:message',
        { message: chatMessage },
        (recipient) =>
          recipient.role === 'consultant' || recipient.sessionId === sessionId,
      );
      broadcastPresence();
    }
    if (message.type === 'chat:name' && client.role === 'customer') {
      const session = chatSessions.get(client.sessionId);
      if (session) {
        session.customerName =
          String(message.name ?? '')
            .trim()
            .slice(0, 100) || 'Cliente';
        broadcastPresence();
      }
    }
  }
}

function parseFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);
  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (client.buffer.length < 4) return;
      length = client.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (client.buffer.length < 10) return;
      const largeLength = client.buffer.readBigUInt64BE(2);
      if (largeLength > 1_000_000n) return client.socket.destroy();
      length = Number(largeLength);
      offset = 10;
    }
    const maskBytes = masked ? 4 : 0;
    if (client.buffer.length < offset + maskBytes + length) return;
    const mask = masked ? client.buffer.subarray(offset, offset + 4) : null;
    const start = offset + maskBytes;
    const body = Buffer.from(client.buffer.subarray(start, start + length));
    client.buffer = client.buffer.subarray(start + length);
    if (mask)
      for (let index = 0; index < body.length; index += 1)
        body[index] ^= mask[index % 4];

    if (opcode === 0x8) {
      sendFrame(client.socket, '', 0x8);
      client.socket.end();
      return;
    }
    if (opcode === 0x9) sendFrame(client.socket, body, 0xa);
    if (opcode === 0x1 && first & 0x80)
      handleMessage(client, body.toString('utf8'));
  }
}

async function serveFile(response, pathname) {
  const route =
    pathname === '/' || pathname === '/catalogo'
      ? '/index.html'
      : pathname === '/pedidos'
        ? '/pedidos.html'
        : pathname;
  const filePath = normalize(join(root, route.replace(/^\/+/, '')));
  if (filePath !== root && !filePath.startsWith(root + sep))
    return sendJson(response, 403, { error: 'Acesso negado.' });
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'content-type':
        contentTypes[extname(filePath)] ?? 'application/octet-stream',
    });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: 'Página não encontrada.' });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url,
    `http://${request.headers.host ?? 'localhost'}`,
  );
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, {
      ok: true,
      service: 'bella-cosi',
      clients: connected.size,
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/products')
    return sendJson(response, 200, products);
  if (request.method === 'GET' && url.pathname === '/api/orders')
    return sendJson(response, 200, orders);
  if (request.method === 'GET' && url.pathname === '/api/schema')
    return sendJson(response, 200, databaseSchema);
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return sendJson(response, 405, { error: 'Método não permitido.' });
  return serveFile(response, url.pathname);
});

server.on('upgrade', (request, socket) => {
  const url = new URL(
    request.url,
    `http://${request.headers.host ?? 'localhost'}`,
  );
  const key = request.headers['sec-websocket-key'];
  if (
    url.pathname !== '/ws' ||
    !key ||
    request.headers.upgrade?.toLowerCase() !== 'websocket'
  ) {
    socket.destroy();
    return;
  }

  const accept = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  const role =
    url.searchParams.get('role') === 'consultant' ? 'consultant' : 'customer';
  const sessionId =
    role === 'customer'
      ? (url.searchParams.get('sessionId') || randomUUID()).slice(0, 80)
      : null;
  const client = { socket, role, sessionId, buffer: Buffer.alloc(0) };
  connected.add(client);

  if (sessionId) {
    let session = chatSessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        customerName: 'Cliente',
        online: true,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        messages: [],
      };
      chatSessions.set(sessionId, session);
    }
    session.online = true;
    session.lastSeenAt = new Date().toISOString();
    sendFrame(socket, {
      channel: 'chat_channel',
      type: 'chat:snapshot',
      session,
    });
  }

  sendFrame(socket, { channel: 'orders_channel', type: 'snapshot', orders });
  if (role === 'consultant')
    sendFrame(socket, {
      channel: 'chat_channel',
      type: 'sessions',
      sessions: sessionSnapshot(),
    });
  broadcastPresence();

  socket.on('data', (chunk) => parseFrames(client, chunk));
  socket.on('close', () => {
    connected.delete(client);
    if (
      sessionId &&
      ![...connected].some((entry) => entry.sessionId === sessionId)
    ) {
      const session = chatSessions.get(sessionId);
      if (session) {
        session.online = false;
        session.lastSeenAt = new Date().toISOString();
      }
    }
    broadcastPresence();
  });
  socket.on('error', () => connected.delete(client));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Bella Così Boutique disponível em http://localhost:${port}`);
});
