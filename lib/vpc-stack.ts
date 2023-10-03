import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cdk from "aws-cdk-lib";
import { Construct } from 'constructs';
import {IVpc} from "aws-cdk-lib/aws-ec2";

interface Props extends cdk.StackProps {
  vpcId: string;
}

export class VPCStack extends cdk.Stack {
  public readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      vpcId: props.vpcId,
    });
  }
}
