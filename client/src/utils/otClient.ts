/**
 * Client-side Operational Transformation utilities
 * 
 * This module helps the client handle OT operations,
 * track versions, and manage concurrent edits.
 */

export interface PendingOperation {
  delta: any;
  version: number;
  timestamp: number;
}

export class OTClientManager {
  private documentVersion: number = 0;
  private pendingOperations: PendingOperation[] = [];
  private isWaitingForAck: boolean = false;

  /**
   * Initialize with document version
   */
  initialize(version: number): void {
    this.documentVersion = version;
    this.pendingOperations = [];
    this.isWaitingForAck = false;
  }

  /**
   * Get current document version
   */
  getVersion(): number {
    return this.documentVersion;
  }

  /**
   * Set document version (called when receiving acknowledgment)
   */
  setVersion(version: number): void {
    this.documentVersion = version;
  }

  /**
   * Add a pending operation
   */
  addPendingOperation(delta: any): void {
    this.pendingOperations.push({
      delta,
      version: this.documentVersion,
      timestamp: Date.now()
    });
  }

  /**
   * Get pending operations
   */
  getPendingOperations(): PendingOperation[] {
    return this.pendingOperations;
  }

  /**
   * Clear acknowledged operations
   */
  clearPendingOperation(): void {
    if (this.pendingOperations.length > 0) {
      this.pendingOperations.shift();
    }
    this.isWaitingForAck = false;
  }

  /**
   * Check if waiting for acknowledgment
   */
  isWaiting(): boolean {
    return this.isWaitingForAck;
  }

  /**
   * Set waiting status
   */
  setWaiting(waiting: boolean): void {
    this.isWaitingForAck = waiting;
  }

  /**
   * Apply remote operation while having pending local operations
   * This implements client-side transformation
   */
  transformRemoteOperation(remoteDelta: any, _localPendingDeltas: any[]): any {
    // Simple implementation: for now, just return remote delta
    // In a full OT implementation, we would transform remote against all pending local ops
    // This is handled by the server for us in most cases
    return remoteDelta;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.documentVersion = 0;
    this.pendingOperations = [];
    this.isWaitingForAck = false;
  }

  /**
   * Get statistics
   */
  getStats(): {
    version: number;
    pendingCount: number;
    isWaiting: boolean;
  } {
    return {
      version: this.documentVersion,
      pendingCount: this.pendingOperations.length,
      isWaiting: this.isWaitingForAck
    };
  }
}

/**
 * Compose multiple Quill deltas into one
 */
export function composeDeltas(delta1: any, delta2: any): any {
  if (!delta1 || !delta1.ops) return delta2;
  if (!delta2 || !delta2.ops) return delta1;

  // Use Quill's compose method if available
  if (typeof delta1.compose === 'function') {
    return delta1.compose(delta2);
  }

  // Simple composition
  return {
    ops: [...delta1.ops, ...delta2.ops]
  };
}

/**
 * Check if a delta is empty (no actual changes)
 */
export function isDeltaEmpty(delta: any): boolean {
  if (!delta || !delta.ops) return true;
  
  // Delta is empty if it only contains retains
  return delta.ops.every((op: any) => op.retain !== undefined);
}

/**
 * Transform a delta against another delta
 * This is a simplified client-side transform
 */
export function transformDelta(deltaA: any, deltaB: any, priority: boolean = true): any {
  // If using Quill's Delta class
  if (typeof deltaA.transform === 'function') {
    return deltaA.transform(deltaB, priority);
  }

  // Simple fallback - just return original
  return deltaA;
}
