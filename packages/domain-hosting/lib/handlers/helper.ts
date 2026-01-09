import { MxRecordValue, RecordTarget, SrvRecordValue } from "aws-cdk-lib/aws-route53";

export type DNSRecord =
  | { type: 'A'; name: string; value: RecordTarget }
  | { type: 'AAAA'; name: string; value: RecordTarget }
  | { type: 'CNAME'; name: string; value: string }
  | { type: 'TXT'; name: string; value: string[] }
  | { type: 'MX'; name: string; value: MxRecordValue[] }
  | { type: 'SRV'; name: string; value: SrvRecordValue[] };