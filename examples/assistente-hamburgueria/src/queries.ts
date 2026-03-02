export const MENU = [
    { id: "b1", name: "Zupa Classic", price: 28.5, description: "Pão brioche, blend 160g, queijo cheddar, alface, tomate e maionese da casa." },
    { id: "b2", name: "Bacon Blast", price: 34.0, description: "Pão australiano, blend 160g, muito bacon crocante, geleia de cebola e queijo prato." },
    { id: "b3", name: "Veggie Delight", price: 30.0, description: "Hambúrguer de grão-de-bico, queijo coalho grelhado, rúcula e maionese de ervas." },
    { id: "s1", name: "Batata Rústica", price: 15.0, description: "Porção de batatas com alecrim e páprica." },
    { id: "d1", name: "Shake de Nutella", price: 22.0, description: "Milkshake cremoso de Nutella com chantilly." },
];

export const getMockUserHistory = async (userId: string) => {
    return {
        recentOrders: ["Zupa Classic", "Batata Rústica"],
        loyaltyPoints: 150,
        favoriteItem: "Zupa Classic",
    };
};