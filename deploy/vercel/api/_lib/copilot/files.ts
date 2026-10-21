import { unzipSync, strFromU8 } from "fflate";
import { AppError } from "./errors.js";
export async function extractDocument(
  bytes: Uint8Array,
  name: string,
  mime: string,
): Promise<string> {
  if (bytes.length > 4 * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", 413);
  const ext = name.toLowerCase().split(".").pop();
  let text = "";
  if (ext === "pdf") {
    if (mime && !["application/pdf", "application/octet-stream"].includes(mime))
      throw new AppError("INVALID_FILE");
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new AppError("INVALID_FILE");
    try {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes, {
        useSystemFonts: false,
      });
      try {
        if (pdf.numPages > 80) throw new AppError("FILE_TOO_LARGE", 413);
        text = (await extractText(pdf, { mergePages: true })).text;
      } finally {
        await pdf.loadingTask.destroy();
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("PDF_UNREADABLE");
    }
  } else if (ext === "docx") {
    if (
      mime &&
      ![
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
      ].includes(mime)
    )
      throw new AppError("INVALID_FILE");
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
      throw new AppError("INVALID_FILE");
    try {
      let size = 0;
      const entries = unzipSync(bytes, {
        filter: (file) => {
          size += file.originalSize;
          if (size > 20 * 1024 * 1024 || file.originalSize > 5 * 1024 * 1024)
            throw new AppError("FILE_TOO_LARGE", 413);
          if (/vbaProject|embeddings\//i.test(file.name))
            throw new AppError("INVALID_FILE");
          return (
            file.name === "word/document.xml" ||
            file.name === "[Content_Types].xml"
          );
        },
      });
      if (!entries["word/document.xml"] || !entries["[Content_Types].xml"])
        throw new AppError("INVALID_FILE");
      const xml = strFromU8(entries["word/document.xml"]);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new AppError("INVALID_FILE");
      text = xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:tab\b[^>]*\/>/g, "\t")
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("INVALID_FILE");
    }
  } else throw new AppError("INVALID_FILE");
  if (text.trim().length < 30) throw new AppError("NO_DOCUMENT_TEXT");
  if (text.length > 60000) throw new AppError("DOCUMENT_TOO_LONG");
  return text.trim();
}
