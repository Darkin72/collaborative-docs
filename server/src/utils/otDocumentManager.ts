/**
 * OT Document Manager
 * 
 * Manages operation history, transformations, and conflict resolution
 * for collaborative document editing using Operational Transformation.
 */

import {
  Operation,
  OperationSet,
  transformOperationSet,
  applyOperations,
  deltaToOperations,
  operationsToDelta,
  getTextFromDelta,
  OperationType
} from './operationalTransformation';

interface DocumentState {
  content: string;
  version: number;
  operations: OperationSet[];  // History of operations
  pendingOperations: Map<string, OperationSet[]>;  // Operations waiting to be acknowledged
}

export class OTDocumentManager {
  private documents: Map<string, DocumentState> = new Map();
  private readonly maxHistorySize = 1000;  // Keep last 1000 operations

  /**
   * Initialize or get document state
   */
  initDocument(documentId: string, initialContent: any, version: number = 0): void {
    if (!this.documents.has(documentId)) {
      const content = typeof initialContent === 'string' 
        ? initialContent 
        : getTextFromDelta(initialContent);

      this.documents.set(documentId, {
        content,
        version,
        operations: [],
        pendingOperations: new Map()
      });
    }
  }

  /**
   * Get current document state
   */
  getDocumentState(documentId: string): DocumentState | undefined {
    return this.documents.get(documentId);
  }

  /**
   * Get current version
   */
  getVersion(documentId: string): number {
    const doc = this.documents.get(documentId);
    return doc ? doc.version : 0;
  }

  /**
   * Process incoming operation from a client
   * Returns transformed operation and new version
   */
  processOperation(
    documentId: string,
    clientId: string,
    delta: any,
    clientVersion: number
  ): { transformedDelta: any; newVersion: number; success: boolean; error?: string } {
    const doc = this.documents.get(documentId);
    
    if (!doc) {
      return {
        transformedDelta: null,
        newVersion: 0,
        success: false,
        error: 'Document not found'
      };
    }

    // Convert delta to operations
    const operations = deltaToOperations(delta);
    
    if (operations.length === 0) {
      return {
        transformedDelta: delta,
        newVersion: doc.version,
        success: true
      };
    }

    // Check if client is behind
    if (clientVersion < doc.version) {
      // Need to transform against missed operations
      const missedOps = doc.operations.slice(clientVersion);
      let transformedOps = operations;

      for (const missedOpSet of missedOps) {
        transformedOps = transformOperationSet(transformedOps, missedOpSet.operations);
      }

      // Apply transformed operations
      try {
        const newContent = applyOperations(doc.content, transformedOps);
        
        // Create operation set
        const opSet: OperationSet = {
          operations: transformedOps,
          clientId,
          version: doc.version,
          timestamp: Date.now()
        };

        // Update document state
        doc.content = newContent;
        doc.version++;
        doc.operations.push(opSet);

        // Trim history if too large
        if (doc.operations.length > this.maxHistorySize) {
          doc.operations.shift();
        }

        return {
          transformedDelta: operationsToDelta(transformedOps),
          newVersion: doc.version,
          success: true
        };
      } catch (error) {
        return {
          transformedDelta: null,
          newVersion: doc.version,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to apply operations'
        };
      }
    } else if (clientVersion === doc.version) {
      // Client is up to date, apply directly
      try {
        const newContent = applyOperations(doc.content, operations);
        
        const opSet: OperationSet = {
          operations,
          clientId,
          version: doc.version,
          timestamp: Date.now()
        };

        doc.content = newContent;
        doc.version++;
        doc.operations.push(opSet);

        if (doc.operations.length > this.maxHistorySize) {
          doc.operations.shift();
        }

        return {
          transformedDelta: delta,
          newVersion: doc.version,
          success: true
        };
      } catch (error) {
        return {
          transformedDelta: null,
          newVersion: doc.version,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to apply operations'
        };
      }
    } else {
      // Client is ahead - this shouldn't happen
      return {
        transformedDelta: null,
        newVersion: doc.version,
        success: false,
        error: 'Client version ahead of server'
      };
    }
  }

  /**
   * Get operations since a specific version
   */
  getOperationsSince(documentId: string, version: number): OperationSet[] {
    const doc = this.documents.get(documentId);
    if (!doc) return [];

    return doc.operations.slice(version);
  }

  /**
   * Compose multiple operations for efficiency
   */
  composeOperations(ops: Operation[]): Operation[] {
    if (ops.length === 0) return [];
    if (ops.length === 1) return ops;

    // Simple composition: merge adjacent operations of same type
    const composed: Operation[] = [];
    let current = ops[0];

    for (let i = 1; i < ops.length; i++) {
      const next = ops[i];

      // Try to merge INSERT operations at same position
      if (
        current.type === OperationType.INSERT &&
        next.type === OperationType.INSERT &&
        current.position + (current.content?.length || 0) === next.position
      ) {
        current = {
          type: OperationType.INSERT,
          position: current.position,
          content: (current.content || '') + (next.content || '')
        };
      }
      // Try to merge DELETE operations
      else if (
        current.type === OperationType.DELETE &&
        next.type === OperationType.DELETE &&
        current.position === next.position
      ) {
        current = {
          type: OperationType.DELETE,
          position: current.position,
          length: (current.length || 0) + (next.length || 0)
        };
      }
      // Can't merge, push current and move to next
      else {
        composed.push(current);
        current = next;
      }
    }

    composed.push(current);
    return composed;
  }

  /**
   * Clear document from memory (call when document is closed)
   */
  clearDocument(documentId: string): void {
    this.documents.delete(documentId);
  }

  /**
   * Get all active document IDs
   */
  getActiveDocuments(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Get document statistics
   */
  getDocumentStats(documentId: string): {
    version: number;
    operationCount: number;
    contentLength: number;
    pendingCount: number;
  } | null {
    const doc = this.documents.get(documentId);
    if (!doc) return null;

    return {
      version: doc.version,
      operationCount: doc.operations.length,
      contentLength: doc.content.length,
      pendingCount: Array.from(doc.pendingOperations.values()).reduce(
        (sum, ops) => sum + ops.length,
        0
      )
    };
  }
}

// Singleton instance
export const otManager = new OTDocumentManager();
