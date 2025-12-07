import { findOrCreateDocument, getAllDocuments, updateDocument } from '../server/src/controllers/documentController';
import { Document } from '../server/src/models/documentModel';
import * as permissions from '../server/src/middleware/permissions';
import * as cache from '../server/src/config/documentCache';

// Mock dependencies
jest.mock('../server/src/models/documentModel');
jest.mock('../server/src/middleware/permissions');
jest.mock('../server/src/config/documentCache');

describe('Document Controller', () => {
  const mockUserId = 'user123';
  const mockDocId = 'doc123';
  const mockDocName = 'Test Document';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findOrCreateDocument', () => {
    it('should return cached document if available and user has permission', async () => {
      const cachedDoc = {
        data: {},
        name: mockDocName,
        ownerId: mockUserId,
      };

      (cache.getDocumentFromCache as jest.Mock).mockResolvedValue(cachedDoc);
      (Document.findById as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: mockDocId }),
      });
      (permissions.checkDocumentPermission as jest.Mock).mockResolvedValue({
        hasAccess: true,
        role: 'owner',
        canEdit: true,
      });

      const result = await findOrCreateDocument({
        documentId: mockDocId,
        documentName: mockDocName,
        userId: mockUserId,
      });

      expect(cache.getDocumentFromCache).toHaveBeenCalledWith(mockDocId);
      expect(permissions.checkDocumentPermission).toHaveBeenCalledWith(mockDocId, mockUserId);
      expect(result).toEqual({
        _id: mockDocId,
        data: cachedDoc.data,
        name: cachedDoc.name,
        ownerId: cachedDoc.ownerId,
        userRole: 'owner',
        canEdit: true,
      });
    });

    it('should fetch from DB if cache miss', async () => {
      (cache.getDocumentFromCache as jest.Mock).mockResolvedValue(null);
      
      const dbDoc = {
        _id: mockDocId,
        data: {},
        name: mockDocName,
        ownerId: mockUserId,
        permissions: new Map(),
        toObject: jest.fn().mockReturnValue({
          _id: mockDocId,
          data: {},
          name: mockDocName,
          ownerId: mockUserId,
        }),
      };

      (Document.findById as jest.Mock).mockResolvedValue(dbDoc);
      (permissions.checkDocumentPermission as jest.Mock).mockResolvedValue({
        hasAccess: true,
        role: 'owner',
        canEdit: true,
      });

      const result = await findOrCreateDocument({
        documentId: mockDocId,
        documentName: mockDocName,
        userId: mockUserId,
      });

      expect(Document.findById).toHaveBeenCalledWith(mockDocId);
      expect(cache.setDocumentInCache).toHaveBeenCalled();
      expect(result).toMatchObject({
        _id: mockDocId,
        name: mockDocName,
      });
    });

    it('should create new document if not found in DB', async () => {
      (cache.getDocumentFromCache as jest.Mock).mockResolvedValue(null);
      (Document.findById as jest.Mock).mockResolvedValue(null);
      
      const newDoc = {
        _id: mockDocId,
        data: "",
        name: mockDocName,
        ownerId: mockUserId,
        permissions: new Map(),
        save: jest.fn(),
        toObject: jest.fn().mockReturnValue({
            _id: mockDocId,
            data: "",
            name: mockDocName,
            ownerId: mockUserId,
        })
      };

      (Document.create as jest.Mock).mockResolvedValue(newDoc);

      const result = await findOrCreateDocument({
        documentId: mockDocId,
        documentName: mockDocName,
        userId: mockUserId,
      });

      expect(Document.create).toHaveBeenCalled();
      expect(result).toMatchObject({
        _id: mockDocId,
        name: mockDocName,
        userRole: 'owner',
      });
    });
  });

  describe('getAllDocuments', () => {
    it('should return all documents with user roles', async () => {
      const mockDocs = [
        {
          _id: 'doc1',
          ownerId: 'otherUser',
          toObject: () => ({ _id: 'doc1', ownerId: 'otherUser' }),
        },
        {
          _id: 'doc2',
          ownerId: mockUserId,
          toObject: () => ({ _id: 'doc2', ownerId: mockUserId }),
        },
      ];

      (Document.find as jest.Mock).mockResolvedValue(mockDocs);
      (permissions.getUserRole as jest.Mock).mockImplementation((doc, userId) => {
        return doc.ownerId === userId ? 'owner' : 'viewer';
      });

      const result = await getAllDocuments(mockUserId);

      expect(Document.find).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].userRole).toBe('viewer');
      expect(result[1].userRole).toBe('owner');
    });
  });

  describe('updateDocument', () => {
    it('should update document if user has permission', async () => {
      const mockData = { data: 'some content' };
      
      (permissions.checkDocumentPermission as jest.Mock).mockResolvedValue({
        canEdit: true,
      });

      await updateDocument(mockDocId, mockData, mockUserId);

      expect(permissions.checkDocumentPermission).toHaveBeenCalledWith(mockDocId, mockUserId);
      expect(Document.findByIdAndUpdate).toHaveBeenCalledWith(mockDocId, mockData);
      expect(cache.updateDocumentDataInCache).toHaveBeenCalledWith(mockDocId, mockData.data);
    });

    it('should throw error if user does not have permission', async () => {
      (permissions.checkDocumentPermission as jest.Mock).mockResolvedValue({
        canEdit: false,
      });

      await expect(updateDocument(mockDocId, {}, mockUserId))
        .rejects.toThrow('Access denied');
      
      expect(Document.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
