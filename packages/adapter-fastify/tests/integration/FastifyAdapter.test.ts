import { runHttpAdapterContract } from "node-core-kit-adapter-contract";
import { FastifyAdapter } from "../../src/index.js";

runHttpAdapterContract("Fastify", () => new FastifyAdapter({ logger: false }));
