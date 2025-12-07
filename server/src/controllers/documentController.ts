import { Document } from "../models/documentModel";
import { DocumentRole } from "../types/api.types";
import { checkDocumentPermission, getUserRole } from "../middleware/permissions";
import { fakeAccounts } from "../data/accounts";
import { 
    getDocumentFromCache, 
    setDocumentInCache, 
    updateDocumentDataInCache,
    invalidateDocumentCache,
    getCacheStats 
} from "../config/documentCache";

const defaultData = "";

// Get all documents with optimized query using index
export const getAllDocuments = async(userId: string) => {
    // Use lean() for better performance when we don't need Mongoose document methods
    // Sort by createdAt descending (newest first) - uses compound index
    const documents = await Document.find()
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    
    // Return all documents with owner info and user's role
    const documentsWithInfo = documents.map(doc => {
        const role = getUserRole(doc, userId);
        const owner = fakeAccounts.find(acc => acc.id === doc.ownerId);
        
        return {
            ...doc,
            userRole: role,
            ownerName: owner?.displayName || 'Unknown',
            ownerId: doc.ownerId
        };
    });
    
    return documentsWithInfo;
}

// Get documents owned by a specific user (uses ownerId index)
export const getDocumentsByOwner = async(ownerId: string) => {
    const documents = await Document.find({ ownerId })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    
    return documents.map(doc => {
        const owner = fakeAccounts.find(acc => acc.id === doc.ownerId);
        return {
            ...doc,
            userRole: DocumentRole.OWNER,
            ownerName: owner?.displayName || 'Unknown'
        };
    });
}

