const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "DETAILS",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "UL",
]);

const DANGEROUS_TAGS = new Set([
  "BASE",
  "EMBED",
  "IFRAME",
  "LINK",
  "META",
  "OBJECT",
  "SCRIPT",
  "STYLE",
]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, alt, url) => {
      const safeAlt = escapeHtml(alt);
      const safeUrl = escapeHtml(url);
      return `<img src="${safeUrl}" alt="${safeAlt}" />`;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, label, url) => {
      const safeLabel = escapeHtml(label);
      const safeUrl = escapeHtml(url);
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
    })
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, (_match, code) => `<code>${escapeHtml(code)}</code>`);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  return (
    cells.length > 1 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))
  );
}

function parseTableAlignment(cell: string): "left" | "center" | "right" | null {
  const normalized = cell.replace(/\s+/g, "");
  if (/^:-{3,}:$/.test(normalized)) return "center";
  if (/^:-{3,}$/.test(normalized)) return "left";
  if (/^-{3,}:$/.test(normalized)) return "right";
  return null;
}

function renderTable(rows: string[]): string {
  if (rows.length < 2) return rows.join("<br />");
  const headers = splitTableRow(rows[0]);
  const alignments = splitTableRow(rows[1]).map(parseTableAlignment);
  const bodyRows = rows.slice(2).map(splitTableRow);

  const renderCell = (text: string, tag: "th" | "td", align: string | null) => {
    const style = align ? ` style=\"text-align:${align}\"` : "";
    return `<${tag}${style}>${applyInlineMarkdown(text)}</${tag}>`;
  };

  const head = headers
    .map((cell, index) => renderCell(cell, "th", alignments[index] ?? null))
    .join("");
  const body = bodyRows
    .map((row) => {
      const cells = headers.map((_, index) => row[index] ?? "");
      return `<tr>${cells
        .map((cell, index) => renderCell(cell, "td", alignments[index] ?? null))
        .join("")}</tr>`;
    })
    .join("");

  return `<div class="markdown-table-wrapper"><table class="markdown-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderAlertIcon(kind: string): string {
  const normalized = kind.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (normalized === "warning" || normalized === "caution") {
    return `<span class="markdown-alert-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v7"></path><path d="M12 17h.01"></path></svg></span>`;
  }
  if (normalized === "important" || normalized === "tip") {
    return `<span class="markdown-alert-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6 19 18H5L12 6Z"></path><path d="M12 10.5v4.5"></path><path d="M12 16.5h.01"></path></svg></span>`;
  }
  return `<span class="markdown-alert-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7h.01"></path></svg></span>`;
}

function renderCodeBlock(info: string, code: string): string {
  const language = info.trim() || "code";
  const safeCode = escapeHtml(code);
  return `<div class="markdown-code-block"><div class="markdown-code-toolbar"><span class="markdown-code-lang">${escapeHtml(language)}</span><button type="button" class="markdown-code-copy" aria-label="Copy code" title="Copy code"><svg class="markdown-copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h8.5C11.216 0 12 .784 12 1.75V3h2.25C15.216 3 16 3.784 16 4.75v9.5A1.75 1.75 0 0 1 14.25 16h-8.5A1.75 1.75 0 0 1 4 14.25V13H1.75A1.75 1.75 0 0 1 0 11.25v-9.5Zm5.5 3v9.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25ZM1.75 1.5a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25H4V4.75C4 3.784 4.784 3 5.75 3h4.75V1.75a.25.25 0 0 0-.25-.25h-8.5Z"></path></svg><svg class="markdown-copy-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 3.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 8.28a.75.75 0 0 1 1.06-1.06L6 9.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg></button></div><pre><code>${safeCode}</code></pre></div>`;
}

type ListType = "ul" | "ol";

function parseListItem(line: string):
  | { indent: number; type: ListType; content: string }
  | null {
  const match = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/.exec(line);
  if (!match) return null;

  return {
    indent: match[1].replace(/\t/g, "  ").length,
    type: /^\d/.test(match[2]) ? "ol" : "ul",
    content: match[3],
  };
}

function renderListBlock(items: string[]): string {
  const output: string[] = [];
  const stack: { type: ListType; indent: number; hasOpenItem: boolean }[] = [];

  const closeLevel = () => {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (top.hasOpenItem) output.push("</li>");
    output.push(`</${top.type}>`);
    stack.pop();
  };

  const openLevel = (type: ListType, indent: number) => {
    output.push(`<${type}>`);
    stack.push({ type, indent, hasOpenItem: false });
  };

  for (const line of items) {
    const item = parseListItem(line);
    if (!item) continue;

    while (stack.length > 0 && item.indent < stack[stack.length - 1].indent) {
      closeLevel();
    }

    if (
      stack.length === 0 ||
      item.indent > stack[stack.length - 1].indent
    ) {
      openLevel(item.type, item.indent);
    } else if (item.type !== stack[stack.length - 1].type) {
      closeLevel();
      openLevel(item.type, item.indent);
    }

    const top = stack[stack.length - 1];
    if (top.hasOpenItem) output.push("</li>");
    output.push(`<li>${applyInlineMarkdown(item.content)}`);
    top.hasOpenItem = true;
  }

  while (stack.length > 0) closeLevel();
  return output.join("");
}

function markdownBlocksToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();

    const fenceMatch = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      const fenceChar = fenceMatch[2][0];
      const fenceLength = fenceMatch[2].length;
      const fencePattern = new RegExp(
        "^" + fenceChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "{" + fenceLength + ",}\\s*$"
      );
      const info = fenceMatch[3].trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !fencePattern.test(lines[index].trimEnd())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      output.push(renderCodeBlock(info, codeLines.join("\n")));
      continue;
    }

    if (line.trim() === "") {
      output.push("");
      index += 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      output.push("<hr />");
      index += 1;
      continue;
    }

    const details = /^:::\s*details(?:\s+(.+))?\s*$/.exec(line);
    if (details) {
      const innerLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ":::") {
        innerLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length && lines[index].trim() === ":::") index += 1;
      const summary = details[1]?.trim() || "详情";
      output.push(
        `<details class="markdown-details"><summary>${applyInlineMarkdown(summary)}</summary><div class="markdown-details-body">${markdownBlocksToHtml(innerLines.join("\n"))}</div></details>`
      );
      continue;
    }

    const alert = /^>\s*\[!([^\]]+)\]\s*(.*)$/.exec(line);
    if (alert) {
      const kind = alert[1].trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const title = alert[2].trim() || alert[1].trim();
      const innerLines: string[] = [];
      index += 1;
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        innerLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      output.push(
        `<div class="markdown-alert markdown-alert-${kind}"><div class="markdown-alert-title">${renderAlertIcon(kind)}<span class="markdown-alert-title-text">${applyInlineMarkdown(title)}</span></div><div class="markdown-alert-content">${markdownBlocksToHtml(innerLines.join("\n"))}</div></div>`
      );
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableSeparatorRow(lines[index + 1])) {
      const tableRows: string[] = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length) {
        const nextLine = lines[index].trimEnd();
        if (!nextLine.trim()) break;
        if (!nextLine.includes("|")) break;
        if (/^\s*---+\s*$/.test(nextLine)) break;
        if (/^:::\s*details(?:\s+(.+))?\s*$/.test(nextLine)) break;
        if (/^>\s*\[!([^\]]+)\]\s*(.*)$/.test(nextLine)) break;
        if (/^\s*>/.test(nextLine)) break;
        if (/^(#{1,3})\s+(.+)$/.test(nextLine)) break;
        if (/^\s*[-*+]\s+(.+)$/.test(nextLine)) break;
        if (/^\s*\d+[.)]\s+(.+)$/.test(nextLine)) break;
        if (/^(\s*)(`{3,}|~{3,})(.*)$/.test(nextLine)) break;
        tableRows.push(nextLine);
        index += 1;
      }
      output.push(renderTable(tableRows));
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      output.push(`<blockquote>${markdownBlocksToHtml(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${applyInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (parseListItem(line)) {
      const listLines: string[] = [];
      while (index < lines.length) {
        const nextLine = lines[index].trimEnd();
        if (!parseListItem(nextLine)) break;
        listLines.push(nextLine);
        index += 1;
      }
      output.push(renderListBlock(listLines));
      continue;
    }

    output.push(`${applyInlineMarkdown(line)}<br />`);
    index += 1;
  }

  return output.join("");
}

function sanitizeHtml(html: string): string {
  if (typeof document === "undefined") return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];
  while (walker.nextNode()) {
    elements.push(walker.currentNode as Element);
  }

  for (const element of elements) {
    if (DANGEROUS_TAGS.has(element.tagName)) {
      element.remove();
      continue;
    }

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        ((name === "href" || name === "src") && /^javascript:/i.test(value))
      ) {
        element.removeAttribute(attr.name);
      }
    }

    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }

  return template.innerHTML;
}

function convertPlainLineBreaks(html: string): string {
  if (typeof document === "undefined") return html.replace(/\n/g, "<br />");

  const template = document.createElement("template");
  template.innerHTML = html;

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes("\n")) {
      const parts = node.textContent.split("\n");
      const fragment = document.createDocumentFragment();
      parts.forEach((part, index) => {
        if (index > 0) fragment.appendChild(document.createElement("br"));
        if (part) fragment.appendChild(document.createTextNode(part));
      });
      node.parentNode?.replaceChild(fragment, node);
      return;
    }

    if (
      node.nodeType === Node.ELEMENT_NODE &&
      !BLOCK_TAGS.has((node as Element).tagName)
    ) {
      Array.from(node.childNodes).forEach(walk);
    } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      Array.from(node.childNodes).forEach(walk);
    }
  };

  walk(template.content);
  return template.innerHTML;
}

export function renderBasicContent(content: string): string {
  const html = markdownBlocksToHtml(content);
  return convertPlainLineBreaks(sanitizeHtml(html));
}
