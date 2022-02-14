const { awscdk } = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.12.0',
  defaultReleaseBranch: 'main',
  name: 'cdk-edgedb-demo',

  deps: [
    'edgedb',
  ],
  devDeps: [
    '@types/aws-lambda',
    '@aws-cdk/aws-apigatewayv2-alpha',
    '@aws-cdk/aws-apigatewayv2-integrations-alpha',
    'cdk-edgedb',
  ],
});
project.synth();