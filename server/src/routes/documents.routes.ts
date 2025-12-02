import { Router, Request, Response } from "express";
import { getAllDocuments } from "../controllers/documentController";
import { DocumentsResponse } from "../types/api.types";

const router = Router();

router.get(
  "/",
  async (req: Request, res: Response<DocumentsResponse>) => {
    try {
      const allDocuments = await getAllDocuments();
      allDocuments.reverse();
      res.json({ success: true, documents: allDocuments });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch documents" });
    }
  },
);

export default router;
