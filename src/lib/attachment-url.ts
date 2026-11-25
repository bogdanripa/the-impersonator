/** Uploaded files are research sources with this URL scheme: `attachment:<uuid>`. Safe for client code. */
export const ATTACHMENT_PREFIX = "attachment:";

export const attachmentUrl = (id: string) => `${ATTACHMENT_PREFIX}${id}`;

export function attachmentId(url: string): string | null {
  const m = /^attachment:([0-9a-f-]{36})$/i.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

/** Where a signed-in teammate can read an uploaded source (links in the UI). */
export const attachmentHref = (url: string) => {
  const id = attachmentId(url);
  return id ? `/api/attachments/${id}` : url;
};
