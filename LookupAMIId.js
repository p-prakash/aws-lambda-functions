/**
*
* Handler called by Lambda function.
* @param {object} event - event parameter gets the attributes from CFN trigger.
* @param {object} context - context parameter used to log details to CloudWatch log stream.
*
*/
exports.handler = function(event, context) {
  var aws = require('aws-sdk');
  var https = require('https');
  var url = require('url');
  if (event.RequestType === 'Delete') {
    sendResponse(event, context, 'SUCCESS');
    return;
  }

  var responseStatus = 'FAILED';
  var responseData = {};
  var ec2 = new aws.EC2({ region: event.ResourceProperties.Region });
  var describeImagesParams = {
    Filters: [
      {
                Name: 'name',
                Values: [event.ResourceProperties.AMIName]
      }
    ],
    Owners: [event.ResourceProperties.AMIOwner]
  };

  // Get AMI IDs with the specified name pattern and owner
  ec2.describeImages(describeImagesParams, function(err, data) {
    if (err) {
      responseData = { Error: 'DescribeImages call failed' };
      console.log(responseData.Error + ':\n', err);
    }
    else {
      var images = data.Images;
      // Sort images by name in descending order -- the names contain the AMI version formatted as YYYY.MM.Ver.
      images.sort(function(x, y) { return y.Name.localeCompare(x.Name); });
      for (var i = 0; i < images.length; i++) {
        responseStatus = 'SUCCESS';
        responseData.Id = images[i].ImageId;
        break;
      }
      console.log('AMI ID is ', responseData.Id);
    }
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
