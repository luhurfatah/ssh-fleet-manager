export interface Server {
  hostname: string;
  privateIp: string;
  fqdn: string;
  instanceId: string;
  status: string;
  company: string;
  sbu: string;
  generalRole: string;
  serverClass: string;
  application: string;
  accountName: string;
  owner: string;
  ownerEmail: string;
  serverPic: string;
  instanceType: string;
  osVersion: string;
  os: 'linux' | 'windows';
}

export type GroupBy =
  | 'status'
  | 'company'
  | 'sbu'
  | 'generalRole'
  | 'serverClass'
  | 'application'
  | 'accountName'
  | 'owner'
  | 'instanceType'
  | 'osVersion';

export const GROUPABLE_FIELDS: { value: GroupBy; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'company', label: 'Company' },
  { value: 'sbu', label: 'SBU' },
  { value: 'generalRole', label: 'General Role (Production / Non-Production)' },
  { value: 'serverClass', label: 'Server Class' },
  { value: 'application', label: 'Application' },
  { value: 'accountName', label: 'Account Name' },
  { value: 'owner', label: 'Owner' },
  { value: 'instanceType', label: 'Instance Type' },
  { value: 'osVersion', label: 'OS / DB Version' },
];

export interface ExcludeRule {
  field: GroupBy;
  value: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRecord(raw: Record<string, any>): Server {
  const cls = (raw['Class'] ?? '').toLowerCase();
  const osVer = (raw['OS/DB Version'] ?? '').toLowerCase();
  const os: 'linux' | 'windows' =
    cls.includes('windows') || osVer.includes('windows') ? 'windows' : 'linux';

  return {
    hostname: raw['Host name'] ?? raw['Hostname'] ?? '',
    privateIp: raw['Private IP'] ?? '',
    fqdn: raw['FQDN'] ?? '',
    instanceId: raw['Instance ID'] ?? '',
    status: raw['Server Status'] ?? '',
    company: raw['Company'] ?? '',
    sbu: raw['SBU'] ?? '',
    generalRole: raw['General Role'] ?? '',
    serverClass: raw['Class'] ?? '',
    application: raw['Application'] ?? '',
    accountName: raw['Amazon Name'] ?? raw['Account Name'] ?? '',
    owner: raw['Owner'] ?? '',
    ownerEmail: raw['Owner Email'] ?? '',
    serverPic: raw['Server PIC'] ?? '',
    instanceType: raw['Instance Type'] ?? '',
    osVersion: raw['OS/DB Version'] ?? '',
    os,
  };
}
