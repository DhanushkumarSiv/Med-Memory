"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authMiddleware(req, res, next) {
    try {
        const auth = req.headers.authorization;
        if (!auth?.startsWith("Bearer ")) {
            res.status(401).json({ message: "Missing bearer token" });
            return;
        }
        const token = auth.slice(7);
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET ?? "medmemory-dev-secret");
        req.user = payload;
        next();
    }
    catch (error) {
        res.status(401).json({ message: "Unauthorized", error: error.message });
    }
}
