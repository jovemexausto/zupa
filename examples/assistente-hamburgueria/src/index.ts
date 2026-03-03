import type { WWebJSAuthPayload } from "zupa";
import { config } from "dotenv";
import { generateAsciiQR } from "./qr";
import { createHamburgueriaAgent } from "./agent";

config();

const agent = createHamburgueriaAgent();

agent.on<WWebJSAuthPayload>("auth:request", (payload) =>
  generateAsciiQR(payload.qrString).then(console.log),
);
agent.on("auth:ready", () => console.log("♨️ Bobby da Zupa Burger está online e com a chapa quente!"));

void agent.start().catch(console.error);
