import { CompanyPageSchema, CompanySchema, PublicCompanySchema } from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import { expectCode, makeKit, ruc, wallet } from './kit';

const body = {
  ruc: '20100070970',
  legalName: 'Imprenta Sur SAC',
  sector: 'Imprenta',
  profile: 'supplier',
};

describe('03 RegisterCompany', () => {
  it('happy path: creates the company with a PR- code', async () => {
    const { uc, a } = makeKit();
    const c = await uc.registerCompany.execute({ address: wallet(1), companyId: null }, body);
    expect(CompanySchema.parse(c)).toEqual(c);
    expect(c.code).toMatch(/^PR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(c.wallet).toBe(wallet(1));
    expect(c.fichaPublica).toBe(true);
    expect(a.audit.kinds()).toEqual(['company.registered']);
  });

  it('RUC_INVALID, RUC_TAKEN, WALLET_TAKEN, UNAUTHENTICATED, VALIDATION_ERROR', async () => {
    const { uc } = makeKit();
    const actor = { address: wallet(1), companyId: null };
    await expectCode(
      uc.registerCompany.execute(actor, { ...body, ruc: '20100070971' }),
      'RUC_INVALID',
    );
    await uc.registerCompany.execute(actor, body);
    await expectCode(uc.registerCompany.execute(actor, { ...body, ruc: ruc(5) }), 'WALLET_TAKEN');
    await expectCode(
      uc.registerCompany.execute({ address: wallet(2), companyId: null }, body),
      'RUC_TAKEN',
    );
    await expectCode(uc.registerCompany.execute(null, body), 'UNAUTHENTICATED');
    await expectCode(
      uc.registerCompany.execute(actor, { ...body, legalName: 'x' }),
      'VALIDATION_ERROR',
    );
  });

  it('regenerates the code on collision and fails after the attempt limit', async () => {
    const k = makeKit();
    k.a.ids.queueCompanyCodes('PR-222222');
    await k.company(1);
    k.a.ids.queueCompanyCodes('PR-222222', 'PR-333333');
    const second = await k.uc.registerCompany.execute(
      { address: wallet(2), companyId: null },
      { ...body, ruc: ruc(2) },
    );
    expect(second.code).toBe('PR-333333');
    k.a.ids.queueCompanyCodes(...Array(5).fill('PR-222222'));
    await expectCode(
      k.uc.registerCompany.execute(
        { address: wallet(3), companyId: null },
        { ...body, ruc: ruc(3) },
      ),
      'INTERNAL',
    );
  });
});

describe('04 GetMe and UpdateSettings', () => {
  it('returns own data and toggles the public profile', async () => {
    const k = makeKit();
    const me = await k.company(1);
    const got = await k.uc.getMe.execute(me.actor);
    expect(got.id).toBe(me.id);
    // Token issued after registration carries the company id.
    expect((await k.uc.getMe.execute({ address: me.wallet, companyId: me.id })).id).toBe(me.id);
    const upd = await k.uc.updateSettings.execute(me.actor, { fichaPublica: false });
    expect(upd.fichaPublica).toBe(false);
    expect(k.a.audit.kinds()).toContain('company.settings_updated');
  });

  it('a wallet without company is FORBIDDEN; a token for another wallet too', async () => {
    const k = makeKit();
    const me = await k.company(1);
    await expectCode(k.uc.getMe.execute({ address: wallet(9), companyId: null }), 'FORBIDDEN');
    await expectCode(k.uc.getMe.execute({ address: wallet(9), companyId: me.id }), 'FORBIDDEN');
    await expectCode(k.uc.getMe.execute(null), 'UNAUTHENTICATED');
  });
});

describe('05 FindCompany', () => {
  it('finds by exact code or RUC and returns public data only', async () => {
    const k = makeKit();
    const me = await k.company(1);
    const other = await k.company(2, 'Distribuidora Yanahuara SAC');
    const page = await k.uc.getMe.execute(other.actor);
    const byCode = await k.uc.findCompany.execute(me.actor, { code: page.code });
    expect(byCode).toEqual(PublicCompanySchema.parse(byCode));
    expect(Object.keys(byCode).sort()).toEqual(['code', 'id', 'legalName', 'ruc']);
    const byRuc = await k.uc.findCompany.execute(me.actor, { ruc: ruc(2) });
    expect(byRuc.id).toBe(other.id);
  });

  it('errors: COMPANY_NOT_FOUND, RUC_INVALID, VALIDATION_ERROR', async () => {
    const k = makeKit();
    const me = await k.company(1);
    await expectCode(
      k.uc.findCompany.execute(me.actor, { code: 'PR-ZZZZZZ' }),
      'COMPANY_NOT_FOUND',
    );
    await expectCode(k.uc.findCompany.execute(me.actor, { ruc: ruc(7) }), 'COMPANY_NOT_FOUND');
    await expectCode(k.uc.findCompany.execute(me.actor, { ruc: '20100070971' }), 'RUC_INVALID');
    await expectCode(k.uc.findCompany.execute(me.actor, {}), 'VALIDATION_ERROR');
  });
});

describe('14 ListContacts and GetCompanyPage', () => {
  it('contacts come from own invoices only, per role', async () => {
    const k = makeKit();
    const s = await k.company(1, 'B Imprenta');
    const b1 = await k.company(2, 'Zeta SAC');
    const b2 = await k.company(3, 'Alfa SAC');
    const outsider = await k.company(4);
    for (const b of [b1, b2, b1]) {
      const att = await k.readyAttachment(s.actor);
      await k.uc.sendInvoice.execute(s.actor, k.invoiceInput(b.id, att));
    }
    const clients = await k.uc.listContacts.execute(s.actor, { role: 'supplier' });
    expect(clients.map((c) => c.legalName)).toEqual(['Alfa SAC', 'Zeta SAC']);
    const suppliers = await k.uc.listContacts.execute(b1.actor, { role: 'buyer' });
    expect(suppliers.map((c) => c.id)).toEqual([s.id]);
    expect(await k.uc.listContacts.execute(outsider.actor, { role: 'buyer' })).toEqual([]);
    await expectCode(k.uc.listContacts.execute(s.actor, { role: 'x' }), 'VALIDATION_ERROR');
  });

  it('public page respects the public profile switch', async () => {
    const k = makeKit();
    const me = await k.company(1);
    const { code } = await k.uc.getMe.execute(me.actor);
    const page = await k.uc.getCompanyPage.execute(code);
    expect(CompanyPageSchema.parse(page)).toEqual(page);
    await k.uc.updateSettings.execute(me.actor, { fichaPublica: false });
    await expectCode(k.uc.getCompanyPage.execute(code), 'COMPANY_NOT_FOUND');
    await expectCode(k.uc.getCompanyPage.execute('PR-ZZZZZZ'), 'COMPANY_NOT_FOUND');
    await expectCode(k.uc.getCompanyPage.execute('bad'), 'VALIDATION_ERROR');
  });
});
