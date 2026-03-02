import { z } from "zod";
import type { Tool } from "zupa";
import { MENU, getMockUserHistory } from "./queries";

export const listMenu: Tool<z.ZodTypeAny> = {
    name: "list_menu",
    description: "Lista o cardápio completo da hamburgueria.",
    parameters: z.object({}),
    async handler(_, ctx) {
        await ctx.resources.transport.sendMessage({
            to: ctx.replyTarget,
            type: "text",
            body: "📅 Consultando nosso cardápio atualizado...",
        });
        const menuStr = MENU.map(item => `🍔 *${item.name}* - R$ ${item.price.toFixed(2)}\n_${item.description}_`).join("\n\n");
        return `Cardápio enviado: \n\n${menuStr}`;
    },
};

const PlaceOrderSchema = z.object({
    items: z.array(z.string()).min(1),
    observation: z.string().optional(),
});

export const placeOrder: Tool<typeof PlaceOrderSchema> = {
    name: "place_order",
    description: "Realiza o pedido do cliente.",
    parameters: PlaceOrderSchema,
    async handler(params, ctx) {
        await ctx.resources.transport.sendMessage({
            to: ctx.replyTarget,
            type: "text",
            body: "🛒 Registrando seu pedido no sistema...",
        });
        // Simulação de delay
        await new Promise(resolve => setTimeout(resolve, 800));
        return `Pedido realizado com sucesso! Itens: ${params.items.join(", ")}. Observação: ${params.observation || "Nenhuma"}.`;
    },
};

export const checkLoyaltyPoints: Tool<z.ZodTypeAny> = {
    name: "check_loyalty_points",
    description: "Verifica os pontos de fidelidade do cliente.",
    parameters: z.object({}),
    async handler(_, ctx) {
        const history = await getMockUserHistory(ctx.user.id);
        return `Você possui ${history.loyaltyPoints} pontos no Zupa Club!`;
    },
};

export const getRecommendations: Tool<z.ZodTypeAny> = {
    name: "get_recommendations",
    description: "Busca recomendações personalizadas baseadas no histórico.",
    parameters: z.object({}),
    async handler(_, ctx) {
        await ctx.resources.transport.sendMessage({
            to: ctx.replyTarget,
            type: "text",
            body: "🧐 Analisando seu gosto refinado...",
        });
        const history = await getMockUserHistory(ctx.user.id);
        const fav = history.favoriteItem || "Zupa Classic";
        return `Com base no seu histórico, você vai amar o nosso Bacon Blast, já que seu favorito é o ${fav}!`;
    },
};
