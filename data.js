const products = [
  {
    id: 'vestido-livia',
    name: 'Vestido Lívia',
    category: 'Vestidos',
    price: 489,
    image:
      'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=85',
    description:
      'Crepe fluido, cintura marcada e movimento delicado para ocasiões especiais.',
    sizes: ['PP', 'P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Vinho', hex: '#813d4b' },
      { name: 'Preto', hex: '#262322' },
    ],
    tag: 'Mais vendido',
  },
  {
    id: 'blusa-aurora',
    name: 'Blusa Aurora',
    category: 'Blusas',
    price: 249,
    image:
      'https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=900&q=85',
    description:
      'Blusa em viscose premium com decote suave e caimento impecável.',
    sizes: ['PP', 'P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Marfim', hex: '#e9e1d3' },
      { name: 'Verde oliva', hex: '#69745e' },
    ],
    tag: 'Novo',
  },
  {
    id: 'calca-milano',
    name: 'Calça Milano',
    category: 'Calças',
    price: 379,
    image:
      'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=85',
    description: 'Alfaiataria de cintura alta com corte reto e toque macio.',
    sizes: ['PP', 'P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Areia', hex: '#cbbda8' },
      { name: 'Preto', hex: '#262322' },
    ],
    tag: '',
  },
  {
    id: 'conjunto-celeste',
    name: 'Conjunto Celeste',
    category: 'Conjuntos',
    price: 659,
    image:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=85',
    description:
      'Duas peças coordenadas em linho misto, versáteis do dia à noite.',
    sizes: ['PP', 'P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Azul profundo', hex: '#536777' },
      { name: 'Terracota', hex: '#a65e49' },
    ],
    tag: 'Edição limitada',
  },
  {
    id: 'vestido-chiara',
    name: 'Vestido Chiara',
    category: 'Vestidos',
    price: 549,
    image:
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=85',
    description:
      'Modelagem envelope e estampa botânica exclusiva em tecido leve.',
    sizes: ['PP', 'P', 'M', 'G', 'GG'],
    colors: [{ name: 'Floral', hex: '#9a7460' }],
    tag: '',
  },
  {
    id: 'blusa-luce',
    name: 'Blusa Luce',
    category: 'Blusas',
    price: 289,
    image:
      'https://images.unsplash.com/photo-1566206091558-7f218b696731?auto=format&fit=crop&w=900&q=85',
    description:
      'Tricot leve com textura delicada e acabamento feito para durar.',
    sizes: ['PP', 'P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Off-white', hex: '#e9e4dc' },
      { name: 'Caramelo', hex: '#a57955' },
    ],
    tag: '',
  },
  {
    id: 'saia-firenze',
    name: 'Saia Firenze',
    category: 'Saias',
    price: 329,
    image:
      'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=900&q=85',
    description: 'Saia midi plissada com cintura confortável e balanço sutil.',
    sizes: ['PP', 'P', 'M', 'G', 'GG'],
    colors: [
      { name: 'Café', hex: '#6f5344' },
      { name: 'Champagne', hex: '#d8c8ad' },
    ],
    tag: '',
  },
  {
    id: 'bolsa-amalfi',
    name: 'Bolsa Amalfi',
    category: 'Acessórios',
    price: 419,
    image:
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85',
    description:
      'Bolsa estruturada em material macio, com alça ajustável e espaço essencial.',
    sizes: ['Único'],
    colors: [
      { name: 'Caramelo', hex: '#a57955' },
      { name: 'Preto', hex: '#262322' },
    ],
    tag: 'Favorito',
  },
];

const orderStatuses = [
  'Novo Pedido',
  'Em Separação',
  'Aguardando Pagamento',
  'Concluído',
];

const databaseSchema = {
  orders: {
    id: 'string (primary key)',
    customerName: 'string',
    phone: 'string',
    items: 'array<{ productId, name, size, color, quantity, unitPrice }>',
    total: 'number (BRL)',
    status: `enum(${orderStatuses.join(' | ')})`,
    createdAt: 'ISO-8601 datetime',
    updatedAt: 'ISO-8601 datetime',
  },
  chatSessions: {
    sessionId: 'string (primary key, temporary browser session)',
    customerName: 'string',
    online: 'boolean',
    createdAt: 'ISO-8601 datetime',
    lastSeenAt: 'ISO-8601 datetime',
  },
  chatMessages: {
    id: 'string (primary key)',
    sessionId: 'string (foreign key -> chatSessions.sessionId)',
    sender: 'customer | consultant',
    text: 'string',
    createdAt: 'ISO-8601 datetime',
  },
};

const now = Date.now();

const orders = [
  {
    id: 'BC-1024',
    customerName: 'Mariana Costa',
    phone: '(11) 98821-4020',
    items: [
      {
        productId: 'vestido-livia',
        name: 'Vestido Lívia',
        size: 'M',
        color: 'Vinho',
        quantity: 1,
        unitPrice: 489,
      },
    ],
    total: 489,
    status: 'Novo Pedido',
    createdAt: new Date(now - 47 * 60000).toISOString(),
    updatedAt: new Date(now - 47 * 60000).toISOString(),
  },
  {
    id: 'BC-1025',
    customerName: 'Isabela Mendes',
    phone: '(21) 99764-1182',
    items: [
      {
        productId: 'blusa-aurora',
        name: 'Blusa Aurora',
        size: 'P',
        color: 'Marfim',
        quantity: 1,
        unitPrice: 249,
      },
      {
        productId: 'calca-milano',
        name: 'Calça Milano',
        size: 'P',
        color: 'Areia',
        quantity: 1,
        unitPrice: 379,
      },
    ],
    total: 628,
    status: 'Em Separação',
    createdAt: new Date(now - 26 * 60000).toISOString(),
    updatedAt: new Date(now - 14 * 60000).toISOString(),
  },
  {
    id: 'BC-1026',
    customerName: 'Camila Ribeiro',
    phone: '(31) 99136-7704',
    items: [
      {
        productId: 'conjunto-celeste',
        name: 'Conjunto Celeste',
        size: 'G',
        color: 'Terracota',
        quantity: 1,
        unitPrice: 659,
      },
    ],
    total: 659,
    status: 'Aguardando Pagamento',
    createdAt: new Date(now - 8 * 60000).toISOString(),
    updatedAt: new Date(now - 3 * 60000).toISOString(),
  },
];

const chatSessions = new Map();

module.exports = {
  products,
  orderStatuses,
  databaseSchema,
  orders,
  chatSessions,
};
