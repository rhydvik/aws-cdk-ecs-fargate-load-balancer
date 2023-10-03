import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_ecr as ecr,
  aws_logs as logs, aws_rds as rds,
  aws_s3 as s3, aws_secretsmanager,
  aws_ec2 as ec2,
  RemovalPolicy, Duration
} from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import {DatabaseInstance} from "aws-cdk-lib/aws-rds";
import {Peer} from "aws-cdk-lib/aws-ec2";

type CDKProps = cdk.StackProps;
interface Props extends CDKProps {
  stackName: string;
  cpuLimit: number;
  fargateTaskMemory: number;
  desiredTaskCount: number;
  autoScaleMaxCap?: number;
  env: {
    region: string;
    account: string
  };
  tags: {
    AppTag: string;
    Environment: string
  };
  retainLogs: boolean;
  containerPort: number;
  envVars: Record<string, any>;
  loadBalancerName: string;
  vpc: any;
  cluster: any;
  dbName: string
  dbUserName: string;
}

export class AppInfraStack extends cdk.Stack {
  public readonly fargateService: ecs_patterns.ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    console.log(props.loadBalancerName, 'vpc');

    const logRetention = props.retainLogs
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_DAY;

    // UI STACK Starts here
    const uiEcrRepository = new ecr.Repository(this, `${props.stackName}-ecr-repo-ui`, {
      repositoryName: `${props.stackName}-repo-ui`,
      removalPolicy: RemovalPolicy.DESTROY,
      imageScanOnPush: true,
    });

    const uiEcsService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, `${props.stackName}-service-ui`, {
      cluster: props.cluster,
      cpu: 512, // Default is 256
      desiredCount: 2, // Default is 1
      taskImageOptions: {
        // image: ecs.ContainerImage.fromEcrRepository(uiEcrRepository, 'latest'),
        // we need below for fist time env creation
        image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
        environment: props.envVars,
      },
      memoryLimitMiB: 1024, // Default is 512
      publicLoadBalancer: true, // Default is false
      loadBalancerName: `dev-app-ui`,
      serviceName: `dev-app-ui`,
    });

    // TODO enable this after deployment of backend api
    uiEcsService.targetGroup.configureHealthCheck({
      path: '/',
      unhealthyThresholdCount: 2,
      healthyThresholdCount: 2,
      timeout: cdk.Duration.seconds(100),
      interval: cdk.Duration.seconds(120),
      healthyHttpCodes: '200-299'
    });

    const logBucketUI = new s3.Bucket(this, 'ALB Logs UI', {
      lifecycleRules: [{ expiration: cdk.Duration.days(props.retainLogs ? 30 : 1) }],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    uiEcsService.loadBalancer.logAccessLogs(logBucketUI);

    uiEcsService.service
        .autoScaleTaskCount({
          minCapacity: props.desiredTaskCount,
          maxCapacity: props.autoScaleMaxCap || props.desiredTaskCount,
        })
        .scaleOnCpuUtilization('cpuScaling', { targetUtilizationPercent: 80 });

    // UI STACK Ends here







    // BACKEND STACK
    // create a ecr repository for backend to push images
     const ecrRepository = new ecr.Repository(this, `${props.stackName}-ecr-repo`, {
        repositoryName: `${props.stackName}-repo`,
        removalPolicy: RemovalPolicy.DESTROY,
        imageScanOnPush: true,
     });


    const ecsService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, `${props.stackName}-service-api`, {
      cluster: props.cluster,
      cpu: 512, // Default is 256
      desiredCount: 2, // Default is 1
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
        environment: props.envVars,
        containerPort: props.containerPort,
        logDriver: ecs.LogDriver.awsLogs({ logRetention, streamPrefix: 'app' }),
      },
      memoryLimitMiB: 1024, // Default is 512
      publicLoadBalancer: true, // Default is false
      loadBalancerName: props.loadBalancerName,
      serviceName: `dev-app-api`,
    });


    // TODO enable this after deployment of backend api
    ecsService.targetGroup.configureHealthCheck({
      path: '/hello',
      unhealthyThresholdCount: 2,
      healthyThresholdCount: 2,
      timeout: cdk.Duration.seconds(100),
      interval: cdk.Duration.seconds(120),
      healthyHttpCodes: '200-299'
    });

    const logBucket = new s3.Bucket(this, 'ALB Logs', {
      lifecycleRules: [{ expiration: cdk.Duration.days(props.retainLogs ? 30 : 1) }],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    ecsService.loadBalancer.logAccessLogs(logBucket);

    ecsService.service
        .autoScaleTaskCount({
          minCapacity: props.desiredTaskCount,
          maxCapacity: props.autoScaleMaxCap || props.desiredTaskCount,
        })
        .scaleOnCpuUtilization('cpuScaling', { targetUtilizationPercent: 80 });

    this.fargateService = ecsService;




    // BACKEND ENDS HERE

    // creating rds instance
    // const dbName =
    // const mysqlUsername = "dbadmin";
    const mysqlSecret = new aws_secretsmanager.Secret(this, 'OracleDbCredentials', {
      secretName: props.stackName + props.dbName + 'OracleDbCredentials',
      description: props.dbName + 'Oracle Db Credentials',
      generateSecretString: {
        excludeCharacters: "\"@/\\ '",
        generateStringKey: 'password',
        passwordLength: 30,
        secretStringTemplate: JSON.stringify({username: props.dbUserName}),
      },
    });

    const dbCredentials = rds.Credentials.fromSecret(mysqlSecret, props.dbUserName);


    const allAll = ec2.Port.allTraffic();
    const tcp3306 = ec2.Port.tcpRange(3306, 3306);
    const ingressSources = [];

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
      description: id + 'Database',
      securityGroupName: id + 'Database',
    });

    dbSecurityGroup.addIngressRule(dbSecurityGroup, allAll, 'all from self');
    dbSecurityGroup.addEgressRule(ec2.Peer.ipv4('0.0.0.0/0'), allAll, 'all out');

    const mysqlConnectionPorts = [
      { port: tcp3306, description: 'tcp3306 oracle' },
    ];


    for (let c of mysqlConnectionPorts) {
      dbSecurityGroup.addIngressRule(Peer.ipv4('0.0.0.0/0'), c.port, c.description);
    }


    const cluster = new DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_28,
      }),
      credentials: dbCredentials,
      vpc: props.vpc,
      backupRetention: Duration.days(7),
      allocatedStorage: 20,
      allowMajorVersionUpgrade: true,
      autoMinorVersionUpgrade: true,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      publiclyAccessible: false,
      removalPolicy: RemovalPolicy.DESTROY,
      storageEncrypted: true,
      monitoringInterval: Duration.seconds(60),
      securityGroups: [dbSecurityGroup],
      // enablePerformanceInsights: true,
      multiAz: true,
      // cloudwatchLogsRetention: RetentionDays.ONE_MONTH,
    });

  }
}
