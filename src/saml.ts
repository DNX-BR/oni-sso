import { XMLParser } from 'fast-xml-parser';
import type { Role } from './types.js';

// Decodifica o SAMLResponse (URI-encoded base64) para XML em utf-8.
export function decodeSaml(encoded: string): string {
  return Buffer.from(decodeURIComponent(encoded), 'base64').toString('utf-8');
}

// Coleta recursivamente todos os valores string de um objeto/array.
function collectStrings(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectStrings(value, out);
    }
  }
}

// Extrai as roles do XML SAML de forma agnóstica a namespace (funciona tanto
// para Google quanto para Azure). O par role/principal pode vir em qualquer
// ordem; identificamos cada parte pelo conteúdo do ARN.
export function getRoles(xml: string): Role[] {
  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
  const parsed: unknown = parser.parse(xml);

  const values: string[] = [];
  collectStrings(parsed, values);

  const roles: Role[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!value.includes('arn:aws:iam:') || !value.includes('saml-provider')) continue;
    const parts = value.split(',').map((p) => p.trim());
    const role = parts.find((p) => p.includes(':role/'));
    const principal = parts.find((p) => p.includes(':saml-provider/'));
    if (role && principal && !seen.has(role)) {
      seen.add(role);
      roles.push({ role, principal });
    }
  }

  return roles;
}
