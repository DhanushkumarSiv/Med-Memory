import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AuthUser } from "../types/auth";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      res.status(401).json({ message: "Missing bearer token" });
      return;
    }

    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? "medmemory-dev-secret") as AuthUser;
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized", error: (error as Error).message });
  }
}
