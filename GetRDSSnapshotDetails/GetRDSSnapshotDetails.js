/**
*
* Handler called by Lambda function.
* @param {object} event - event parameter gets the attributes from CFN trigger.
* @param {object} context - context parameter used to log details to CloudWatch log stream.
*
*/
exports.handler = function(event, context) {
  var aws = require('/var/task/aws-sdk/index.js');
  if (event.RequestType === 'Delete') {
    sendResponse(event, context, 'SUCCESS');
    return;
  }

  var responseStatus = 'FAILED';
  var responseData = {};
  var ec2 = new aws.RDS({ region: event.ResourceProperties.Region });
  var describeSnapshotParams = {
    DBSnapshotIdentifier: event.ResourceProperties.SnapshotName,
    IncludePublic: true,
    IncludeShared: true
  };

  // Get RDS snapshot details
  ec2.describeDBSnapshots(describeSnapshotParams, function(err, data) {
    if (err) {
      responseData = { Error: 'DescribeDBsnapshots call failed' };
      console.log(responseData.Error + ':\n', err);
    }
    else {
      responseStatus = 'SUCCESS';
      responseData.StorageSize = data.DBSnapshots[0].AllocatedStorage;
      responseData.MinimumFreeSpace = responseData.StorageSize * 1024 * event.ResourceProperties.AlarmFactor;
      if (data.DBSnapshots[0].StorageType == 'io1') {
        responseData.PIOPS = data.DBSnapshots[0].Iops;
      }
      else {
        responseData.PIOPS = '';
      }
    }
    console.log('Storage size:', responseData.StorageSize, 'PIOP value:', responseData.PIOPS);
    sendResponse(event, context, responseStatus, responseData);
  });
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
