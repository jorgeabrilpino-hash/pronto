import {
  CompanyPageSchema,
  type CompanySchema,
  DomainError,
  ListContactsQuerySchema,
  LookupQuerySchema,
  PublicCompanySchema,
  RegisterCompanyRequestSchema,
  UpdateSettingsRequestSchema,
  type z,
} from '@pronto/shared';
import type { Company } from '../../domain/types';
import { parseCompanyCode, parseRuc } from '../../domain/values';
import type { AuditLog, Clock, CompanyRepository, IdGenerator, InvoiceRepository } from '../ports';
import {
  type Actor,
  parseInput,
  parseOutput,
  requireActor,
  requireCompany,
  toCompanyDto,
  toPublicCompany,
} from './shared';

/** Attempts to find a free company code before giving up (collisions are rare). */
export const COMPANY_CODE_ATTEMPTS = 5;

/** 03 RegisterCompany: a signed-in wallet without company. RUC, wallet and code are unique. */
export class RegisterCompany {
  constructor(
    private readonly deps: {
      companies: CompanyRepository;
      ids: IdGenerator;
      clock: Clock;
      audit: AuditLog;
    },
  ) {}

  async execute(actor: Actor | null, input: unknown): Promise<z.output<typeof CompanySchema>> {
    const caller = requireActor(actor);
    const req = parseInput(RegisterCompanyRequestSchema, input);
    const ruc = parseRuc(req.ruc);
    if ((await this.deps.companies.byWallet(caller.address)) !== null) {
      throw new DomainError('WALLET_TAKEN');
    }
    if ((await this.deps.companies.byRuc(ruc)) !== null) throw new DomainError('RUC_TAKEN');

    const code = await this.freeCode();
    const company: Company = {
      id: this.deps.ids.uuid(),
      ruc,
      legalName: req.legalName,
      sector: req.sector,
      wallet: caller.address,
      code,
      fichaPublica: true,
      profile: req.profile,
      createdAt: this.deps.clock.now(),
    };
    await this.deps.companies.insert(company);
    await this.deps.audit.record({
      kind: 'company.registered',
      actorCompanyId: company.id,
      subject: company.id,
    });
    return toCompanyDto(company);
  }

  private async freeCode(): Promise<string> {
    for (let i = 0; i < COMPANY_CODE_ATTEMPTS; i++) {
      const code = this.deps.ids.companyCode();
      if ((await this.deps.companies.byCode(code)) === null) return code;
    }
    throw new DomainError('INTERNAL', 'Could not allocate a company code');
  }
}

/** 04 GetMe. */
export class GetMe {
  constructor(private readonly deps: { companies: CompanyRepository }) {}

  async execute(actor: Actor | null): Promise<z.output<typeof CompanySchema>> {
    return toCompanyDto(await requireCompany(this.deps.companies, actor));
  }
}

/** 04 UpdateSettings: public ficha on or off, and the company profile. */
export class UpdateSettings {
  constructor(private readonly deps: { companies: CompanyRepository; audit: AuditLog }) {}

  async execute(actor: Actor | null, input: unknown): Promise<z.output<typeof CompanySchema>> {
    const me = await requireCompany(this.deps.companies, actor);
    const req = parseInput(UpdateSettingsRequestSchema, input);
    const patch: { fichaPublica?: boolean; profile?: Company['profile'] } = {};
    if (req.fichaPublica !== undefined) patch.fichaPublica = req.fichaPublica;
    if (req.profile !== undefined) patch.profile = req.profile;
    const updated = await this.deps.companies.update(me.id, patch);
    await this.deps.audit.record({
      kind: 'company.settings_updated',
      actorCompanyId: me.id,
      subject: me.id,
      data: { ...patch },
    });
    return toCompanyDto(updated);
  }
}

/** 05 FindCompany: by exact code or exact RUC; public data only. */
export class FindCompany {
  constructor(private readonly deps: { companies: CompanyRepository }) {}

  async execute(
    actor: Actor | null,
    input: unknown,
  ): Promise<z.output<typeof PublicCompanySchema>> {
    await requireCompany(this.deps.companies, actor);
    const q = parseInput(LookupQuerySchema, input);
    const found =
      q.code !== undefined
        ? await this.deps.companies.byCode(parseCompanyCode(q.code))
        : await this.deps.companies.byRuc(parseRuc(q.ruc ?? ''));
    if (found === null) throw new DomainError('COMPANY_NOT_FOUND');
    return parseOutput(PublicCompanySchema, toPublicCompany(found));
  }
}

/**
 * 14 ListContacts: companies on the other side of the caller's invoices.
 * role = supplier lists my clients; role = buyer lists my suppliers. Only the own company.
 */
export class ListContacts {
  constructor(
    private readonly deps: { companies: CompanyRepository; invoices: InvoiceRepository },
  ) {}

  async execute(
    actor: Actor | null,
    input: unknown,
  ): Promise<Array<z.output<typeof PublicCompanySchema>>> {
    const me = await requireCompany(this.deps.companies, actor);
    const { role } = parseInput(ListContactsQuerySchema, input);
    const invoices = await this.deps.invoices.listFor(me.id, role);
    const ids = [...new Set(invoices.map((i) => (role === 'supplier' ? i.buyerId : i.supplierId)))];
    const out: Array<z.output<typeof PublicCompanySchema>> = [];
    for (const id of ids) {
      const c = await this.deps.companies.byId(id);
      if (c !== null) out.push(toPublicCompany(c));
    }
    return out.sort((a, b) => a.legalName.localeCompare(b.legalName));
  }
}

/** 14 GetCompanyPage: public destination of the QR. Hidden when the ficha is not public. */
export class GetCompanyPage {
  constructor(private readonly deps: { companies: CompanyRepository }) {}

  async execute(code: string): Promise<z.output<typeof CompanyPageSchema>> {
    const c = await this.deps.companies.byCode(parseCompanyCode(code));
    if (c === null || !c.fichaPublica) throw new DomainError('COMPANY_NOT_FOUND');
    return parseOutput(CompanyPageSchema, {
      code: c.code,
      legalName: c.legalName,
      ruc: c.ruc,
      sector: c.sector,
    });
  }
}
