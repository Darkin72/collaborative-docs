import Img1 from "../assets/Google-Docs-logo.png";
import { AiOutlineSearch } from "react-icons/ai";
import { ThemeToggle } from "./ThemeToggle";
import { useState, useCallback } from "react";

interface User {
    id: string;
    username: string;
    displayName: string;
}

interface TopbarProps {
    user?: User;
    onLogout?: () => void;
    onSearch?: (query: string) => void;
}

export const Topbar = ({ user, onLogout, onSearch }: TopbarProps) => {
    const [searchQuery, setSearchQuery] = useState("");

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (onSearch) {
            onSearch(query);
        }
    }, [onSearch]);

    const handleSearchSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (onSearch) {
            onSearch(searchQuery);
        }
    }, [onSearch, searchQuery]);

    return (
        <nav className="Topbar flex items-center justify-between md:px-6 py-3 w-full min-w-20">
            <div className="logodiv flex items-center gap-2 flex-shrink-0 min-w-0">
                <img src={Img1} alt="Logo" className="h-8 w-auto object-contain" />
                <span className="hidden sm:inline-block truncate">Docs</span>
            </div>

            <form onSubmit={handleSearchSubmit} className="Searchbar flex-1 mx-2 min-w-5 shrink flex items-center gap-2">
                <AiOutlineSearch className="h-5 w-5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="w-full min-w-0 truncate px-2 py-1 border rounded-md focus:outline-none bg-transparent dark:border-border dark:text-foreground"
                />
            </form>

            <div className="flex items-center gap-4 flex-shrink-0 min-w-0">
                <ThemeToggle />
                {user && (
                    <>
                        <span className="text-sm truncate max-w-[12rem] text-foreground">Welcome, {user.displayName}</span>
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 flex-shrink-0"
                            >
                                Logout
                            </button>
                        )}
                    </>
                )}
            </div>
        </nav>
    )
}
