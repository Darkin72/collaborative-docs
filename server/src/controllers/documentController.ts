import { Document } from "../models/documentModel";
import { DocumentRole } from "../types/api.types";
import { checkDocumentPermission, getUserRole } from "../middleware/permissions";
import { fakeAccounts } from "../data/accounts";

const defaultData = "";

export const getAllDocuments = async(userId: string) => {
    const documents = await Document.find();
    
    // Return all documents with owner info and user's role
    const documentsWithInfo = documents.map(doc => {
        const role = getUserRole(doc, userId);
        const owner = fakeAccounts.find(acc => acc.id === doc.ownerId);
        
        return {
            ...doc.toObject(),
            userRole: role,
            ownerName: owner?.displayName || 'Unknown',
            ownerId: doc.ownerId
        };
    });
    
    return documentsWithInfo;
}

export const findOrCreateDocument = async({ 
    documentId, 
    documentName, 
    userId 
}: { 
    documentId: string, 
    documentName: string,
    userId: string 
}) => {
    if(!documentId){
        return null;
    }   
    
    let document = await Document.findById(documentId);
    
    if(document){
        // Check permissions for existing document
        const permission = await checkDocumentPermission(documentId, userId);
        
        if (!permission.hasAccess) {
            throw new Error("Access denied. You do not have permission to view this document.");
        }
        
        return {
            ...document.toObject(),
            userRole: permission.role,
            canEdit: permission.canEdit
        };
    }

    // Create new document with user as owner
    const newDocument = await Document.create({ 
        _id: documentId, 
        name: documentName, 
        data: defaultData,
        ownerId: userId,
        permissions: new Map()
    });
    
    return {
        ...newDocument.toObject(),
        userRole: DocumentRole.OWNER,
        canEdit: true
    };
}

export const updateDocument = async(id: string, data: Object, userId: string) => {
    if(!id){
        return;
    }
    
    // Check if user has edit permission
    const permission = await checkDocumentPermission(id, userId);
    
    if (!permission.canEdit) {
        throw new Error("Access denied. You do not have permission to edit this document.");
    }
    
    await Document.findByIdAndUpdate(id, data);
}

export const updateUserRole = async(
    documentId: string,
    ownerId: string,
    targetUsername: string,
    newRole: DocumentRole
) => {
    const document = await Document.findById(documentId);
    
    if (!document) {
        throw new Error("Document not found");
    }
    
    // Only owner or admin can change roles
    if (document.ownerId !== ownerId && ownerId !== 'user-001') {
        throw new Error("Only the document owner can change user roles");
    }
    
    // Find user by username
    const targetUser = fakeAccounts.find(acc => acc.username === targetUsername);
    if (!targetUser) {
        throw new Error(`User '${targetUsername}' not found`);
    }
    
    const targetUserId = targetUser.id;
    
    // Cannot change admin's role
    if (targetUserId === 'user-001') {
        throw new Error("You can't change admin's role");
    }
    
    // Cannot change owner's role (unless you're admin)
    if (targetUserId === document.ownerId && ownerId !== 'user-001') {
        throw new Error("Cannot change the owner's role");
    }
    
    const permissions = document.permissions as Map<string, string>;
    
    if (newRole === DocumentRole.GUEST) {
        // Remove permission
        permissions.delete(targetUserId);
    } else {
        // Set or update permission
        permissions.set(targetUserId, newRole);
    }
    
    await document.save();
}

export const getDocumentPermissions = async(documentId: string, userId: string) => {
    const permission = await checkDocumentPermission(documentId, userId);
    return permission;
}

export const getDocumentPermissionsList = async(documentId: string) => {
    const document = await Document.findById(documentId);
    
    if (!document) {
        throw new Error("Document not found");
    }
    
    const permissions = document.permissions as Map<string, string>;
    const permissionsList: Array<{ username: string; role: string }> = [];
    
    // Convert permissions map to array with usernames
    permissions.forEach((role, userId) => {
        // Only include editor and viewer roles
        if (role === DocumentRole.EDITOR || role === DocumentRole.VIEWER) {
            const user = fakeAccounts.find(acc => acc.id === userId);
            if (user) {
                permissionsList.push({
                    username: user.username,
                    role: role
                });
            }
        }
    });
    
    return permissionsList;
}

export const deleteDocument = async(documentId: string, userId: string) => {
    console.log(`[DELETE] Attempting to delete document ${documentId} by user ${userId}`);
    
    const document = await Document.findById(documentId);
    
    if (!document) {
        console.log(`[DELETE] Document not found: ${documentId}`);
        throw new Error("Document not found");
    }
    
    console.log(`[DELETE] Document owner: ${document.ownerId}, User: ${userId}, Is Admin: ${userId === 'user-001'}`);
    
    // Check if user is owner or admin
    if (document.ownerId !== userId && userId !== 'user-001') {
        console.log(`[DELETE] Access denied - not owner or admin`);
        throw new Error("Only the document owner can delete this document");
    }
    
    console.log(`[DELETE] Deleting document ${documentId}`);
    await Document.findByIdAndDelete(documentId);
    console.log(`[DELETE] Document deleted successfully`);
}
