import Img1 from "../assets/Google-Docs-logo.png" ;
import Img2 from "../assets/SearchIcon.jpeg" ;

interface User {
    id: string;
    username: string;
    displayName: string;
}

interface TopbarProps {
    user?: User;
    onLogout?: () => void;
}

export const Topbar = ({ user, onLogout }: TopbarProps) => {
    return (
        <nav className="Topbar flex items-center justify-between md:px-6 py-3 w-full min-w-20">
            <div className="logodiv flex items-center gap-2 flex-shrink-0 min-w-0">
                <img src={Img1} alt="Logo" className="h-8 w-auto object-contain" />
                <span className="hidden sm:inline-block truncate">Docs</span>
            </div>

            <div className="Searchbar flex-1 mx-2 min-w-5 shrink flex items-center gap-2">
                <img src={Img2} alt="" className="h-5 w-5 object-contain flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full min-w-0 truncate px-2 py-1 border rounded-md focus:outline-none"
                />
            </div>

            {user && (
                <div className="flex items-center gap-4 flex-shrink-0 min-w-0">
                    <span className="text-sm truncate max-w-[12rem]">Welcome, {user.displayName}</span>
                    {onLogout && (
                        <button
                            onClick={onLogout}
                            className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 flex-shrink-0"
                        >
                            Logout
                        </button>
                    )}
                </div>
            )}
        </nav>
    )
}
