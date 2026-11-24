import { describe, expect, it } from 'vitest';
import { parseInvoiceXml } from './parseXml';

const XML = `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>F001-00000123</cbc:ID>
  <cbc:IssueDate>2026-11-20</cbc:IssueDate>
  <cbc:DueDate>2026-12-20</cbc:DueDate>
  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="USD">1000.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
</Invoice>`;

describe('parseInvoiceXml', () => {
  it('reads series, number, amount and dates', () => {
    expect(parseInvoiceXml(XML)).toEqual({
      series: 'F001',
      number: '123',
      faceAmount: '1000',
      issueDate: '2026-11-20',
      dueDate: '2026-12-20',
    });
  });

  it('returns nothing for a foreign or broken file', () => {
    expect(parseInvoiceXml('<a><b></a>')).toEqual({});
    expect(parseInvoiceXml('<html></html>')).toEqual({});
  });
});
