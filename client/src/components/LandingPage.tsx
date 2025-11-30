import { useState, useEffect } from "react" ;
import { Docs } from "./Docs";
import socket from "../socket";
import { Topbar } from "./Topbar";
import { Dialogbox } from "./Dialogbox";
  

interface DocumentType {
    _id: string;
    name: string;
    data: {
        ops: any[];
    };
    __v: number;
}

interface User {
    id: string;
    username: string;
    displayName: string;
}

interface LandingPageProps {
    user: User;
    onLogout: () => void;
}

export const LandingPage = ({ user, onLogout }: LandingPageProps) => {
    const [documents, setDocuments] = useState<DocumentType[]>([]) ;

    useEffect(() => {
        socket.emit("get-all-documents") ;

        const handleAllDocuments = (allDocuments: DocumentType[]) => {
            setDocuments(allDocuments) ;
        };

        socket.on("all-documents", handleAllDocuments);
        
        return () => {
            socket.off("all-documents", handleAllDocuments);
        }
    }, []) ;

    return(
        <div className="LandingPage">
            <Topbar user={user} onLogout={onLogout} />
            <div className="Docs-container-1">
                <div className="title-1"> Start a new document </div>
                <div> <Dialogbox /> </div>
            </div>

            {
                (documents.length > 0) && (
                <div className="Docs-container-2">
                    <div className="title-2"> Recent documents </div>
                    <div className="grid grid-cols-6">
                    {
                        documents?.map((docs, index) => 
                            <Docs documentId={docs._id} docName={docs.name} key={index}/>
                        )
                    }
                    </div>
                </div>)
            }
        </div>
    )
}
