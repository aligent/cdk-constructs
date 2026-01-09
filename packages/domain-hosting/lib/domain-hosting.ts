import { Construct } from "constructs";
import { Certificate, DnsValidatedCertificate } from "aws-cdk-lib/aws-certificatemanager";
import { AaaaRecord, ARecord, CnameRecord, HostedZone, MxRecord, PublicHostedZone, SrvRecord, TxtRecord } from "aws-cdk-lib/aws-route53";
import { DNSRecord } from './handlers/helper'

export interface DomainHostingProps {
  domainName: string
  hostedZoneId?: string
  createCertificate?: boolean
  certificateArn?: string
  subDomains?: string[]
  records?: DNSRecord[]
}

export class DomainHosting extends Construct {

  constructor(scope: Construct, id: string, props: DomainHostingProps) {
    super(scope, id);

    const {
      domainName,
      hostedZoneId,
      createCertificate = false,
      certificateArn,
      subDomains = [],
      records = []
    } = props;

    let hostedZone;
    const createCert = createCertificate || subDomains.length > 0
    if (!hostedZoneId) {
      hostedZone = new PublicHostedZone(this, 'HostedZone', {
        zoneName: domainName,
      });
    } else {
      hostedZone = HostedZone.fromHostedZoneAttributes(
        this,
        'HostedZone',
        {
          hostedZoneId,
          zoneName: domainName,
        }
      );
    }
    if (certificateArn) {
      const certificate = Certificate.fromCertificateArn(
        this,
        'DomainCertificate',
        certificateArn
      );
    } else if (createCert) {
      // If you are creating a certificate and your domain is hosted outside AWS don't forget to update the NS record in your provider
      // @deprecated but no replacement for generating cert and creating CNAMEs in zone
      new DnsValidatedCertificate(this, 'Certificate', {
        domainName: domainName,
        subjectAlternativeNames: [
          ...subDomains.map((s) => `${s}.${domainName}`),
        ],
        hostedZone: hostedZone,
        region: 'us-east-1'
      });


    }
    if (records) {
      records.map((r, i) => {
        const recordId = `${r.name}-${r.type}`
        switch (r.type) {
          case "A":
            console.log('#### HERE ####')
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
            break;
        }
      })
    }


  }
}
