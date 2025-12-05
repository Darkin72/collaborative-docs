import { Router, Request, Response } from "express";
import { 
  getAllDocuments, 
  updateUserRole, 
  getDocumentPermissions,
  getDocumentPermissionsList,
  deleteDocument
} from "../controllers/documentController";
import { 
  DocumentsResponse, 
  UpdateRoleRequest, 
  UpdateRoleResponse,
  PermissionCheckResponse 
} from "../types/api.types";

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
      allDocuments.reverse();
      res.json({ success: true, documents: allDocuments });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch documents" });
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

export default router;
