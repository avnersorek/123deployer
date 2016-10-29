'use strict';
const co = require('co');
const AWS = require('aws-sdk');
var archiver = require('archiver');

const awsParams = {
  apiVersion: '2015-07-09',
  region: 'eu-west-1',
  // you know ...
  // accessKeyId: 'xxx',
  // secretAccessKe: 'xx'
};

const apigateway = new AWS.APIGateway(awsParams);
const lambda = new AWS.Lambda(awsParams);
const iam = new AWS.IAM(awsParams);

function zipFolder(sourceFolder) {
  return new Promise((resolve, reject) => {
    var archive = archiver('zip');
    var chunks = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    archive.bulk([{
      expand: true,
      cwd: sourceFolder,
      src: ['**/*'],
      dot: true
    }]).finalize();
  });
}

function* createLambdaFunction(params, retries) {
  retries = retries || 3;
  try {
    return yield lambda.createFunction({
      FunctionName: 'sql2zing' + Date.now(),
      Runtime: 'nodejs4.3',
      Role: params.roleArn,
      Handler: 'index.handler',
      Code: { ZipFile: params.zipFile }
    }).promise();
  }
  catch(error) {
    if (retries > 0 && error.message.match(/cannot be assumed by Lambda/)) {
      yield wait(1500);
      return yield createLambdaFunction(params, --retries);
    }
    else throw error;
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function traverseReplace(o, find, replace) {
  for (var i in o) {
    if (o[i] === find) o[i] = replace;
    else if (o[i] !== null && typeof(o[i]) === 'object') traverseReplace(o[i], find, replace);
  }
}

const FUNCTION_FOLDER = '/home/avner/work/123lambda/mysql-lambda';

function* deploy() {
  console.log('zipping');
  const zipFile = yield zipFolder(FUNCTION_FOLDER);

  console.log('creating role');
  const role_policy = { 'Version': '2012-10-17', 'Statement': [{ 'Effect': 'Allow', 'Principal': { 'Service': 'lambda.amazonaws.com' }, 'Action': 'sts:AssumeRole' }] };
  const roleResponse = yield iam.createRole({
    AssumeRolePolicyDocument: JSON.stringify(role_policy),
    RoleName: 'my_new_role' + Date.now(), // just for uniquness for now
  }).promise();

  console.log('creating function');
  const createLambdaResponse = yield createLambdaFunction({ zipFile, roleArn: roleResponse.Role.Arn });

  console.log('updating swagger file');
  let swaggerFile = require(FUNCTION_FOLDER + '/swagger.json');
  traverseReplace(swaggerFile, '$LAMBDA_FUNCTION_ARN', `arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/${createLambdaResponse.FunctionArn}/invocations`);

  console.log('creating API');
  const createApiResponse = yield apigateway.importRestApi({
    body: JSON.stringify(swaggerFile),
    failOnWarnings: true
  }).promise();

  console.log('creating API deployment');
  const createDeploymentResponse = yield apigateway.createDeployment({
    restApiId: createApiResponse.id,
    stageName: 'prod'
  }).promise();

  console.log(createDeploymentResponse);
}

co(deploy)
.catch(err => {
  console.error(err);
  process.exit(-1);
});
