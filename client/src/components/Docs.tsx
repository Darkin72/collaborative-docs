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
            <div> {docName} </div>
            {ownerName && (
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    by {ownerName}
                </div>
            )}
        </div>
    )
}
