export interface Account {
  id: string;
  username: string;
  password: string;
  displayName: string;
}

export const fakeAccounts: Account[] = [
  {
    id: "user-001",
    username: "admin",
    password: "admin123",
    displayName: "Admin User",
  },
  {
    id: "user-002",
    username: "john",
    password: "john123",
    displayName: "John Doe",
  },
  {
    id: "user-003",
    username: "jane",
    password: "jane123",
    displayName: "Jane Smith",
  },
  {
    id: "user-004",
    username: "alice",
    password: "alice123",
    displayName: "Alice Johnson",
  },
  {
    id: "user-005",
    username: "bob",
    password: "bob123",
    displayName: "Bob Williams",
  },
];

export const validateCredentials = (username: string, password: string): Account | null => {
  const account = fakeAccounts.find(
    (acc) => acc.username === username && acc.password === password
  );
  return account || null;
};
