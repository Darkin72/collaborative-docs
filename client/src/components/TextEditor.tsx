import { useState, useEffect, useCallback } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { TOOLBAR_OPTIONS, SAVE_INTERVAL_MS } from '../constants';
import socket from '../socket';
import { useParams } from 'react-router-dom';

export const TextEditor = () => {
    const [quill, setQuill] = useState<Quill>() ;
    const { id: documentId } = useParams() ;

    const wrapperRef = useCallback((wrapper: HTMLDivElement) => {
        if(!wrapper) return ;
        wrapper.innerHTML = '' ;
    
        const editor = document.createElement("div") ;
        wrapper.append(editor) ;

        const qul = new Quill(editor, 
            { 
                theme: "snow", 
                modules: {
                toolbar: TOOLBAR_OPTIONS
              }
            });
        qul.disable() ;   
        qul.setText("Loading...") ;
        setQuill(qul) ;
    }, [])

    // Sending changes to server.
    useEffect(() => {
        if(!quill){
            return ;
        }

        // @ts-ignore
        const handler = (delta, oldDelta, source) => {
            if (source !== "user") return ;
            socket.emit("send-changes", delta) ;
        }

        quill.on("text-change", handler) ;

        return () => {
            quill.off("text-change", handler) ;
        }

    }, [quill])

    // Receiving changes from server.
    useEffect(() => {
        if(!quill){
            return ;
        }

        // @ts-ignore
        const handler = (delta) => {
            quill.updateContents(delta) ;
        }

        socket.on("receive-changes", handler) ;

        return () => {
            socket.off("receive-changes", handler) ;
        }

    }, [quill])

    useEffect(() => {
        if(!quill){
            return ;
        }

        const handleLoadDocument = (document: any) => {
            quill.setContents(document) ;
            quill.enable() ;
        };

        socket.once("load-document", handleLoadDocument);

        const documentName = localStorage.getItem(`document-name-for-${documentId}`) || "Untitled" ;
        socket.emit("get-document", { documentId, documentName }) ;

        return () => {
            socket.off("load-document", handleLoadDocument);
        };

    }, [quill, documentId])

    useEffect(() => {
        if(!quill){
            return ;
        }
        const interval = setInterval(() => {
            socket.emit("save-document", quill.getContents()) ;
        }, SAVE_INTERVAL_MS);

        return () => {
            clearInterval(interval) ;
        }
    }, [quill])

    return(
        <div className="editorContainer" ref={wrapperRef}>

        </div>
    )
}
