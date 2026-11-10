# Bella Così Boutique

Catálogo responsivo e painel de pedidos/chat feitos em HTML, CSS e JavaScript puro. O servidor usa somente módulos nativos do Node.js 22, sem framework ou dependências externas.

## Executar

```sh
node server.js
```

Abra `http://localhost:4173` para o catálogo ou `http://localhost:4173/pedidos` para o painel da boutique. Defina `PORT` para trocar a porta.

## Estrutura

```text
.
├── data.js              # Catálogo, schema e dados iniciais em memória
├── server.js            # HTTP, WebSocket e regras de pedidos/chat
├── README.md
└── public/
    ├── index.html       # Loja e atendimento do cliente
    ├── pedidos.html     # Painel da consultora
    ├── styles.css       # Tokens e estilos mobile-first compartilhados
    ├── app.js           # Catálogo, sacola, checkout e chat do cliente
    └── dashboard.js     # Pedidos e chat da consultora
```

## Dados e tempo real

`data.js` exporta por CommonJS oito produtos, os quatro estados de pedido, três pedidos de demonstração e `databaseSchema`, um schema declarativo para `orders`, `chatSessions` e `chatMessages`. Os dados e mensagens ficam em memória e voltam aos valores iniciais ao reiniciar o servidor.

O endpoint `/ws` usa WebSocket nativo do navegador e dois canais:

- `orders_channel`: `order:create`, `order:created`, `order:confirmed`, `order:update`, `order:updated` e snapshot inicial.
- `chat_channel`: `chat:message`, `chat:name`, `chat:snapshot` e atualização de presença/sessões.

Endpoints de apoio: `GET /api/health`, `/api/products`, `/api/orders` e `/api/schema`. O ID temporário do chat do cliente é guardado em `localStorage`.

## Limites do protótipo

Este projeto demonstra os fluxos localmente; não é uma implantação de produção. O painel não possui autenticação/autorização, os dados não são persistidos, o servidor não implementa limitação de requisições e o WebSocket local não usa TLS. Antes de receber pedidos reais, adicione autenticação de consultora, banco persistente, validação operacional, proteção contra abuso e WSS atrás de um proxy seguro.
