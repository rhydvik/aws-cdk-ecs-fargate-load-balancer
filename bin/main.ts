#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AppInfraStack } from '../lib/app-infra-stack';
import { VPCStack } from '../lib/vpc-stack';
import { ECSStack } from "../lib/cluster";

const app = new cdk.App();

const awsAccountId = process.env.AWS_ACCOUNT_ID || '';
const stackSuffix = process.env.STACK_SUFFIX || 'dev';
const appTag = 'TEST_APPLICATION_TAG';
const env = process.env.STACK_SUFFIX || 'dev';
const region = process.env.AWS_REGION || 'us-east-1';
const vpcId = process.env.VPC_ID || 'vpc-07d74850b22a2a9e5';
// const vpcId = process.env.VPC_ID || '';

const stackName = process.env.STACK_NAME || `${stackSuffix}-app-infra`;
const fargateTaskCpu = Number(process.env.FARGET_TASK_CPU) || 256;
const fargateTaskMemory = Number(process.env.FARGATE_TASK_MEMORY) || 512;
const desiredTaskCount = Number(process.env.FARGATE_DESIRED_COUNT) || 1;
const autoScaleMaxCap = Number(process.env.AUTO_SCALE_MAX_CAP);

const vpcName = process.env.STACk_VPC_NAME || 'app-vpc';

const apiLbName = `${env}-app-api`;
const uiLbName = `${env}-app-ui`;

const dbName = process.env.DB_NAME || 'app-db';
const dbUserName = process.env.DB_USER_NAME || 'admin';

const apiEnvList = {
  SPRING_PROFILES_ACTIVE: process.env.SPRING_PROFILES_ACTIVE || 'dev',
}

const uiEnvList = {
  REACT_APP_API_URL: process.env.REACT_APP_API_URL || 'http://localhost:8080',
}

console.log(env, 'env');
console.log(process.env.ENVIROMENT_NAME, stackSuffix, 'env from process');

function stackMetaData() {
  return {
    tags: {
      AppTag: appTag,
      Environment: env,
    },
    env: {
      region: region,
      account: awsAccountId,
    }
  }
}
// create stuff that will be useful for both the stacks
// creating vpc here
const vpcStack = new VPCStack(app, `${stackName}-vpc`, {
  ...stackMetaData(),
  vpcId: vpcId,
});


const clusterStack = new ECSStack(app, `${stackName}-ecs-cluster`,{
  ...stackMetaData(),
  stackName: `${stackName}-ecs-cluster`,
  vpc: vpcStack.vpc,
});

const commonStackProps = {
  ...stackMetaData(),
  vpc: vpcStack.vpc,
  cluster: clusterStack.cluster,
  // loadBalancerName: loadBalancerName,
  suppressTemplateIndentation: false,
  synthesizer: undefined,
  terminationProtection: false,
  containerPort: 8080,
  stackName: stackName,
  cpuLimit: fargateTaskCpu,
  fargateTaskMemory: fargateTaskMemory,
  desiredTaskCount: desiredTaskCount,
  autoScaleMaxCap: autoScaleMaxCap,
  retainLogs: true,
}


function createAPIStack() {
  return new AppInfraStack(app, 'InfraStack', {
    ...commonStackProps,
    loadBalancerName: apiLbName,
    containerPort: 8080,
    envVars: apiEnvList,
    dbName: `${env}-${dbName}`,
    dbUserName: dbUserName,
  });
}


async function  createStacks() {
  await createAPIStack();
}

createStacks();
