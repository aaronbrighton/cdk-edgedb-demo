import { App, Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { CfnListener } from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export class CdkEdgeDBAuroraDemo extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 0,
      maxAzs: 2,
    });

    const defaultDatabaseName: string = 'postgres';
    const cluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_13_4 }),
      instanceProps: {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MEDIUM),
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        vpc,
      },
      defaultDatabaseName,
    });

    const loadBalancedFargateService = new ecsPatterns.NetworkLoadBalancedFargateService(this, 'Service', {
      vpc,
      memoryLimitMiB: 2048,
      cpu: 1024,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry("edgedb/edgedb"),
        containerPort: 5656,
        environment: {
          EDGEDB_SERVER_HTTP_ENDPOINT_SECURITY: 'optional',
          EDGEDB_SERVER_TLS_CERT_MODE: 'generate_self_signed',
          EDGEDB_SERVER_PASSWORD: "SuperS3cretPwd$", // Need to update to use Secrets Manager to auto-generate outside of code.
          EDGEDB_SERVER_BACKEND_DSN: `postgres://${cluster.secret?.secretValueFromJson('username')}:${cluster.secret?.secretValueFromJson('password')}@${cluster.clusterEndpoint.hostname}:${cluster.secret?.secretValueFromJson('port')}/${defaultDatabaseName}`,
        },
      },
      desiredCount: 1,
      publicLoadBalancer: true,
      healthCheckGracePeriod: Duration.minutes(2),
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      assignPublicIp: true,
    });
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hosted-zone', {
      zoneName: 'aaronbrighton.ca',
      hostedZoneId: 'ZRZJWLXW3FS0K',
    });
    const certificate = new acm.DnsValidatedCertificate(this, 'tls-certificate', {
      hostedZone: hostedZone,
      domainName: 'edgedb.aaronbrighton.ca',
    });

    (loadBalancedFargateService.listener.node.defaultChild as CfnListener).port = 5656;
    (loadBalancedFargateService.listener.node.defaultChild as CfnListener).protocol = 'TLS';
    (loadBalancedFargateService.listener.node.defaultChild as CfnListener).sslPolicy = 'ELBSecurityPolicy-TLS13-1-2-2021-06';
    (loadBalancedFargateService.listener.node.defaultChild as CfnListener).alpnPolicy = ['None'];
    (loadBalancedFargateService.listener.node.defaultChild as CfnListener).certificates = [
      {
        certificateArn: certificate.certificateArn,
      }
    ];
    loadBalancedFargateService.service.connections.allowFromAnyIpv4(ec2.Port.tcp(5656));
    (loadBalancedFargateService.targetGroup.node.defaultChild as elbv2.CfnTargetGroup).protocol = 'TLS';

    loadBalancedFargateService.targetGroup.configureHealthCheck({
      path: '/server/status/ready',
      interval: Duration.seconds(10),
      unhealthyThresholdCount: 2,
      healthyThresholdCount: 2,
      protocol: elbv2.Protocol.HTTPS,
    });
    loadBalancedFargateService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '10');
    loadBalancedFargateService.targetGroup.setAttribute('preserve_client_ip.enabled', 'true');
    cluster.connections.allowDefaultPortFrom(loadBalancedFargateService.service);

    new route53.CnameRecord(this, 'nlb-custom-dns', {
      domainName: loadBalancedFargateService.loadBalancer.loadBalancerDnsName,
      recordName: 'edgedb.aaronbrighton.ca',
      zone: hostedZone,
      ttl: Duration.minutes(1), 
    })

    new CfnOutput(this, 'edgedb-endpoint', {
      value: loadBalancedFargateService.loadBalancer.loadBalancerDnsName,
    });
  }
}

const app = new App();

new CdkEdgeDBAuroraDemo(app, 'cdk-edgedb-aurora-demo');

app.synth();