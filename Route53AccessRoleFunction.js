// function to generate a list of string using arn pattern
var generateAccountStringArray = function(accountid) {
  var array = [];
  accountid.forEach(function(accntid) {
    array.push('arn:aws:iam::' + accntid + ':role/LambdaUpdateRoute53');
  });
  return array;
};


/**
*
* Handler called by Lambda function.
* @param {object} event - event parameter gets the attributes from CFN trigger.
* @param {object} context - context parameter used to log details to CloudWatch log stream.
*
*/
exports.handler = function(event, context) {

  console.log('REQUEST RECEIVED:\n', JSON.stringify(event));
  var responseStatus = 'FAILED';
  var responseData = {};
  var roleName = 'Route53AccessRole';
  var accountid = event.ResourceProperties.accountIds.split(',');
  console.log(accountid);

  var aws = require('aws-sdk');
  var iam = new aws.IAM({apiVersion: '2010-05-08'});

  var policyDocObj = {
    'Version' : '2012-10-17',
    'Statement': [{
      'Sid': '',
      'Effect': 'Allow',
      'Principal': {
        'AWS':
            generateAccountStringArray(accountid)
      },
      'Action': 'sts:AssumeRole'
    }]
  };

  var policyString = JSON.stringify(policyDocObj);

  var params = {};

  if (event.RequestType.toUpperCase() === 'UPDATE') {
    params = {
      PolicyDocument: policyString, /* required */
      RoleName: roleName /* required */
    };
    console.log('Going to update role');
    console.log(params);
    iam.updateAssumeRolePolicy(params, function(err, data) {
      if (err) {
        responseData = {Error: 'Failed to update role'};
        console.log(responseData.Error + ':\n', err);
      }
      else {
        responseStatus = 'SUCCESS';
        responseData = {Success: 'Initiated role update.'};
        responseData.roleName = roleName;
        console.log(data);           // successful response
      }
      sendResponse(event, context, responseStatus, responseData);
    });
  }
  else if (event.RequestType.toUpperCase() == 'DELETE') {
    params = {
      RoleName: roleName /* required */
    };
    // Try to delete role
    console.log('Going to delete role');
    console.log(params);
    iam.deleteRole(params, function(err, data) {
      if (err) {
        responseData = {Error: 'Failed to delete role'};
        console.log(responseData.Error + ':\n', err);
      }
      else {
        responseStatus = 'SUCCESS';
        responseData = {Success: 'Initiated role deletion.'};
        responseData.roleName = roleName;
        console.log(data);           // successful response
      }
      sendResponse(event, context, responseStatus, responseData);
    });
  }
  else if (event.RequestType.toUpperCase() === 'CREATE') {
    params = {
      AssumeRolePolicyDocument: policyString, /* required */
      RoleName: roleName /* required */
    };
    console.log('Going to create role');
    console.log(params);
    iam.createRole(params, function(err, data) {
      if (err) {
        responseData = {Error: 'Failed to create role'};
        console.log(err);
      }
      else {
        responseStatus = 'SUCCESS';
        responseData = {Success: 'Initiated role creation.'};
        responseData.roleName = roleName;
        console.log(data);           // successful response
      }
      sendResponse(event, context, responseStatus, responseData);
    });
  }
};

function sendResponse(event, context, responseStatus, responseData) {
  var responseBody = JSON.stringify({
    Status: responseStatus,
    Reason: 'See the details in CloudWatch Log Stream: ' + context.logStreamName,
    PhysicalResourceId: context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData
  });

  console.log('RESPONSE BODY:\n', responseBody);

  var https = require('https');
  var url = require('url');
  var parsedUrl = url.parse(event.ResponseURL);
  var options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'content-type': '',
      'content-length': responseBody.length
    }
  };

  var request = https.request(options, function(response) {
    console.log('STATUS: ' + response.statusCode);
    console.log('HEADERS: ' + JSON.stringify(response.headers));
    // Tell AWS Lambda that the function execution is done
    context.done();
  });

  request.on('error', function(error) {
    console.log('sendResponse Error:\n', error);
    // Tell AWS Lambda that the function execution is done
    context.done();
  });

  // write data to request body
  request.write(responseBody);
  request.end();
}
