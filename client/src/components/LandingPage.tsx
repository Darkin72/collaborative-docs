import { useState, useEffect, useCallback } from "react";
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
    userRole?: string;
    ownerName?: string;
    ownerId?: string;
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
  const [searchQuery, setSearchQuery] = useState("");

  // Debounce search to avoid too many API calls
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const fetchDocuments = async () => {
      setIsLoading(true);
      try {
        // Use search endpoint if there's a query, otherwise fetch all
        const endpoint = debouncedQuery.trim()
          ? `${import.meta.env.VITE_SERVER_URL}/api/documents/search?userId=${user.id}&q=${encodeURIComponent(debouncedQuery)}`
          : `${import.meta.env.VITE_SERVER_URL}/api/documents?userId=${user.id}`;

        const response = await fetch(endpoint, {
          credentials: "include",
        });
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
  }, [user.id, debouncedQuery]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  return (
    <div className="LandingPage">
      <Topbar user={user} onLogout={onLogout} onSearch={handleSearch} />
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
          <div className="title-2">
            {searchQuery.trim() ? `Search results for "${searchQuery}"` : "Recent documents"}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {documents?.map((docs, index) => (
              <Docs 
                documentId={docs._id} 
                docName={docs.name} 
                ownerName={docs.ownerName} 
                key={index} 
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && documents.length === 0 && searchQuery.trim() && (
        <div className="text-center py-8 text-gray-500">
          No documents found for "{searchQuery}"
        </div>
      )}
    </div>
  );
};
