import { Request, Response } from "express";
import { Document } from "../models/documentModel";
import { checkDocumentPermission } from "../middleware/permissions";
import puppeteer from "puppeteer";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";

/**
 * Convert Quill Delta to HTML for PDF export
 */
function deltaToHtml(delta: any): string {
  if (!delta || !delta.ops) {
    return "<p>Empty document</p>";
  }

  let html = "";
  let currentParagraph = "";
  let inList = false;
  let listType = "";

  for (const op of delta.ops) {
    if (typeof op.insert === "string") {
      let text = op.insert;
      const attributes = op.attributes || {};

      // Handle text formatting
      let formattedText = escapeHtml(text);

      if (attributes.bold) {
        formattedText = `<strong>${formattedText}</strong>`;
      }
      if (attributes.italic) {
        formattedText = `<em>${formattedText}</em>`;
      }
      if (attributes.underline) {
        formattedText = `<u>${formattedText}</u>`;
      }
      if (attributes.strike) {
        formattedText = `<s>${formattedText}</s>`;
      }
      if (attributes.code) {
        formattedText = `<code>${formattedText}</code>`;
      }
      if (attributes.link) {
        formattedText = `<a href="${escapeHtml(attributes.link)}">${formattedText}</a>`;
      }

      // Handle color and background
      let style = "";
      if (attributes.color) {
        style += `color: ${attributes.color};`;
      }
      if (attributes.background) {
        style += `background-color: ${attributes.background};`;
      }
      if (attributes.size) {
        const sizeMap: Record<string, string> = {
          small: "0.75em",
          large: "1.5em",
          huge: "2.5em",
        };
        style += `font-size: ${sizeMap[attributes.size] || attributes.size};`;
      }
      if (style) {
        formattedText = `<span style="${style}">${formattedText}</span>`;
      }

      // Handle newlines
      const lines = formattedText.split("\n");
      for (let i = 0; i < lines.length; i++) {
        currentParagraph += lines[i];
        if (i < lines.length - 1) {
          // Check for list formatting in the next operation
          const nextOp = delta.ops[delta.ops.indexOf(op) + 1];
          const lineAttributes = nextOp?.attributes || {};

          if (lineAttributes.list) {
            const newListType = lineAttributes.list === "ordered" ? "ol" : "ul";
            if (!inList || listType !== newListType) {
              if (inList) {
                html += `</${listType}>`;
              }
              html += `<${newListType}>`;
              inList = true;
              listType = newListType;
            }
            html += `<li>${currentParagraph}</li>`;
          } else {
            if (inList) {
              html += `</${listType}>`;
              inList = false;
            }

            if (lineAttributes.header) {
              html += `<h${lineAttributes.header}>${currentParagraph}</h${lineAttributes.header}>`;
            } else if (lineAttributes.blockquote) {
              html += `<blockquote>${currentParagraph}</blockquote>`;
            } else if (lineAttributes["code-block"]) {
              html += `<pre><code>${currentParagraph}</code></pre>`;
            } else if (lineAttributes.align) {
              html += `<p style="text-align: ${lineAttributes.align}">${currentParagraph}</p>`;
            } else {
              html += `<p>${currentParagraph || "&nbsp;"}</p>`;
            }
          }
          currentParagraph = "";
        }
      }
    } else if (op.insert?.image) {
      currentParagraph += `<img src="${op.insert.image}" style="max-width: 100%;" />`;
    }
  }

  // Handle remaining content
  if (currentParagraph) {
    if (inList) {
      html += `<li>${currentParagraph}</li></${listType}>`;
    } else {
      html += `<p>${currentParagraph}</p>`;
    }
  } else if (inList) {
    html += `</${listType}>`;
  }

  return html || "<p>Empty document</p>";
}

/**
 * Convert Quill Delta to DOCX paragraphs
 */
