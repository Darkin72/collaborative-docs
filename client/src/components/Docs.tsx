import { useNavigate } from "react-router-dom"
import Img1 from "../assets/Google-Docs-logo.png"

export const Docs = ({ 
    documentId, 
    docName, 
    ownerName 
}: { 
    documentId: string, 
    docName: string,
    ownerName?: string 
}) => {
    const navigate = useNavigate() ;

    const openDoc = (id: string) => {
        navigate(`/documents/${id}`) ;
    }
    return(
        <div className="docs" onClick={() => {openDoc(documentId); }}>
            <img src={Img1} alt="icon"/>
            <div className="doc-info">
                <div className="doc-name" title={docName}>
                    {docName}
                </div>
                {ownerName && (
                    <div className="doc-owner" title={`by ${ownerName}`}>
                        by {ownerName}
                    </div>
                )}
            </div>
        </div>
    )
}
