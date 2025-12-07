# 📊 Báo cáo: Dark Mode & Themes và Export Feature

## Mục lục
1. [Dark Mode & Themes](#1-dark-mode--themes)
2. [Export Feature (PDF/DOCX)](#2-export-feature-pdfdocx)
3. [Tổng kết](#3-tổng-kết)

---

## 1. Dark Mode & Themes

### 1.1 Tổng quan

Tính năng Dark Mode cho phép người dùng chuyển đổi giữa giao diện **Sáng/Tối/Hệ thống**, cải thiện trải nghiệm người dùng và giảm mỏi mắt khi làm việc trong môi trường ánh sáng yếu.

### 1.2 Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                     ThemeProvider                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  State: theme ('light' | 'dark' | 'system')             ││
│  │  Derived: resolvedTheme (actual theme applied)          ││
│  │  Storage: localStorage ('collaborative-docs-theme')     ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │           <html class="dark">                           ││
│  │                     │                                   ││
│  │     Tailwind CSS: dark:bg-gray-900                      ││
│  │                   dark:text-white                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Công nghệ sử dụng

| Thành phần | Công nghệ | Mục đích |
|------------|-----------|----------|
| State Management | React Context API | Quản lý theme state toàn cục |
| Styling | Tailwind CSS (class-based) | Dark mode utilities |
| Persistence | localStorage | Lưu trữ preference người dùng |
| System Detection | `window.matchMedia` | Theo dõi theme hệ thống |

### 1.4 Implementation

#### 1.4.1 ThemeContext (`client/src/context/ThemeContext.tsx`)

```typescript
type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";  // Actual applied theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Load từ localStorage hoặc default "system"
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved as Theme) || "system";
  });
  
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    
    if (theme === "system") {
      // Theo dõi system preference
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches 
        ? "dark" : "light";
      root.classList.add(systemTheme);
      setResolvedTheme(systemTheme);
    } else {
      root.classList.add(theme);
      setResolvedTheme(theme);
    }
    
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // ...
}
```

**Tính năng chính:**
- ✅ 3 chế độ: Light, Dark, System (theo OS)
- ✅ Tự động detect system preference change
- ✅ Persist preference trong localStorage
- ✅ `resolvedTheme` để components biết theme thực tế đang áp dụng

#### 1.4.2 ThemeToggle Component (`client/src/components/ThemeToggle.tsx`)

```typescript
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    const themes: Theme[] = ["light", "dark", "system"];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <button onClick={cycleTheme} className="...">
      {/* Icon thay đổi theo resolvedTheme */}
      {resolvedTheme === "dark" ? <MoonIcon /> : <SunIcon />}
      <span>{theme === "system" ? "System" : theme}</span>
    </button>
  );
}
```

#### 1.4.3 Tailwind Configuration (`tailwind.config.js`)

```javascript
module.exports = {
  darkMode: ["class"],  // Class-based dark mode
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // ... CSS variables cho theming
      }
    }
  }
}
```

#### 1.4.4 CSS Variables (`client/src/index.css`)

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  /* Light theme colors */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* Dark theme colors */
}
```

### 1.5 Components đã cập nhật

| Component | Dark Mode Classes |
|-----------|-------------------|
| `App.tsx` | `bg-background text-foreground` wrapper |
| `Topbar.tsx` | `dark:bg-gray-800 dark:text-white` |
| `Login.tsx` | `dark:bg-gray-900 dark:border-gray-700` |
| `Docs.tsx` | `dark:bg-gray-800 dark:hover:bg-gray-700` |
| `Dialogbox.tsx` | `dark:bg-gray-800 dark:text-white` |
| `TextEditor.tsx` | Dark mode cho editor container |
| `RoleManagement.tsx` | `dark:bg-gray-700 dark:text-gray-200` |

### 1.6 Quill Editor Dark Mode (`client/src/App.css`)

```css
/* Dark mode cho Quill Editor */
.dark .ql-toolbar {
  background-color: #374151;
  border-color: #4b5563;
}

.dark .ql-container {
  background-color: #1f2937;
  border-color: #4b5563;
}

.dark .ql-editor {
  color: #f9fafb;
}

.dark .ql-picker-label,
.dark .ql-stroke {
  color: #d1d5db;
  stroke: #d1d5db;
}
```

---

## 2. Export Feature (PDF/DOCX)

### 2.1 Tổng quan

Cho phép người dùng tải tài liệu về máy dưới dạng **PDF** hoặc **Word (.docx)**, giữ nguyên định dạng rich text.

### 2.2 Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
│  ┌─────────────────┐                                        │
│  │  ExportButton   │──► Click Export PDF/DOCX               │
│  └────────┬────────┘                                        │
│           │                                                  │
│           ▼                                                  │
│  GET /api/documents/:id/export/:format                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        SERVER                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │            documentExportController.ts                  ││
│  │                                                         ││
│  │  1. Fetch document từ MongoDB                           ││
│  │  2. Parse Quill Delta → HTML/DOCX Paragraphs            ││
│  │  3. Generate file (Puppeteer/docx library)              ││
│  │  4. Return binary với headers                           ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER                                 │
│  Parse X-Filename header → Create Blob → Download file      │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Công nghệ sử dụng

| Thành phần | Công nghệ | Mục đích |
|------------|-----------|----------|
| PDF Generation | Puppeteer (Headless Chrome) | Render HTML → PDF |
| DOCX Generation | `docx` library | Build Word document |
| Rich Text Parsing | Quill Delta format | Xử lý bold, italic, headers, lists |
| File Download | Blob API | Download file từ response |

### 2.4 Backend Implementation

#### 2.4.1 Routes (`server/src/routes/documents.routes.ts`)

```typescript
// Export document to PDF or DOCX
router.get(
  "/:id/export/:format",
  authenticate,
  exportDocument
);
```

#### 2.4.2 Controller (`server/src/controllers/documentExportController.ts`)

**Quill Delta → HTML Conversion:**

```typescript
function deltaToHtml(delta: any): string {
  let html = "";
  
  for (const op of delta.ops) {
    if (typeof op.insert === "string") {
      let text = escapeHtml(op.insert);
      
      // Apply formatting attributes
      if (op.attributes) {
        if (op.attributes.bold) text = `<strong>${text}</strong>`;
        if (op.attributes.italic) text = `<em>${text}</em>`;
        if (op.attributes.underline) text = `<u>${text}</u>`;
        if (op.attributes.strike) text = `<s>${text}</s>`;
        if (op.attributes.link) text = `<a href="${op.attributes.link}">${text}</a>`;
        if (op.attributes.header) {
          text = `<h${op.attributes.header}>${text}</h${op.attributes.header}>`;
        }
      }
      
      html += text;
    }
  }
  
  return html;
}
```

**PDF Export (Puppeteer):**

```typescript
export async function exportToPdf(req: Request, res: Response) {
  const document = await Document.findOne({ documentId });
  
  // Convert Delta to HTML
  const htmlContent = deltaToHtml(document.data);
  
  // Full HTML page with styling
  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { font-size: 24px; margin-bottom: 20px; }
          /* ... more styles */
        </style>
      </head>
      <body>
        <h1>${document.name}</h1>
        ${htmlContent}
      </body>
    </html>
  `;
  
  // Launch headless browser
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  
  const page = await browser.newPage();
  await page.setContent(fullHtml);
  
  // Generate PDF
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" }
  });
  
  await browser.close();
  
  // Set response headers
  const fileName = `${sanitizedName}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("X-Filename", encodeURIComponent(fileName));
  
  res.send(pdfBuffer);
}
```

**DOCX Export (docx library):**

```typescript
export async function exportToDocx(req: Request, res: Response) {
  const document = await Document.findOne({ documentId });
  
  // Convert Delta to DOCX paragraphs
  const paragraphs = deltaToDocxParagraphs(document.data);
  
  // Build Word document
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Document title
        new Paragraph({
          children: [new TextRun({ text: document.name, bold: true, size: 32 })],
          heading: HeadingLevel.TITLE
        }),
        // Content paragraphs
        ...paragraphs
      ]
    }]
  });
  
  // Generate buffer
  const buffer = await Packer.toBuffer(doc);
  
  // Set response headers
  const fileName = `${sanitizedName}.docx`;
  res.setHeader("Content-Type", 
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("X-Filename", encodeURIComponent(fileName));
  
  res.send(buffer);
}
```

#### 2.4.3 Docker Configuration

Để Puppeteer hoạt động trong Alpine Linux container:

```dockerfile
# server/Dockerfile
FROM node:18-alpine

