import Fastify from "fastify";
import { randomUUID } from "node:crypto";

// logger: true prints one JSON line per request (Fastify uses pino)
const app = Fastify({ logger: true });

// In-memory store. Lost on restart; a database replaces it in Stage 6.
const orders = [];

const createOrderSchema = {
  body: {
    type: "object",
    required: ["item", "qty"],
    additionalProperties: false,
    properties: {
      item: { type: "string", minLength: 1 },
      qty: { type: "integer", minimum: 1 },
    },
  },
};

app.get("/healthz", async () => ({ status: "ok" }));

app.get("/orders", async () => orders);

app.post("/orders", { schema: createOrderSchema }, async (request, reply) => {
  const order = {
    id: randomUUID(),
    ...request.body,
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  return reply.code(201).send(order);
});

// 0.0.0.0 = listen on all network interfaces, needed inside a container
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
