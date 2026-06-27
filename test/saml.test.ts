import { test } from 'node:test';
import assert from 'node:assert';
import { getRoles, decodeSaml } from '../src/saml.js';

const GOOGLE_SAML = `<?xml version="1.0"?>
<saml2p:Response>
  <saml2:Assertion>
    <saml2:AttributeStatement>
      <saml2:Attribute Name="https://aws.amazon.com/SAML/Attributes/Role">
        <saml2:AttributeValue>arn:aws:iam::111111111111:role/Admin,arn:aws:iam::111111111111:saml-provider/Google</saml2:AttributeValue>
        <saml2:AttributeValue>arn:aws:iam::222222222222:role/ReadOnly,arn:aws:iam::222222222222:saml-provider/Google</saml2:AttributeValue>
      </saml2:Attribute>
      <saml2:Attribute Name="https://aws.amazon.com/SAML/Attributes/RoleSessionName">
        <saml2:AttributeValue>user@example.com</saml2:AttributeValue>
      </saml2:Attribute>
    </saml2:AttributeStatement>
  </saml2:Assertion>
</saml2p:Response>`;

// Azure costuma emitir o par na ordem inversa (principal,role).
const AZURE_SAML = `<?xml version="1.0"?>
<samlp:Response>
  <Assertion>
    <AttributeStatement>
      <Attribute Name="https://aws.amazon.com/SAML/Attributes/Role">
        <AttributeValue>arn:aws:iam::333333333333:saml-provider/Azure,arn:aws:iam::333333333333:role/Power</AttributeValue>
      </Attribute>
      <Attribute Name="https://aws.amazon.com/SAML/Attributes/RoleSessionName">
        <AttributeValue>user@example.com</AttributeValue>
      </Attribute>
    </AttributeStatement>
  </Assertion>
</samlp:Response>`;

test('getRoles extrai múltiplas roles (Google) ignorando atributos não-IAM', () => {
  const roles = getRoles(GOOGLE_SAML);
  assert.strictEqual(roles.length, 2);
  assert.strictEqual(roles[0]?.role, 'arn:aws:iam::111111111111:role/Admin');
  assert.strictEqual(roles[0]?.principal, 'arn:aws:iam::111111111111:saml-provider/Google');
  assert.strictEqual(roles[1]?.role, 'arn:aws:iam::222222222222:role/ReadOnly');
});

test('getRoles identifica role/principal independente da ordem (Azure)', () => {
  const roles = getRoles(AZURE_SAML);
  assert.strictEqual(roles.length, 1);
  assert.strictEqual(roles[0]?.role, 'arn:aws:iam::333333333333:role/Power');
  assert.strictEqual(roles[0]?.principal, 'arn:aws:iam::333333333333:saml-provider/Azure');
});

test('decodeSaml faz roundtrip de base64 URI-encoded', () => {
  const original = '<saml>conteúdo &amp; teste</saml>';
  const encoded = encodeURIComponent(Buffer.from(original, 'utf-8').toString('base64'));
  assert.strictEqual(decodeSaml(encoded), original);
});
