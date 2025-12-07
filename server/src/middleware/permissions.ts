import { DocumentRole } from "../types/api.types";
import { Document } from "../models/documentModel";

export interface PermissionResult {
  hasAccess: boolean;
  role: DocumentRole;
  canView: boolean;
  canEdit: boolean;
}

export async function checkDocumentPermission(
  documentId: string,
  userId: string
): Promise<PermissionResult> {
  console.log(`[PERMISSION CHECK] DocumentId: ${documentId}, UserId: ${userId}, Type: ${typeof userId}`);
  
  const document = await Document.findById(documentId);

  if (!document) {
    console.log(`[PERMISSION CHECK] Document not found: ${documentId}`);
    return {
      hasAccess: false,
      role: DocumentRole.GUEST,
      canView: false,
      canEdit: false,
    };
  }

  // Admin has full access to all documents
  if (userId === 'user-001') {
    console.log(`[PERMISSION CHECK] Admin access granted`);
    return {
      hasAccess: true,
      role: DocumentRole.OWNER,
      canView: true,
      canEdit: true,
    };
  }

  // TODO: REMOVE AFTER LOAD TESTING - Allow test users full access
  // if (userId.startsWith('test-user-')) {
  //   console.log(`[PERMISSION CHECK] Test user access granted: ${userId}`);
  //   return {
  //     hasAccess: true,
  //     role: DocumentRole.EDITOR,
  //     canView: true,
  //     canEdit: true,
  //   };
  // }

  // Check if user is the owner
  if (document.ownerId === userId) {
    console.log(`[PERMISSION CHECK] Owner access granted`);
    return {
      hasAccess: true,
      role: DocumentRole.OWNER,
      canView: true,
      canEdit: true,
    };
  }

  // Check if user has explicit permissions
  // Handle both Map (Mongoose document) and plain object (lean query result)
  let userRole: DocumentRole | undefined;
  
  if (document.permissions instanceof Map) {
    userRole = document.permissions.get(userId) as DocumentRole;
  } else if (document.permissions && typeof document.permissions === 'object') {
    userRole = document.permissions[userId] as DocumentRole;
  }

  if (!userRole || userRole === DocumentRole.GUEST) {
    console.log(`[PERMISSION CHECK] Access denied - no permissions`);
    return {
      hasAccess: false,
      role: DocumentRole.GUEST,
      canView: false,
      canEdit: false,
    };
  }

  console.log(`[PERMISSION CHECK] Access granted with role: ${userRole}`);
  return {
    hasAccess: true,
    role: userRole,
    canView: userRole === DocumentRole.VIEWER || userRole === DocumentRole.EDITOR,
    canEdit: userRole === DocumentRole.EDITOR,
  };
}

export function getUserRole(document: any, userId: string): DocumentRole {
  // Admin has OWNER role for all documents
  if (userId === 'user-001') {
    return DocumentRole.OWNER;
  }
  
  if (document.ownerId === userId) {
    return DocumentRole.OWNER;
  }

  // Handle both Map (Mongoose document) and plain object (lean query result)
  let userRole: DocumentRole | undefined;
  
  if (document.permissions instanceof Map) {
    userRole = document.permissions.get(userId) as DocumentRole;
  } else if (document.permissions && typeof document.permissions === 'object') {
    // Plain object from lean() query
    userRole = document.permissions[userId] as DocumentRole;
  }

  return userRole || DocumentRole.GUEST;
}
