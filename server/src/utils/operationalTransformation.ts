/**
 * Operational Transformation (OT) Implementation
 * 
 * This module provides OT algorithms for conflict-free collaborative editing.
 * Based on the OT approach used by Google Docs and other collaborative editors.
 * 
 * Key Concepts:
 * - Operations: Insert, Delete, Retain (no-op)
 * - Transform: Adjust operations when applied concurrently
 * - Composition: Combine multiple operations
 */

export enum OperationType {
  INSERT = 'insert',
  DELETE = 'delete',
  RETAIN = 'retain'
}

export interface Operation {
  type: OperationType;
  position: number;
  content?: string;  // For insert
  length?: number;   // For delete/retain
}

export interface OperationSet {
  operations: Operation[];
  clientId: string;
  version: number;  // Document version this was created against
  timestamp: number;
}

/**
 * Transform operation A against operation B
 * Returns transformed A' that can be applied after B
 */
export function transformOperation(opA: Operation, opB: Operation, isLeftPriority: boolean = true): Operation {
  // If operations don't overlap, no transformation needed
  if (opA.type === OperationType.RETAIN) {
    return opA;
  }

  // INSERT vs INSERT
  if (opA.type === OperationType.INSERT && opB.type === OperationType.INSERT) {
    if (opB.position < opA.position) {
      // B is before A, shift A's position
      return {
        ...opA,
        position: opA.position + (opB.content?.length || 0)
      };
    } else if (opB.position === opA.position) {
      // Same position - use priority (left bias)
      if (isLeftPriority) {
        return opA;
      } else {
        return {
          ...opA,
          position: opA.position + (opB.content?.length || 0)
        };
      }
    }
    return opA;
  }

  // INSERT vs DELETE
  if (opA.type === OperationType.INSERT && opB.type === OperationType.DELETE) {
    const deleteEnd = opB.position + (opB.length || 0);
    
    if (opB.position < opA.position) {
      // B deletes before A's insert, shift A left
      const shift = Math.min(opA.position - opB.position, opB.length || 0);
      return {
        ...opA,
        position: opA.position - shift
      };
    }
    return opA;
  }

  // DELETE vs INSERT
  if (opA.type === OperationType.DELETE && opB.type === OperationType.INSERT) {
    if (opB.position <= opA.position) {
      // B inserts at or before A's delete, shift A right
      return {
        ...opA,
        position: opA.position + (opB.content?.length || 0)
      };
    } else if (opB.position < opA.position + (opA.length || 0)) {
      // B inserts within A's delete range - split not needed for simple case
      return {
        ...opA,
        position: opA.position + (opB.content?.length || 0)
      };
    }
    return opA;
  }

  // DELETE vs DELETE
  if (opA.type === OperationType.DELETE && opB.type === OperationType.DELETE) {
    const aEnd = opA.position + (opA.length || 0);
    const bEnd = opB.position + (opB.length || 0);

    if (bEnd <= opA.position) {
      // B is completely before A, shift A left
      return {
        ...opA,
        position: opA.position - (opB.length || 0)
      };
    } else if (opB.position >= aEnd) {
      // B is completely after A, no change
      return opA;
    } else {
      // Overlapping deletes
      const overlapStart = Math.max(opA.position, opB.position);
      const overlapEnd = Math.min(aEnd, bEnd);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      let newPosition = opA.position;
      let newLength = (opA.length || 0) - overlap;

      if (opB.position < opA.position) {
        newPosition = opB.position;
      }

      return {
        ...opA,
        position: newPosition,
        length: Math.max(0, newLength)
      };
    }
  }

  return opA;
}

/**
 * Transform a set of operations against another set
 */
export function transformOperationSet(opsA: Operation[], opsB: Operation[]): Operation[] {
  let transformedOps = [...opsA];

  for (const opB of opsB) {
    transformedOps = transformedOps.map(opA => transformOperation(opA, opB, true));
  }

  // Filter out operations with length 0 (deleted by transformation)
  return transformedOps.filter(op => {
    if (op.type === OperationType.DELETE && (op.length || 0) <= 0) {
      return false;
    }
    return true;
  });
}

/**
 * Apply an operation to text content
 */
export function applyOperation(content: string, operation: Operation): string {
  switch (operation.type) {
    case OperationType.INSERT:
      const insertPos = Math.min(operation.position, content.length);
      return (
        content.slice(0, insertPos) +
        (operation.content || '') +
        content.slice(insertPos)
      );

    case OperationType.DELETE:
      const deleteEnd = Math.min(
        operation.position + (operation.length || 0),
        content.length
      );
      return (
        content.slice(0, operation.position) +
        content.slice(deleteEnd)
      );

    case OperationType.RETAIN:
      return content;

    default:
      return content;
  }
}

/**
 * Apply a set of operations to content
 */
export function applyOperations(content: string, operations: Operation[]): string {
  let result = content;
  for (const op of operations) {
    result = applyOperation(result, op);
  }
  return result;
}

/**
 * Compose two operations into one
 */
export function composeOperations(op1: Operation, op2: Operation): Operation[] {
  // Simple composition - can be extended for optimization
  return [op1, op2];
}

/**
 * Convert Quill Delta to OT operations
 * Quill uses Delta format, we need to convert to our OT format
 */
export function deltaToOperations(delta: any, baseLength: number = 0): Operation[] {
  const operations: Operation[] = [];
  let position = 0;

  if (!delta || !delta.ops) {
    return operations;
  }

  for (const op of delta.ops) {
    if (op.retain !== undefined) {
      position += op.retain;
    } else if (op.insert !== undefined) {
      const content = typeof op.insert === 'string' ? op.insert : '';
      operations.push({
        type: OperationType.INSERT,
        position,
        content
      });
      position += content.length;
    } else if (op.delete !== undefined) {
      operations.push({
        type: OperationType.DELETE,
        position,
        length: op.delete
      });
      // Don't increment position for delete
    }
  }

  return operations;
}

/**
 * Convert OT operations back to Quill Delta
 */
export function operationsToDelta(operations: Operation[]): any {
  const ops: any[] = [];
  let lastPosition = 0;

  // Sort operations by position
  const sortedOps = [...operations].sort((a, b) => a.position - b.position);

  for (const op of sortedOps) {
    // Add retain for gap if needed
    if (op.position > lastPosition) {
      ops.push({ retain: op.position - lastPosition });
    }

    switch (op.type) {
      case OperationType.INSERT:
        ops.push({ insert: op.content });
        lastPosition = op.position;
        break;

      case OperationType.DELETE:
        ops.push({ delete: op.length });
        lastPosition = op.position;
        break;

      case OperationType.RETAIN:
        ops.push({ retain: op.length });
        lastPosition = op.position + (op.length || 0);
        break;
    }
  }

  return { ops };
}

/**
 * Validate operation against content
 */
export function validateOperation(content: string, operation: Operation): boolean {
  switch (operation.type) {
    case OperationType.INSERT:
      return operation.position >= 0 && operation.position <= content.length;

    case OperationType.DELETE:
      const deleteEnd = operation.position + (operation.length || 0);
      return operation.position >= 0 && deleteEnd <= content.length;

    case OperationType.RETAIN:
      return true;

    default:
      return false;
  }
}

/**
 * Get text content from Quill Delta
 */
export function getTextFromDelta(delta: any): string {
  if (!delta || !delta.ops) {
    return '';
  }

  let text = '';
  for (const op of delta.ops) {
    if (op.insert && typeof op.insert === 'string') {
      text += op.insert;
    }
  }
  return text;
}
