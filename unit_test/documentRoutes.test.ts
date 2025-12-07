import request from 'supertest';
import express from 'express';
import documentRoutes from '../server/src/routes/documents.routes';
import * as documentController from '../server/src/controllers/documentController';

// Mock the controller methods
jest.mock('../server/src/controllers/documentController');
jest.mock('../server/src/controllers/documentExportController');

const app = express();
app.use(express.json());
app.use('/api/documents', documentRoutes);

describe('Document Routes API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/documents', () => {
    it('should return list of documents for a user', async () => {
      const mockDocs = [
        { _id: '1', name: 'Doc 1', userRole: 'owner' },
        { _id: '2', name: 'Doc 2', userRole: 'viewer' },
      ];
      
      (documentController.getAllDocuments as jest.Mock).mockResolvedValue(mockDocs);

      const response = await request(app)
        .get('/api/documents')
        .query({ userId: 'user123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.documents).toHaveLength(2);
      expect(documentController.getAllDocuments).toHaveBeenCalledWith('user123');
    });

    it('should return 400 if userId is missing', async () => {
      const response = await request(app).get('/api/documents');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors', async () => {
      (documentController.getAllDocuments as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get('/api/documents')
        .query({ userId: 'user123' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/documents/update-role', () => {
    it('should update user role', async () => {
      const mockUpdate = {
        documentId: 'doc1',
        username: 'user2',
        role: 'editor'
      };
      const ownerId = 'owner123';

      (documentController.updateUserRole as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Role updated'
      });

      const response = await request(app)
        .post('/api/documents/update-role')
        .query({ ownerId })
        .send(mockUpdate);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(documentController.updateUserRole).toHaveBeenCalledWith(
        mockUpdate.documentId,
        ownerId,
        mockUpdate.username,
        mockUpdate.role
      );
    });
  });

  describe('DELETE /api/documents/:documentId', () => {
    it('should delete a document', async () => {
      const documentId = 'doc123';
      const userId = 'user123';

      (documentController.deleteDocument as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Document deleted'
      });

      const response = await request(app)
        .delete(`/api/documents/${documentId}`)
        .query({ userId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(documentController.deleteDocument).toHaveBeenCalledWith(documentId, userId);
    });
  });
});