// Search documents by name (supports partial matching with regex)
export const searchDocuments = async(userId: string, searchQuery: string) => {
    let documents;
    
    if (searchQuery && searchQuery.trim()) {
        // Escape special regex characters for safety
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Use regex for partial matching (case-insensitive)
        // This uses the name index for better performance
        documents = await Document.find({
            name: { $regex: escapedQuery, $options: 'i' }
        })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    } else {
        // Return all documents sorted by creation date
        documents = await Document.find()
            .sort({ createdAt: -1 })
            .lean()
            .exec();
    }
    
    // Filter and add user role info
    const documentsWithInfo = documents.map(doc => {
        const role = getUserRole(doc, userId);
        const owner = fakeAccounts.find(acc => acc.id === doc.ownerId);
        
        return {
            ...doc,
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
    
    // Try to get from cache first
    const cachedDoc = await getDocumentFromCache(documentId);
    
    if (cachedDoc) {
        // Document found in cache - verify permissions
        console.log(`[CACHE] Document ${documentId} loaded from cache`);
        
        // Check permissions using cached data
        const document = await Document.findById(documentId).lean();
        if (!document) {
            // Document was deleted, invalidate cache
            await invalidateDocumentCache(documentId);
            return null;
        }
        
        const permission = await checkDocumentPermission(documentId, userId);
        
        if (!permission.hasAccess) {
            throw new Error("Access denied. You do not have permission to view this document.");
        }
        
        return {
            _id: documentId,
            data: cachedDoc.data,
            name: cachedDoc.name,
            ownerId: cachedDoc.ownerId,
            userRole: permission.role,
            canEdit: permission.canEdit,
            version: (document as any).__v || 0
        };
    }
    
    // Cache miss - query MongoDB
    let document = await Document.findById(documentId);
    
    if(document){
        // Check permissions for existing document
        const permission = await checkDocumentPermission(documentId, userId);
        
        if (!permission.hasAccess) {
            throw new Error("Access denied. You do not have permission to view this document.");
        }
        
        // Cache the document for future reads
        await setDocumentInCache(documentId, {
            data: document.data,
            name: document.name || documentName || 'Untitled',
            ownerId: document.ownerId || userId,
            permissions: document.permissions as Map<string, string>
        });
        
        return {
            ...document.toObject(),
            userRole: permission.role,
            canEdit: permission.canEdit,
            version: (document as any).__v || 0
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
    
    // Cache the newly created document
    await setDocumentInCache(documentId, {
        data: newDocument.data,
        name: newDocument.name || documentName || 'Untitled',
        ownerId: newDocument.ownerId || userId,
        permissions: new Map()
    });
    
    return {
        ...newDocument.toObject(),
        userRole: DocumentRole.OWNER,
        canEdit: true,
        version: (newDocument as any).__v || 0
    };
}

// Custom error class for version conflicts (Optimistic Concurrency Control)
export class VersionConflictError extends Error {
    public currentVersion: number;
    public currentData: any;
    
    constructor(message: string, currentVersion: number, currentData: any) {
        super(message);
        this.name = 'VersionConflictError';
        this.currentVersion = currentVersion;
        this.currentData = currentData;
    }
}

/**
 * Update document with Optimistic Concurrency Control
 * @param id - Document ID
 * @param data - Data to update (should contain 'data' field for content)
 * @param userId - User making the update
 * @param expectedVersion - The version client expects (for OCC). If provided, will check version before update.
 * @returns Updated document with new version, or throws VersionConflictError if version mismatch
 */
export const updateDocument = async(
    id: string, 
    data: Object, 
    userId: string,
    expectedVersion?: number
): Promise<{ version: number; data: any } | undefined> => {
    if(!id){
        return;
    }
    
    // Check if user has edit permission
    const permission = await checkDocumentPermission(id, userId);
    
    if (!permission.canEdit) {
        throw new Error("Access denied. You do not have permission to edit this document.");
    }
    
    // If expectedVersion is provided, use Optimistic Concurrency Control
    if (expectedVersion !== undefined) {
        // Find document and check version
        const currentDoc = await Document.findById(id);
        
        if (!currentDoc) {
            throw new Error("Document not found");
        }
        
        const currentVersion = (currentDoc as any).__v || 0;
        
        // Check if version matches
        if (currentVersion !== expectedVersion) {
            // Version conflict - throw error with current data for client to merge
            throw new VersionConflictError(
                `Version conflict: expected version ${expectedVersion}, but current version is ${currentVersion}. Please refresh and merge your changes.`,
                currentVersion,
                currentDoc.data
            );
        }
        
        // Version matches - update with version increment
        // Use findOneAndUpdate with version check for atomic operation
        const updatedDoc = await Document.findOneAndUpdate(
            { _id: id, __v: expectedVersion },
            { 
                ...data,
                $inc: { __v: 1 }
            },
            { new: true }
        );
        
        if (!updatedDoc) {
            // Race condition - another update happened between check and update
            const latestDoc = await Document.findById(id);
            throw new VersionConflictError(
                'Document was modified by another user. Please refresh and merge your changes.',
                (latestDoc as any)?.__v || 0,
                latestDoc?.data
            );
        }
        
        // Update cache with new data (write-through caching)
        if ('data' in data) {
            await updateDocumentDataInCache(id, (data as any).data);
        }
        
        return {
            version: (updatedDoc as any).__v,
            data: updatedDoc.data
        };
    }
    
    // No version check - legacy behavior (used for real-time sync without OCC)
    const updatedDoc = await Document.findByIdAndUpdate(
        id, 
        { 
            ...data,
            $inc: { __v: 1 }
        },
        { new: true }
    );
    
    // Update cache with new data (write-through caching)
    if ('data' in data) {
        await updateDocumentDataInCache(id, (data as any).data);
    }
    
    return updatedDoc ? {
        version: (updatedDoc as any).__v,
        data: updatedDoc.data
    } : undefined;
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
    
    // Invalidate cache since permissions changed
    await invalidateDocumentCache(documentId);
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
    
    // Remove from cache
    await invalidateDocumentCache(documentId);
    console.log(`[DELETE] Document deleted successfully`);
}

// Export cache stats for monitoring
export { getCacheStats } from "../config/documentCache";
