import * as ecs from "aws-cdk-lib/aws-ecs";
import {Construct} from "constructs";
import * as cdk from "aws-cdk-lib";

interface Props extends cdk.StackProps {
    stackName: string;
    vpc: any;
}

export class ECSStack extends cdk.Stack {
    public readonly cluster: ecs.Cluster;
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        this.cluster = new ecs.Cluster(this, props.stackName, {
            vpc: props.vpc,
        });
    }
}
