export interface XmlInvoiceData {
  series?: string;
  number?: string;
  faceAmount?: string;
  issueDate?: string;
  dueDate?: string;
}

function text(doc: Document, tag: string): string | undefined {
  const v = doc.getElementsByTagName(tag)[0]?.textContent?.trim();
  return v ? v : undefined;
}

/**
 * Reads a Peruvian electronic invoice (UBL 2.1). The XML wins over typed values.
 * Returns only the fields it could read; never throws on a foreign XML.
 */
export function parseInvoiceXml(xml: string): XmlInvoiceData {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return {};
  const out: XmlInvoiceData = {};
  const id = /^([A-Z0-9]{4})-0*(\d{1,8})$/.exec(text(doc, 'cbc:ID') ?? '');
  if (id?.[1] && id[2]) {
    out.series = id[1];
    out.number = id[2];
  }
  const amount = text(doc, 'cbc:PayableAmount');
  if (amount && /^\d+(\.\d{1,7})?$/.test(amount))
    out.faceAmount = amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const issue = text(doc, 'cbc:IssueDate');
  if (issue && /^\d{4}-\d{2}-\d{2}$/.test(issue)) out.issueDate = issue;
  const due = text(doc, 'cbc:DueDate') ?? text(doc, 'cbc:PaymentDueDate');
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) out.dueDate = due;
  return out;
}
