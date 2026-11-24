import { type ATTACHMENT_MIMES, type AttachmentKind, MAX_ATTACHMENT_BYTES } from '@pronto/shared';
import { api } from '@/api/endpoints';
import { ApiError, NetworkError } from '@/api/errors';

type Mime = (typeof ATTACHMENT_MIMES)[number];

export interface Uploaded {
  id: string;
  kind: AttachmentKind;
  name: string;
  sizeBytes: number;
}

/** PDF, JPG/PNG photo or XML, max 5 MB. Returns null for anything else. */
export function classify(file: File): { kind: AttachmentKind; mime: Mime } | null {
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) return null;
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    return { kind: 'pdf', mime: 'application/pdf' };
  }
  if (file.type === 'image/png' || name.endsWith('.png'))
    return { kind: 'image', mime: 'image/png' };
  if (file.type === 'image/jpeg' || /\.jpe?g$/.test(name))
    return { kind: 'image', mime: 'image/jpeg' };
  if (file.type === 'text/xml' || file.type === 'application/xml' || name.endsWith('.xml')) {
    return { kind: 'xml', mime: 'application/xml' };
  }
  return null;
}

/** Direct upload by signed URL, then `complete`. The file never goes through the API body. */
export async function uploadAttachment(file: File): Promise<Uploaded> {
  const info = classify(file);
  if (!info) throw new ApiError('ATTACHMENT_INVALID', 422);
  const slot = await api.uploadUrl({ kind: info.kind, mime: info.mime, sizeBytes: file.size });
  let res: Response;
  try {
    res = await fetch(slot.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': info.mime },
      body: file,
    });
  } catch {
    throw new NetworkError();
  }
  if (!res.ok) throw new ApiError('ATTACHMENT_INVALID', res.status);
  const done = await api.completeUpload(slot.attachmentId);
  return { id: done.id, kind: info.kind, name: file.name, sizeBytes: file.size };
}