function deltaToDocxParagraphs(delta: any): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (!delta || !delta.ops) {
    return [new Paragraph({ children: [new TextRun("Empty document")] })];
  }

  let currentRuns: TextRun[] = [];
  let currentAttributes: any = {};

  for (const op of delta.ops) {
    if (typeof op.insert === "string") {
      const text = op.insert;
      const attributes = op.attributes || {};

      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line) {
          currentRuns.push(
            new TextRun({
              text: line,
              bold: attributes.bold || false,
              italics: attributes.italic || false,
              underline: attributes.underline ? {} : undefined,
              strike: attributes.strike || false,
              color: attributes.color?.replace("#", "") || undefined,
              highlight: attributes.background ? "yellow" : undefined,
              size: getSizeInHalfPoints(attributes.size),
            })
          );
        }

        // If there's a newline, create a paragraph
        if (i < lines.length - 1) {
          const nextOp = delta.ops[delta.ops.indexOf(op) + 1];
          const lineAttributes = nextOp?.attributes || {};

          let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
          if (lineAttributes.header === 1) heading = HeadingLevel.HEADING_1;
          else if (lineAttributes.header === 2) heading = HeadingLevel.HEADING_2;
          else if (lineAttributes.header === 3) heading = HeadingLevel.HEADING_3;

          let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined;
          if (lineAttributes.align === "center") alignment = AlignmentType.CENTER;
          else if (lineAttributes.align === "right") alignment = AlignmentType.RIGHT;
          else if (lineAttributes.align === "justify") alignment = AlignmentType.JUSTIFIED;

          paragraphs.push(
            new Paragraph({
              children: currentRuns.length > 0 ? currentRuns : [new TextRun("")],
              heading,
              alignment,
              bullet: lineAttributes.list === "bullet" ? { level: 0 } : undefined,
              numbering: lineAttributes.list === "ordered"
                ? { reference: "default-numbering", level: 0 }
                : undefined,
            })
          );

          currentRuns = [];
          currentAttributes = {};
        }
      }
    }
  }

  // Add remaining content
  if (currentRuns.length > 0) {
    paragraphs.push(new Paragraph({ children: currentRuns }));
  }

  return paragraphs.length > 0
    ? paragraphs
    : [new Paragraph({ children: [new TextRun("Empty document")] })];
}

function getSizeInHalfPoints(size: string | undefined): number | undefined {
  if (!size) return undefined;
  const sizeMap: Record<string, number> = {
    small: 18, // 9pt
    normal: 24, // 12pt
    large: 36, // 18pt
    huge: 48, // 24pt
  };
  return sizeMap[size] || 24;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Export document as PDF
 */
export async function exportToPdf(req: Request, res: Response) {
  try {
    const { documentId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    // Check permissions
    const permission = await checkDocumentPermission(documentId, userId);
    if (!permission.hasAccess) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to export this document",
      });
    }

    // Get document
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: "Document not found",
      });
    }

    // Convert delta to HTML
    const htmlContent = deltaToHtml(document.data);
    const documentName = document.name || "Untitled";

    // Create full HTML document
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(documentName)}</title>
        <style>
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            line-height: 1.6;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 1in;
          }
          h1 { font-size: 24pt; margin-bottom: 0.5em; }
          h2 { font-size: 18pt; margin-bottom: 0.5em; }
          h3 { font-size: 14pt; margin-bottom: 0.5em; }
          p { margin: 0 0 1em 0; }
          ul, ol { margin: 0 0 1em 2em; padding: 0; }
          li { margin-bottom: 0.25em; }
          blockquote {
            border-left: 4px solid #ccc;
            margin: 1em 0;
            padding-left: 1em;
            color: #666;
          }
          pre {
            background: #f4f4f4;
            padding: 1em;
            border-radius: 4px;
            overflow-x: auto;
          }
          code {
            font-family: 'Courier New', monospace;
            background: #f4f4f4;
            padding: 0.2em 0.4em;
            border-radius: 3px;
          }
          a { color: #0066cc; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "1in",
        right: "1in",
        bottom: "1in",
        left: "1in",
      },
    });

    await browser.close();

    // Send PDF - create safe filename
    const safeName = (documentName || "document").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim() || "document";
    const fileName = `${safeName}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("PDF Export Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to export PDF",
    });
  }
}

/**
 * Export document as DOCX
 */
export async function exportToDocx(req: Request, res: Response) {
  try {
    const { documentId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    // Check permissions
    const permission = await checkDocumentPermission(documentId, userId);
    if (!permission.hasAccess) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to export this document",
      });
    }

    // Get document
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: "Document not found",
      });
    }

    const documentName = document.name || "Untitled";

    // Convert delta to DOCX paragraphs
    const contentParagraphs = deltaToDocxParagraphs(document.data);

    // Create DOCX document
    const doc = new DocxDocument({
      sections: [
        {
          properties: {},
          children: [
            // Content only - no title
            ...contentParagraphs,
          ],
        },
      ],
      numbering: {
        config: [
          {
            reference: "default-numbering",
            levels: [
              {
                level: 0,
                format: "decimal",
                text: "%1.",
                alignment: AlignmentType.LEFT,
              },
            ],
          },
        ],
      },
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);

    // Send DOCX - create safe filename
    const safeName = (documentName || "document").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim() || "document";
    const fileName = `${safeName}.docx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error("DOCX Export Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to export DOCX",
    });
  }
}
