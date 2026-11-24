import { AttachmentSchema, MAX_ATTACHMENT_BYTES, UploadUrlResponseSchema } from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import { UPLOAD_RATE } from '../attachments';
import { expectCode, makeKit } from './kit';

describe('06 RequestUploadUrl, CompleteUpload and GetAttachmentUrl', () => {
  it('happy path: signed upload at a random path owned by the company', async () => {
    const k = makeKit();
    const me = await k.company(1);
    const res = await k.uc.requestUploadUrl.execute(me.actor, {
      kind: 'image',
      mime: 'image/jpeg',
      sizeBytes: 2048,
    });
    expect(UploadUrlResponseSchema.parse(res)).toEqual(res);
    const stored = await k.a.attachments.byId(res.attachmentId);
    expect(stored?.status).toBe('pending');
    expect(stored?.storagePath.startsWith(`${me.id}/`)).toBe(true);
    expect(stored?.storagePath).not.toContain(res.attachmentId);

    k.a.storage.put(stored?.storagePath ?? '', { sizeBytes: 2000, mime: 'image/jpeg' });
    const done = await k.uc.completeUpload.execute(me.actor, res.attachmentId);
    expect(AttachmentSchema.parse(done)).toEqual(done);
    expect(done.sizeBytes).toBe(2000);
    const ready = await k.a.attachments.byId(res.attachmentId);
    expect(ready?.status).toBe('ready');
    expect(ready?.sha256).toBeNull();
    // Completing twice is harmless.
    expect((await k.uc.completeUpload.execute(me.actor, res.attachmentId)).id).toBe(done.id);

    const { url } = await k.uc.getAttachmentUrl.execute(me.actor, res.attachmentId);
    expect(url).toMatch(/^https:\/\//);
    expect(k.a.audit.kinds()).toEqual([
      'company.registered',
      'attachment.requested',
      'attachment.completed',
    ]);
  });

  it('type, size and mime mismatches are ATTACHMENT_INVALID', async () => {
    const k = makeKit();
    const me = await k.company(1);
    const req = (kind: string, mime: string, sizeBytes: number) =>
      k.uc.requestUploadUrl.execute(me.actor, { kind, mime, sizeBytes });
    await expectCode(req('pdf', 'application/zip', 10), 'ATTACHMENT_INVALID');
    await expectCode(req('pdf', 'application/pdf', MAX_ATTACHMENT_BYTES + 1), 'ATTACHMENT_INVALID');
    await expectCode(req('pdf', 'image/png', 10), 'ATTACHMENT_INVALID');

    const { attachmentId } = await k.uc.requestUploadUrl.execute(me.actor, {
      kind: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 10,
    });
    const path = (await k.a.attachments.byId(attachmentId))?.storagePath ?? '';
    await expectCode(k.uc.completeUpload.execute(me.actor, attachmentId), 'ATTACHMENT_INVALID');
    k.a.storage.put(path, { sizeBytes: 10, mime: 'text/html' });
    await expectCode(k.uc.completeUpload.execute(me.actor, attachmentId), 'ATTACHMENT_INVALID');
    k.a.storage.put(path, { sizeBytes: MAX_ATTACHMENT_BYTES + 1, mime: 'application/pdf' });
    await expectCode(k.uc.completeUpload.execute(me.actor, attachmentId), 'ATTACHMENT_INVALID');
    await expectCode(k.uc.completeUpload.execute(me.actor, k.a.ids.uuid()), 'ATTACHMENT_INVALID');
    await expectCode(k.uc.getAttachmentUrl.execute(me.actor, attachmentId), 'ATTACHMENT_INVALID');
  });

  it('authorization: only the owner before linking, only the parties after', async () => {
    const k = makeKit();
    const owner = await k.company(1);
    const buyer = await k.company(2);
    const outsider = await k.company(3);
    const att = await k.readyAttachment(owner.actor);
    await expectCode(k.uc.completeUpload.execute(outsider.actor, att), 'FORBIDDEN');
    await expectCode(k.uc.getAttachmentUrl.execute(buyer.actor, att), 'FORBIDDEN');
    await k.uc.sendInvoice.execute(owner.actor, k.invoiceInput(buyer.id, att));
    expect((await k.uc.getAttachmentUrl.execute(buyer.actor, att)).url).toBeTruthy();
    expect((await k.uc.getAttachmentUrl.execute(owner.actor, att)).url).toBeTruthy();
    await expectCode(k.uc.getAttachmentUrl.execute(outsider.actor, att), 'FORBIDDEN');
  });

  it('uploads are rate limited per company', async () => {
    const k = makeKit();
    const me = await k.company(1);
    const input = { kind: 'pdf', mime: 'application/pdf', sizeBytes: 10 };
    for (let i = 0; i < UPLOAD_RATE.max; i++) await k.uc.requestUploadUrl.execute(me.actor, input);
    await expectCode(k.uc.requestUploadUrl.execute(me.actor, input), 'RATE_LIMITED');
  });
});
