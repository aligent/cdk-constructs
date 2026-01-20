import { Construct } from "constructs";
import {
  Certificate,
  DnsValidatedCertificate,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  AaaaRecord,
  ARecord,
  CnameRecord,
  HostedZone,
  MxRecord,
  MxRecordValue,
  PublicHostedZone,
  RecordTarget,
  SrvRecord,
  SrvRecordValue,
  TxtRecord,
} from "aws-cdk-lib/aws-route53";

type DNSRecord =
  | { type: "A"; name: string; value: RecordTarget }
  | { type: "AAAA"; name: string; value: RecordTarget }
  | { type: "CNAME"; name: string; value: string }
  | { type: "TXT"; name: string; value: string[] }
  | { type: "MX"; name: string; value: MxRecordValue[] }
  | { type: "SRV"; name: string; value: SrvRecordValue[] };

export interface DomainHostingProps {
  /**
   * Domain name for the hosted zone. This is also the base for the certificate if created
   */
  domainName: string;
  /**
   * If you are using a zone that already exists just put its id instead
   * This will make the CDK update the existing zone in place (it will not remove records that aren't in the code yet)
   */
  hostedZoneId?: string;
  /**
   * Explicitly state if you want a certificate created for the default domain `domainName` value.
   * Hosted Zones do not require a cert on creation
   * This is set to true if you pass in `certificateSubDomains`
   * Created in `us-east-1`
   * @default false
   */
  createCertificate?: boolean;

  /**
   * The arn of the certificate to validate against if one already exists
   */
  certificateArn?: string;
  /**
   * Extra subdomains to add to the certificate for validation.
   */
  certificateSubDomains?: string[];
  /**
   * Any records to create in the zone, can be of types  `CNAME`, `A`, `AAAA`, `MX`, and `SRV`
   * See docs or type for an example
   */
  records?: DNSRecord[];
}

export class DomainHosting extends Construct {
  constructor(scope: Construct, id: string, props: DomainHostingProps) {
    super(scope, id);

    const {
      domainName,
      hostedZoneId,
      createCertificate = false,
      certificateArn,
      certificateSubDomains = [],
      records = [],
    } = props;

    let hostedZone;
    // If your domain provider isn't AWS don't forget to update the NS record in your provider with the values from Route53
    if (!hostedZoneId) {
      hostedZone = new PublicHostedZone(this, "HostedZone", {
        zoneName: domainName,
      });
    } else {
      hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
        hostedZoneId,
        zoneName: domainName,
      });
    }

    // We also create a cert if subdomains are passed in as the user wants to validate extra values on their domain.
    const createCert = createCertificate || certificateSubDomains.length > 0;
    if (certificateArn) {
      Certificate.fromCertificateArn(this, "DomainCertificate", certificateArn);
    } else if (createCert) {
      // If you are creating a certificate and your domain is hosted outside AWS don't forget to update the NS record in your provider
      // @deprecated but no replacement for generating cert and creating CNAMEs in zone
      new DnsValidatedCertificate(this, "Certificate", {
        domainName: domainName,
        subjectAlternativeNames: [
          ...certificateSubDomains.map(s => `${s}.${domainName}`),
        ],
        hostedZone: hostedZone,
        region: "us-east-1",
      });
    }
    if (records) {
      records.map(r => {
        const recordId = `${r.name}-${r.type}`;
        switch (r.type) {
          case "A":
            new ARecord(this, recordId, {
              zone: hostedZone,
              target: r.value,
            });
            break;
          case "AAAA":
            new AaaaRecord(this, recordId, {
              zone: hostedZone,
              target: r.value,
            });
            break;
          case "CNAME":
            new CnameRecord(this, recordId, {
              zone: hostedZone,
              domainName: r.value,
              recordName: r.name,
            });
            break;
          case "TXT":
            new TxtRecord(this, recordId, {
              zone: hostedZone,
              values: r.value,
              recordName: r.name,
            });
            break;
          case "MX":
            new MxRecord(this, recordId, {
              zone: hostedZone,
              values: r.value,
              recordName: r.name,
            });
            break;
          case "SRV":
            new SrvRecord(this, recordId, {
              zone: hostedZone,
              values: r.value,
              recordName: r.name,
            });
            break;
          default:
            throw new TypeError(`Type is not implemented.`);
        }
      });
    }
  }
}
