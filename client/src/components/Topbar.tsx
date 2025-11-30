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
        <nav className="Topbar flex justify-between items-center px-6 py-3">
            <div className="logodiv flex items-center gap-4">
                <img src={Img1} alt="Logo" />
                <span> Docs </span>
            </div>
            <div className="Searchbar">
                <img src={Img2} alt="" />
                <input type="text" placeholder="Search"/>   
            </div>
            {user && (
                <div className="flex items-center gap-4">
                    <span className="text-sm">Welcome, {user.displayName}</span>
                    {onLogout && (
                        <button
                            onClick={onLogout}
                            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                        >
                            Logout
                        </button>
                    )}
                </div>
            )}
        </nav>
    )
}
