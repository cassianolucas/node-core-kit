import { runHttpAdapterContract } from "node-core-kit-adapter-contract";
import { NodeHttpAdapter } from "../../src/index.js";

runHttpAdapterContract("Node", () => new NodeHttpAdapter());
