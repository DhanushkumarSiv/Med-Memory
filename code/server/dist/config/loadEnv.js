"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
let loaded = false;
function loadEnv() {
    if (loaded) {
        return;
    }
    const candidates = [
        path_1.default.resolve(process.cwd(), ".env"),
        path_1.default.resolve(process.cwd(), "..", ".env"),
        path_1.default.resolve(__dirname, "..", "..", "..", ".env"),
    ];
    for (const envPath of candidates) {
        if (fs_1.default.existsSync(envPath)) {
            dotenv_1.default.config({ path: envPath });
            loaded = true;
            return;
        }
    }
    dotenv_1.default.config();
    loaded = true;
}