# Install Chromium và dependencies cho Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto

# Skip Chromium download (dùng system Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# ... rest of Dockerfile
```

### 2.5 Frontend Implementation

#### 2.5.1 ExportButton Component (`client/src/components/ExportButton.tsx`)

```typescript
export function ExportButton({ documentId, documentName }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: "pdf" | "docx") => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `${BASE_URL}/api/documents/${documentId}/export/${format}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include"
        }
      );

      if (!response.ok) throw new Error("Export failed");

      // Get filename from custom header
      const xFilename = response.headers.get("X-Filename");
      let filename = `${documentName}.${format}`;
      if (xFilename) {
        filename = decodeURIComponent(xFilename);
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative">
      <button className="flex items-center gap-2 ...">
        <AiOutlineDownload />
        Export
      </button>
      <div className="dropdown-menu">
        <button onClick={() => handleExport("pdf")}>
          <AiOutlineFilePdf /> Export PDF
        </button>
        <button onClick={() => handleExport("docx")}>
          <AiOutlineFileWord /> Export DOCX
        </button>
      </div>
    </div>
  );
}
```

### 2.6 CORS Configuration

Expose custom header cho client:

```typescript
// server/src/index.ts
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:80"],
  credentials: true,
  exposedHeaders: ["Content-Disposition", "X-Filename"]  // ← Quan trọng!
}));
```

