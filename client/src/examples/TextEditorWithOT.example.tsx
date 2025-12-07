// Example: Integrating OT into TextEditor.tsx

import { useEffect, useState, useRef } from 'react';
import Quill from 'quill';
import socket from '../socket';
import { OTClientManager } from '../utils/otClient';

export const TextEditorWithOT = () => {
  const [quill, setQuill] = useState<Quill | null>(null);
  const [documentVersion, setDocumentVersion] = useState(0);
  const otManagerRef = useRef(new OTClientManager());
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Initialize Quill
  useEffect(() => {
    if (wrapperRef.current && !quill) {
      const editor = document.createElement('div');
      wrapperRef.current.innerHTML = '';
      wrapperRef.current.appendChild(editor);
      
      const q = new Quill(editor, {
        theme: 'snow',
        modules: { toolbar: true }
      });
      
      setQuill(q);
    }
  }, [quill]);
  
  // Initialize OT when document loads
  useEffect(() => {
    socket.on('load-document', ({ data, version, canEdit }) => {
      if (quill) {
        // Initialize OT manager with document version
        otManagerRef.current.initialize(version);
        setDocumentVersion(version);
        
        // Load document content
        quill.setContents(data);
        quill.enable(canEdit);
        
        console.log(`[OT] Document loaded, version: ${version}`);
      }
    });

    return () => {
      socket.off('load-document');
    };
  }, [quill]);

  // Handle local changes - send with OT
  useEffect(() => {
    if (!quill) return;

    const handleTextChange = (delta: any, _oldDelta: any, source: string) => {
      if (source !== 'user') return;

      const currentVersion = otManagerRef.current.getVersion();
      
      // Send changes with current version
      socket.emit('send-changes-ot', {
        delta,
        version: currentVersion
      });

      console.log(`[OT] Sent change, version: ${currentVersion}`, delta);
    };

    quill.on('text-change', handleTextChange);

    return () => {
      quill.off('text-change', handleTextChange);
    };
  }, [quill]);

  // Handle remote changes - receive transformed operations
  useEffect(() => {
    socket.on('receive-changes-ot', ({ delta, version, clientId }) => {
      if (quill) {
        // Apply remote changes
        quill.updateContents(delta, 'silent');
        
        // Update version
        otManagerRef.current.setVersion(version);
        setDocumentVersion(version);
        
        console.log(`[OT] Received change from ${clientId}, version: ${version}`, delta);
      }
    });

    return () => {
      socket.off('receive-changes-ot');
    };
  }, [quill]);

  // Handle operation acknowledgment
  useEffect(() => {
    socket.on('ot-ack', ({ version }) => {
      otManagerRef.current.setVersion(version);
      setDocumentVersion(version);
      console.log(`[OT] Operation acknowledged, version: ${version}`);
    });

    socket.on('ot-transform', ({ version }) => {
      otManagerRef.current.setVersion(version);
      setDocumentVersion(version);
      console.log(`[OT] Operation transformed by server, version: ${version}`);
    });

    socket.on('ot-error', ({ error, currentVersion }) => {
      console.error(`[OT] Error:`, error);
      console.warn(`[OT] Need to resync, current version: ${currentVersion}`);
      // Optionally: request full document reload
    });

    return () => {
      socket.off('ot-ack');
      socket.off('ot-transform');
      socket.off('ot-error');
    };
  }, []);

  // Periodic save with OT
  useEffect(() => {
    const saveInterval = setInterval(() => {
      socket.emit('save-document-ot');
    }, 5000); // Save every 5 seconds

    return () => clearInterval(saveInterval);
  }, []);

  // Display version info
  return (
    <div>
      <div className="version-info">
        Document Version: {documentVersion}
        {otManagerRef.current.getStats().pendingCount > 0 && (
          <span> (Pending: {otManagerRef.current.getStats().pendingCount})</span>
        )}
      </div>
      {/* Quill editor container */}
      <div ref={wrapperRef} />
    </div>
  );
};
