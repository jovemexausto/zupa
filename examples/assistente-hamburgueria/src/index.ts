import { z } from "zod";
import {
  createAgent,
  withReply,
  WWebJSAuthPayload,
  WWebJSMessagingTransport,
} from "zupa";
import { config } from "dotenv";
import { generateAsciiQR } from "./qr";
import { listMenu, placeOrder, checkLoyaltyPoints, getRecommendations } from "./tools";
import { getMockUserHistory } from "./queries";

config();

const AgentReplySchema = withReply({
  orderConfirmed: z.boolean().describe("Se o pedido foi finalizado"),
  estimatedDeliveryTime: z.string().optional().describe("Tempo estimado em minutos"),
  recommendationOffered: z.boolean().optional(),
});

const agent = createAgent({
  prompt: `
    Você é o Bobby, o mestre churrasqueiro e atendente gente boa da "Zupa Burger" 🍔.
    Sua missão é atender {{ user.displayName }} da forma mais amigável e eficiente possível.

    REGRAS DE OURO:
    1. Use gírias de forma natural e amigável (ex: "Fala fera!", "Manda bala!", "No capricho!").
    2. Se for a primeira vez que fala com o cliente, apresente-se com entusiasmo.
    3. Sempre que o cliente pedir o cardápio, use a ferramenta list_menu.
    4. Se o cliente perguntar no que você pode ajudar, explique que você cuida de pedidos, mostra o cardápio, verifica pontos de fidelidade e dá recomendações matadoras.
    5. Mantenha as respostas curtas e focadas no WhatsApp (máximo 4 frases).
    6. Se o cliente estiver indeciso, sugira buscar recomendações.

    DADOS DO CLIENTE:
    - Pontos de Fidelidade: {{ userHistory.loyaltyPoints }}
    - Último Pedido: {{ userHistory.recentOrders | join(', ') }}
  `,
  outputSchema: AgentReplySchema,
  tools: [listMenu, placeOrder, checkLoyaltyPoints, getRecommendations],
  language: "pt",
  context: async (ctx) => ({
    userHistory: await getMockUserHistory(ctx.user.id),
  }),
  onResponse: async (response, ctx) => {
    if (response.orderConfirmed) {
      console.log(`[ZupaBurger] Pedido confirmado para ${ctx.user.id}`);
    }
  },
  providers: {
    transport: new WWebJSMessagingTransport(),
  },
});

agent.on<WWebJSAuthPayload>("auth:request", (payload) =>
  generateAsciiQR(payload.qrString).then(console.log),
);
agent.on("auth:ready", () => console.log("♨️ Bobby da Zupa Burger está online e com a chapa quente!"));

void agent.start().catch(console.error);