### 2.7 Supported Formatting

| Format | PDF | DOCX |
|--------|-----|------|
| Bold | ✅ | ✅ |
| Italic | ✅ | ✅ |
| Underline | ✅ | ✅ |
| Strikethrough | ✅ | ✅ |
| Headers (H1-H6) | ✅ | ✅ |
| Lists (ordered/unordered) | ✅ | ✅ |
| Links | ✅ | ✅ |
| Code blocks | ✅ | ✅ (monospace) |

---

## 3. Tổng kết

### 3.1 Tính năng đã triển khai

| Tính năng | Status | Mô tả |
|-----------|--------|-------|
| Dark Mode | ✅ | 3 chế độ: Light/Dark/System |
| Theme Persistence | ✅ | Lưu trong localStorage |
| System Theme Detection | ✅ | Tự động theo OS preference |
| Quill Editor Dark Mode | ✅ | Custom CSS cho editor |
| PDF Export | ✅ | Puppeteer + Headless Chrome |
| DOCX Export | ✅ | docx library |
| Rich Text Preservation | ✅ | Bold, italic, headers, lists |
| UTF-8 Filename Support | ✅ | URL encoding cho tên file |

### 3.2 Dependencies đã thêm

**Client (`client/package.json`):**
```json
{
  "dependencies": {
    "react-icons": "^5.4.0"  // Icons cho UI
  }
}
```

**Server (`server/package.json`):**
```json
{
  "dependencies": {
    "puppeteer": "^23.10.4",  // PDF generation
    "docx": "^9.2.0"          // DOCX generation
  }
}
```

### 3.3 Cấu trúc files mới

```
client/src/
├── context/
│   └── ThemeContext.tsx      # Theme state management
├── components/
│   ├── ThemeToggle.tsx       # Theme switcher button
│   └── ExportButton.tsx      # Export dropdown

server/src/
└── controllers/
    └── documentExportController.ts  # PDF/DOCX generation
```

---

## Tài liệu tham khảo

- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode)
- [React Context API](https://react.dev/reference/react/useContext)
- [Puppeteer Documentation](https://pptr.dev/)
- [docx Library](https://docx.js.org/)
- [Quill Delta Format](https://quilljs.com/docs/delta/)

---

*Cập nhật lần cuối: December 2025*
