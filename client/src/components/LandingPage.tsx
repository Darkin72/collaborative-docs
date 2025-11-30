import { useState, useEffect } from "react";
import { Docs } from "./Docs";
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
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchDocuments = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/api/documents`,
          {
            credentials: "include",
          }
        );
        const data = await response.json();
        if (data.success) {
          setDocuments(data.documents);
        }
      } catch (error) {
        console.error("Failed to fetch documents:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  return (
    <div className="LandingPage">
      <Topbar user={user} onLogout={onLogout} />
      <div className="Docs-container-1">
        <div className="title-1"> Start a new document </div>
        <div>
          <Dialogbox />
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-8">Loading documents...</div>
      )}

      {!isLoading && documents.length > 0 && (
        <div className="Docs-container-2">
          <div className="title-2"> Recent documents </div>
          <div className="grid grid-cols-6">
            {documents?.map((docs, index) => (
              <Docs documentId={docs._id} docName={docs.name} key={index} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
