import { useState } from "react";
import { AiOutlineDownload, AiOutlineFilePdf, AiOutlineFileWord } from "react-icons/ai";

interface ExportButtonProps {
  documentId: string;
  userId: string;
}

export const ExportButton = ({ documentId, userId }: ExportButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExport = async (format: "pdf" | "docx") => {
    setIsExporting(format);
    setIsOpen(false);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/documents/${documentId}/export/${format}?userId=${userId}`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to export ${format.toUpperCase()}`);
      }

      // Get filename from Content-Disposition header
      let filename = `document.${format}`;
      const contentDisposition = response.headers.get("Content-Disposition");
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="([^"]+)"/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error("Export error:", error);
      alert(error.message || `Failed to export ${format.toUpperCase()}`);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting !== null}
        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <AiOutlineDownload className="w-4 h-4" />
        {isExporting ? `Exporting ${isExporting.toUpperCase()}...` : "Export"}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown menu */}
          <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-card border border-border z-20">
            <div className="py-1">
              <button
                onClick={() => handleExport("pdf")}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors"
              >
                <AiOutlineFilePdf className="w-5 h-5 text-red-500" />
                <span>Export as PDF</span>
              </button>
              <button
                onClick={() => handleExport("docx")}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors"
              >
                <AiOutlineFileWord className="w-5 h-5 text-blue-500" />
                <span>Export as Word</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
