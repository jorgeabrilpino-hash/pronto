import type {
  AttachmentRepository,
  AuditLog,
  ChainReader,
  ChallengeStore,
  Clock,
  CompanyRepository,
  FileStorage,
  IdGenerator,
  InvoiceRepository,
  OfferRepository,
  RateLimiter,
  SignatureVerifier,
  TokenService,
} from '../ports';
import { CompleteUpload, GetAttachmentUrl, RequestUploadUrl } from './attachments';
import { Authenticate, RequestChallenge, VerifyChallenge } from './auth';
import {
  FindCompany,
  GetCompanyPage,
  GetMe,
  ListContacts,
  RegisterCompany,
  UpdateSettings,
} from './companies';
import {
  CancelInvoice,
  ConfirmInvoice,
  EditAndResend,
  GetInvoice,
  ListInvoices,
  RejectInvoice,
  SendInvoice,
} from './invoices';
import { GetNetworkSummary, GetOfferProof, PrepareOffer, ReconcileOffer } from './offers';

export * from './attachments';
export * from './auth';
export * from './companies';
export * from './invoices';
export * from './offers';
export type { Actor } from './shared';

/** Every port the use cases need. Adapters (memory, Postgres, Stellar...) provide them. */
export interface Ports {
  companies: CompanyRepository;
  invoices: InvoiceRepository;
  offers: OfferRepository;
  attachments: AttachmentRepository;
  storage: FileStorage;
  chain: ChainReader;
  challenges: ChallengeStore;
  signatures: SignatureVerifier;
  tokens: TokenService;
  rateLimiter: RateLimiter;
  audit: AuditLog;
  clock: Clock;
  ids: IdGenerator;
}

/** Wires use cases 01 to 14 and 18 to a set of ports. */
export function createUseCases(p: Ports) {
  const reconcileOffer = new ReconcileOffer(p);
  return {
    requestChallenge: new RequestChallenge(p),
    verifyChallenge: new VerifyChallenge(p),
    authenticate: new Authenticate(p),
    registerCompany: new RegisterCompany(p),
    getMe: new GetMe(p),
    updateSettings: new UpdateSettings(p),
    findCompany: new FindCompany(p),
    requestUploadUrl: new RequestUploadUrl(p),
    completeUpload: new CompleteUpload(p),
    getAttachmentUrl: new GetAttachmentUrl(p),
    sendInvoice: new SendInvoice(p),
    listInvoices: new ListInvoices(p, reconcileOffer),
    getInvoice: new GetInvoice(p),
    confirmInvoice: new ConfirmInvoice(p),
    rejectInvoice: new RejectInvoice(p),
    editAndResend: new EditAndResend(p),
    cancelInvoice: new CancelInvoice(p),
    prepareOffer: new PrepareOffer(p),
    reconcileOffer,
    getOfferProof: new GetOfferProof(p),
    listContacts: new ListContacts(p),
    getCompanyPage: new GetCompanyPage(p),
    getNetworkSummary: new GetNetworkSummary(p),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
