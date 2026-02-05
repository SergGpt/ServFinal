import { createRequire } from "module";

const require = createRequire(import.meta.url);
const driftPackage = require("./index.js");

export default driftPackage;
