import { Router, Request, Response } from "express";
import { 
  getAllDocuments, 
  updateUserRole, 
  getDocumentPermissions,
  getDocumentPermissionsList,
  deleteDocument,
  searchDocuments,
  getDocumentsByOwner
} from "../controllers/documentController";
import { exportToPdf, exportToDocx } from "../controllers/documentExportController";
import { 
  DocumentsResponse, 
  UpdateRoleRequest, 
  UpdateRoleResponse,
  PermissionCheckResponse 
} from "../types/api.types";
import { searchRateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.get(
  "/",
  async (req: Request, res: Response<DocumentsResponse>) => {
    try {
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: "User ID is required" 
        });
      }
      
      const allDocuments = await getAllDocuments(userId);
      res.json({ success: true, documents: allDocuments });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch documents" });
    }
  },
);

// Search documents endpoint (uses regex for partial matching)
// Rate limited to 30 requests per minute
router.get(
  "/search",
  searchRateLimiter,
  async (req: Request, res: Response<DocumentsResponse>) => {
    try {
      const userId = req.query.userId as string;
      const query = req.query.q as string;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: "User ID is required" 
        });
      }
      
      const documents = await searchDocuments(userId, query || '');
      res.json({ success: true, documents });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to search documents" });
    }
  },
);

// Get documents owned by a specific user (uses ownerId index)
router.get(
  "/my-documents",
  async (req: Request, res: Response<DocumentsResponse>) => {
    try {
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: "User ID is required" 
        });
      }
      
      const documents = await getDocumentsByOwner(userId);
      res.json({ success: true, documents });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch user documents" });
    }
  },
);

router.post(
  "/update-role",
  async (
    req: Request<{}, UpdateRoleResponse, UpdateRoleRequest>,
    res: Response<UpdateRoleResponse>
  ) => {
    try {
      const { documentId, username, role } = req.body;
      const ownerId = req.query.ownerId as string;
      
      if (!documentId || !username || !role || !ownerId) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields"
        });
      }
      
      await updateUserRole(documentId, ownerId, username, role);
      res.json({ success: true });
    } catch (error: any) {
      res.status(403).json({
        success: false,
        error: error.message || "Failed to update role"
      });
    }
  }
);

router.get(
  "/permissions/:documentId",
  async (req: Request, res: Response<PermissionCheckResponse>) => {
    try {
      const { documentId } = req.params;
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID is required"
        });
      }
      
      const permission = await getDocumentPermissions(documentId, userId);
      res.json({
        success: true,
        role: permission.role,
        canView: permission.canView,
        canEdit: permission.canEdit
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || "Failed to check permissions"
      });
    }
  }
);

router.get(
  "/permissions-list/:documentId",
  async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      
      const permissionsList = await getDocumentPermissionsList(documentId);
      res.json({
        success: true,
        permissions: permissionsList
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get permissions list"
      });
    }
  }
);

router.delete(
  "/:documentId",
  async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID is required"
        });
      }
      
      await deleteDocument(documentId, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(403).json({
        success: false,
        error: error.message || "Failed to delete document"
      });
    }
  }
);

// Export routes
router.get("/:documentId/export/pdf", exportToPdf);
router.get("/:documentId/export/docx", exportToDocx);

export default router;
