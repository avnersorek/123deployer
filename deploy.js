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
// let restApiId;

// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/APIGateway.html


// iam.getRole({ RoleName: 'lambda_tos3' }).promise()
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
      src: ["**/*"],
      dot: true
    }]).finalize();
  });
}

function* deploy() {
  const zipFile = yield zipFolder('/home/avner/work/123lambda/mysql-lambda');

  const role_policy = { "Version": "2012-10-17", "Statement": [{ "Effect": "Allow", "Principal": { "Service": "lambda.amazonaws.com" }, "Action": "sts:AssumeRole" }] };
  var roleResponse = yield iam.createRole({
    AssumeRolePolicyDocument: JSON.stringify(role_policy),
    RoleName: 'my_new_role',
  }).promise();

  var createLambdaResponse = yield lambda.createFunction({
    FunctionName: 'sql2zing',
    Runtime: 'nodejs4.3',
    Role: roleResponse.Role.Arn,
    Handler: 'index.handler',
    Code: { ZipFile: zipFile }
  }).promise();

  // xxxxxxxxxxxxxxxxxxx
  // [InvalidParameterValueException: The role defined for the function cannot be assumed by Lambda.]

  console.log(createLambdaResponse);
}

// var params = {
//   body: JSON.stringify(require('../swagger.json')),
//   failOnWarnings: true
// };

// apigateway.importRestApi(params, function(err, data) {
//   if (err) console.log(err, err.stack); // an error occurred
//   else     console.log(data);           // successful response
// });

// apigateway.createRestApi({
//   name: 'My First API', /* required */
//   description: 'This is my first API'
// }).promise()
//   .then(restApi => {
//     restApiId = restApi.id;
//     return apigateway.getResources({ restApiId }).promise();
//   })
//   .then(rootResource => {
//     return apigateway.createResource({
//       parentId: rootResource.items[0].id,
//       pathPart: 'shoes',
//       restApiId
//     }).promise();
//   })
co(deploy)
.catch(err => {
  console.error(err);
  process.exit(-1);
});
