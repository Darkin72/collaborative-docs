import { Router, Request, Response } from "express";
import { validateCredentials } from "../data/accounts";
import { LoginRequest, LoginResponse } from "../types/api.types";

const router = Router();

router.post(
  "/login",
  (
    req: Request<{}, LoginResponse, LoginRequest>,
    res: Response<LoginResponse>,
  ) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, error: "Username and password required" });
    }

    const account = validateCredentials(username, password);
    if (account) {
      res.json({
        success: true,
        user: {
          id: account.id,
          username: account.username,
          displayName: account.displayName,
        },
      });
    } else {
      res.status(401).json({ success: false, error: "Invalid credentials" });
    }
  },
);

router.post(
  "/logout",
  (req: Request, res: Response<{ success: boolean; message: string }>) => {
    res.json({ success: true, message: "Logged out successfully" });
  },
);

export default router;
