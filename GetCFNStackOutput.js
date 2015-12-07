/**
*
* Handler called by Lambda function.
* @param {object} event - event parameter gets the attributes from CFN trigger.
* @param {object} context - context parameter used to log details to CloudWatch log stream.
*
*/
exports.handler = function(event, context) {

  console.log('REQUEST RECEIVED:\n', JSON.stringify(event));

  if (event.RequestType == 'Delete') {
    sendResponse(event, context, 'SUCCESS');
    return;
  }

  var stackName = event.ResourceProperties.StackName;
  var responseStatus = 'FAILED';
  var responseData = {};

  // Verifies that a stack name was passed
  if (stackName) {
    var aws = require('aws-sdk');
    var cfn = new aws.CloudFormation();

    // Calls CloudFormation DescribeStacks
    cfn.describeStacks({StackName: stackName}, function(err, data) {
      if (err) {
        responseData = {Error: 'DescribeStacks call failed'};
        console.log(responseData.Error + ':\n', err);
      }
      // Populates the return data with the outputs from the specified stack
      else {
        responseStatus = 'SUCCESS';
        data.Stacks[0].Outputs.forEach(function(output) {
          responseData[output.OutputKey] = output.OutputValue;
        });
        responseData['AZ1'] = aws.config.region.concat('a');
        responseData['AZ2'] = aws.config.region.concat('b');
      }
      sendResponse(event, context, responseStatus, responseData);
    });
  } else {
    responseData = {Error: 'Stack name not specified'};
    console.log(responseData.Error);
    sendResponse(event, context, responseStatus, responseData);
  }
};

//Sends response to the pre-signed S3 URL
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
