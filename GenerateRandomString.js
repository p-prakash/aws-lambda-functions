/**
*
* Handler called by Lambda function.
* @param {object} event - event parameter gets the attributes from CFN trigger.
* @param {object} context - context parameter used to log details to CloudWatch log stream.
*
*/
exports.handler = function(event, context) {
  if (event.RequestType === 'Delete') {
    sendResponse(event, context, 'SUCCESS');
    return;
  }

  var responseStatus = 'SUCCESS';
  var responseData = {};
  var crypto = require('crypto');

  if (typeof event.ResourceProperties.length !== 'undefined') {
    console.log(typeof event.ResourceProperties.length);
    var sl = parseInt(event.ResourceProperties.length);
    responseData.randomstr = crypto.randomBytes(sl).toString('hex').substr(0, sl);
  }
  else {
    responseData.randomstr = crypto.randomBytes(10).toString('hex').substr(0, 6);
  }
  console.log('Randmon string is ', responseData.randomstr);
  sendResponse(event, context, responseStatus, responseData);
};

// Sends a response to the pre-signed S3 URL
var sendResponse = function(event, context, responseStatus, responseData) {
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
      'Content-Type': '',
      'Content-Length': responseBody.length
    }
  };

  var req = https.request(options, function(res) {
    console.log('STATUS:', res.statusCode);
    console.log('HEADERS:', JSON.stringify(res.headers));
    context.succeed('Successfully sent stack response!');
  });

  req.on('error', function(err) {
    console.log('sendResponse Error:\n', err);
    context.fail(err);
  });

  req.write(responseBody);
  req.end();
};
