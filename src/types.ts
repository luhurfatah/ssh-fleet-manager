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

export type FieldMappingKey =
  | 'hostname' | 'privateIp' | 'fqdn' | 'instanceId' | 'status'
  | 'company' | 'sbu' | 'generalRole' | 'serverClass' | 'application'
  | 'accountName' | 'owner' | 'ownerEmail' | 'serverPic' | 'instanceType' | 'osVersion';

export type FieldMapping = Partial<Record<FieldMappingKey, string>>;

export const FIELD_DEFS: { key: FieldMappingKey; label: string; defaults: string[] }[] = [
  { key: 'hostname',     label: 'Hostname',       defaults: ['Host name', 'Hostname'] },
  { key: 'privateIp',   label: 'Private IP',     defaults: ['Private IP'] },
  { key: 'fqdn',        label: 'FQDN',           defaults: ['FQDN'] },
  { key: 'instanceId',  label: 'Instance ID',    defaults: ['Instance ID'] },
  { key: 'status',      label: 'Server Status',  defaults: ['Server Status'] },
  { key: 'company',     label: 'Company',        defaults: ['Company'] },
  { key: 'sbu',         label: 'SBU',            defaults: ['SBU'] },
  { key: 'generalRole', label: 'General Role',   defaults: ['General Role'] },
  { key: 'serverClass', label: 'Class',          defaults: ['Class'] },
  { key: 'application', label: 'Application',    defaults: ['Application'] },
  { key: 'accountName', label: 'Account Name',   defaults: ['Amazon Name', 'Account Name'] },
  { key: 'owner',       label: 'Owner',          defaults: ['Owner'] },
  { key: 'ownerEmail',  label: 'Owner Email',    defaults: ['Owner Email'] },
  { key: 'serverPic',   label: 'Server PIC',     defaults: ['Server PIC'] },
  { key: 'instanceType',label: 'Instance Type',  defaults: ['Instance Type'] },
  { key: 'osVersion',   label: 'OS/DB Version',  defaults: ['OS/DB Version'] },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRecord(raw: Record<string, any>, mapping?: FieldMapping): Server {
  // Resolve a field: use the custom column name if mapped, else try each default column.
  function col(key: FieldMappingKey): string {
    const def = FIELD_DEFS.find((d) => d.key === key)!;
    if (mapping?.[key]) return String(raw[mapping[key]] ?? '');
    for (const d of def.defaults) {
      if (raw[d] !== undefined && raw[d] !== '') return String(raw[d]);
    }
    return '';
  }

  const serverClass = col('serverClass');
  const osVersion   = col('osVersion');
  const cls    = serverClass.toLowerCase();
  const osVer  = osVersion.toLowerCase();
  const os: 'linux' | 'windows' =
    cls.includes('windows') || osVer.includes('windows') ? 'windows' : 'linux';

  return {
    hostname:     col('hostname'),
    privateIp:    col('privateIp'),
    fqdn:         col('fqdn'),
    instanceId:   col('instanceId'),
    status:       col('status'),
    company:      col('company'),
    sbu:          col('sbu'),
    generalRole:  col('generalRole'),
    serverClass,
    application:  col('application'),
    accountName:  col('accountName'),
    owner:        col('owner'),
    ownerEmail:   col('ownerEmail'),
    serverPic:    col('serverPic'),
    instanceType: col('instanceType'),
    osVersion,
    os,
  };
}
