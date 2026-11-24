import {
  type AttachmentKind,
  AttachmentSchema,
  AttachmentUrlResponseSchema,
  DomainError,
  MAX_ATTACHMENT_BYTES,
  UploadUrlRequestSchema,
  UploadUrlResponseSchema,
  type z,
} from '@pronto/shared';
import type { Attachment } from '../../domain/types';
import type {
  AttachmentRepository,
  AuditLog,
  CompanyRepository,
  FileStorage,
  IdGenerator,
  InvoiceRepository,
  RateLimiter,
} from '../ports';
import {
  type Actor,
  enforceRateLimit,
  parseOutput,
  requireCompany,
  roleOn,
  toAttachmentDto,
} from './shared';

export const UPLOAD_URL_TTL_SECONDS = 600;
export const DOWNLOAD_URL_TTL_SECONDS = 300;
/** Rate limit for uploads (section 12): per company. */
export const UPLOAD_RATE = { windowSeconds: 3600, max: 30 } as const;

/** Mime types each attachment kind accepts. */
export const KIND_MIMES: Record<AttachmentKind, readonly string[]> = {
  pdf: ['application/pdf'],
  image: ['image/jpeg', 'image/png'],
  xml: ['application/xml', 'text/xml'],
};

function invalid(reason: string): DomainError {
  return new DomainError('ATTACHMENT_INVALID', 'Invalid attachment', { reason });
}

/** 06 RequestUploadUrl: signed direct upload to private storage, at a random path. */
export class RequestUploadUrl {
  constructor(
    private readonly deps: {
      companies: CompanyRepository;
      attachments: AttachmentRepository;
      storage: FileStorage;
      ids: IdGenerator;
      rateLimiter: RateLimiter;
      audit: AuditLog;
    },
  ) {}

  async execute(
    actor: Actor | null,
    input: unknown,
  ): Promise<z.output<typeof UploadUrlResponseSchema>> {
    const me = await requireCompany(this.deps.companies, actor);
    await enforceRateLimit(
      this.deps.rateLimiter,
      `upload:${me.id}`,
      UPLOAD_RATE.windowSeconds,
      UPLOAD_RATE.max,
    );
    // Type and size errors are ATTACHMENT_INVALID (the user-facing message lists the rules).
    const r = UploadUrlRequestSchema.safeParse(input);
    if (!r.success) throw invalid('type or size not allowed');
    const req = r.data;
    if (!KIND_MIMES[req.kind].includes(req.mime)) throw invalid('mime does not match kind');

    const id = this.deps.ids.uuid();
    const storagePath = `${me.id}/${this.deps.ids.uuid()}`;
    const attachment: Attachment = {
      id,
      invoiceId: null,
      ownerCompanyId: me.id,
      kind: req.kind,
      storagePath,
      mime: req.mime,
      sizeBytes: req.sizeBytes,
      sha256: null,
      status: 'pending',
    };
    await this.deps.attachments.insert(attachment);
    const { url, expiresAt } = await this.deps.storage.createUploadUrl(
      storagePath,
      req.mime,
      MAX_ATTACHMENT_BYTES,
      UPLOAD_URL_TTL_SECONDS,
    );
    await this.deps.audit.record({
      kind: 'attachment.requested',
      actorCompanyId: me.id,
      subject: id,
      data: { kind: req.kind, mime: req.mime, sizeBytes: req.sizeBytes },
    });
    return parseOutput(UploadUrlResponseSchema, {
      attachmentId: id,
      uploadUrl: url,
      expiresAt: expiresAt.toISOString(),
    });
  }
}

/** 06 CompleteUpload: checks the stored object (exists, real mime, size) and marks it ready. */
export class CompleteUpload {
  constructor(
    private readonly deps: {
      companies: CompanyRepository;
      attachments: AttachmentRepository;
      storage: FileStorage;
      audit: AuditLog;
    },
  ) {}

  async execute(
    actor: Actor | null,
    attachmentId: string,
  ): Promise<z.output<typeof AttachmentSchema>> {
    const me = await requireCompany(this.deps.companies, actor);
    const a = await this.deps.attachments.byId(attachmentId);
    if (a === null) throw invalid('not found');
    if (a.ownerCompanyId !== me.id) throw new DomainError('FORBIDDEN');
    if (a.status === 'ready') return toAttachmentDto(a);
    const head = await this.deps.storage.head(a.storagePath);
    if (head === null) throw invalid('not uploaded');
    if (head.sizeBytes <= 0 || head.sizeBytes > MAX_ATTACHMENT_BYTES) throw invalid('size');
    if (!KIND_MIMES[a.kind].includes(head.mime)) throw invalid('stored mime does not match');
    const ready = await this.deps.attachments.markReady(a.id, {
      sizeBytes: head.sizeBytes,
      sha256: head.sha256 ?? null,
    });
    await this.deps.audit.record({
      kind: 'attachment.completed',
      actorCompanyId: me.id,
      subject: a.id,
      data: { sizeBytes: head.sizeBytes },
    });
    return parseOutput(AttachmentSchema, toAttachmentDto(ready));
  }
}

/**
 * 06 GetAttachmentUrl: short-lived download link. Before linking only the owner sees it;
 * once linked, only the supplier and the buyer of that invoice.
 */
export class GetAttachmentUrl {
  constructor(
    private readonly deps: {
      companies: CompanyRepository;
      attachments: AttachmentRepository;
      invoices: InvoiceRepository;
      storage: FileStorage;
    },
  ) {}

  async execute(
    actor: Actor | null,
    attachmentId: string,
  ): Promise<z.output<typeof AttachmentUrlResponseSchema>> {
    const me = await requireCompany(this.deps.companies, actor);
    const a = await this.deps.attachments.byId(attachmentId);
    if (a === null || a.status !== 'ready') throw invalid('not found');
    if (a.invoiceId === null) {
      if (a.ownerCompanyId !== me.id) throw new DomainError('FORBIDDEN');
    } else {
      const invoice = await this.deps.invoices.byId(a.invoiceId);
      if (invoice === null) throw new DomainError('INVOICE_NOT_FOUND');
      roleOn(invoice, me.id);
    }
    const url = await this.deps.storage.createDownloadUrl(a.storagePath, DOWNLOAD_URL_TTL_SECONDS);
    return parseOutput(AttachmentUrlResponseSchema, { url });
  }
}
