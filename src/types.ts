export interface Role {
  role: string;
  principal: string;
}

export interface Credentials {
  AccessKeyId?: string;
  SecretAccessKey?: string;
  SessionToken?: string;
  Expiration?: Date;
}

export interface SamlLoginResult {
  saml: string;
  roles: Role[];
}

export type OutputFormatName = 'console' | 'one' | 'env' | 'export' | 'profile';
