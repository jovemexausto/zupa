import { z } from "zod";
import { createAgent, withReply, type AgentConfig, WWebJSMessagingTransport } from "zupa";
import { listMenu, placeOrder, checkLoyaltyPoints, getRecommendations } from "./tools";
import { getMockUserHistory } from "./queries";

export const AgentReplySchema = withReply({
  orderConfirmed: z.boolean().describe("Se o pedido foi finalizado"),
  estimatedDeliveryTime: z.string().optional().describe("Tempo estimado em minutos"),
  recommendationOffered: z.boolean().optional(),
});

export type HamburgueriaReply = z.infer<typeof AgentReplySchema>;

export const hamburgueriaPrompt = `
    Voce e o Bobby, o mestre churrasqueiro e atendente gente boa da "Zupa Burger".
    Sua missao e atender {{ user.displayName }} da forma mais amigavel e eficiente possivel.

    REGRAS DE OURO:
    1. Use girias de forma natural e amigavel (ex: "Fala fera!", "Manda bala!", "No capricho!").
    2. Se for a primeira vez que fala com o cliente, apresente-se com entusiasmo.
    3. Sempre que o cliente pedir o cardapio, use a ferramenta list_menu.
    4. Se o cliente perguntar no que voce pode ajudar, explique que voce cuida de pedidos, mostra o cardapio, verifica pontos de fidelidade e da recomendacoes matadoras.
    5. Mantenha as respostas curtas e focadas no WhatsApp (maximo 4 frases).
    6. Se o cliente estiver indeciso, sugira buscar recomendacoes.

    DADOS DO CLIENTE:
    - Pontos de Fidelidade: {{ userHistory.loyaltyPoints }}
    - Ultimo Pedido: {{ userHistory.recentOrders | join(', ') }}
  `;

export function createHamburgueriaAgent(
  overrides: Partial<AgentConfig<HamburgueriaReply>> = {},
) {
  const baseOnResponse: NonNullable<AgentConfig<HamburgueriaReply>["onResponse"]> = async (
    response,
    ctx,
  ) => {
    if (response.orderConfirmed) {
      console.log(`[ZupaBurger] Pedido confirmado para ${ctx.user.id}`);
    }
  };

  return createAgent<HamburgueriaReply>({
    prompt: hamburgueriaPrompt,
    outputSchema: AgentReplySchema,
    tools: [listMenu, placeOrder, checkLoyaltyPoints, getRecommendations],
    language: "pt",
    context: async (ctx) => ({
      userHistory: await getMockUserHistory(ctx.user.id),
    }),
    onResponse: baseOnResponse,
    providers: {
      transport: new WWebJSMessagingTransport(),
    },
    ...overrides,
  });
}
