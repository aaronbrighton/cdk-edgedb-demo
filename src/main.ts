import { App, Stack, StackProps, CfnOutput, } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as edgedb from 'cdk-edgedb';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as path from 'path';

export class CdkEdgeDBDemo extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    //
    // EdgeDB
    //

    const edgeDB = new edgedb.EdgeDB(this, 'EdgeDB', {
      highAvailability: false,
      customDomain: {
        hostedZoneId: 'ZRZJWLXW3FS0K',
        zoneName: 'aaronbrighton.ca',
        name: 'edgedb.aaronbrighton.ca',
        email: 'aaron@aaronbrighton.ca',
      }
    });

    //
    // Demo service / API
    //

    const demoLambda = new lambda.NodejsFunction(this, 'Lambda', {
      entry: path.join(__dirname, 'demo-lambda/index.ts'),
      handler: 'handler',
      environment: {
        DATABASE_HOST: edgeDB.endpoint,
        DATABASE_SECRET: edgeDB.secret.secretArn,
      }
    });
    edgeDB.secret.grantRead(demoLambda);

    const demoLambdaIntegration = new HttpLambdaIntegration('LambdaIntegration', demoLambda);

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi');
    httpApi.addRoutes({
      path: '/',
      methods: [ apigwv2.HttpMethod.GET ],
      integration: demoLambdaIntegration,
    });

    //
    // Outputs
    //

    new CfnOutput(this, 'EdgeDBEndpoint', {
      value: edgeDB.endpoint,
    });

    new CfnOutput(this, 'EdgeDBPasswordSecert', {
      value: `https://console.aws.amazon.com/secretsmanager/home?region=${Stack.of(this).region}#!/secret?name=${edgeDB.secret.secretName}`,
    });

    new CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.apiEndpoint,
    });
    
  }
}

const app = new App();

new CdkEdgeDBDemo(app, 'cdk-edgedb-demo');

app.synth();