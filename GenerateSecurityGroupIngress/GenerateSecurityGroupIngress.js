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

  var responseStatus = 'FAILED';
  var responseData = {};
  if (typeof event.ResourceProperties.cidrIPs !== 'undefined') cidr = event.ResourceProperties.cidrIPs.split(',');
  if (typeof event.ResourceProperties.sgIDs !== 'undefined') sgids = event.ResourceProperties.sgIDs.split(',');
  var fromport = event.ResourceProperties.FromPort;
  var toport = event.ResourceProperties.ToPort;
  var proto = event.ResourceProperties.Protocol;
  var sgid = event.ResourceProperties.SecurityGroupID;
  var validate = 1;

  var aws = require('aws-sdk');
  var ec2 = new aws.EC2({Region: aws.config.region});

  if (typeof cidr !== 'undefined') {
    for (var i = 0; i < cidr.length; i++) {
      authorizesgingress(ec2, cidr[i], fromport, toport, proto, sgid, 1);
    }
  }
  else if (typeof sgids !== 'undefined') {
    for (var i = 0; i < sgids.length; i++) {
      authorizesgingress(ec2, sgids[i], fromport, toport, proto, sgid, 2);
    }
  }
  setTimeout(function() {
  responseStatus = 'SUCCESS';
  sendResponse(event, context, responseStatus, responseData);
  }, 5000);
};

// function to authorize security group ingress
function authorizesgingress(ec2, grantto, fromport, toport, proto, sgid, ipsg) {
  var async = require('async');
  async.waterfall([
    function createsgrules(callback) {
      if (ipsg == 1) {
        var sgparams = {
          CidrIp: grantto,
          FromPort: fromport,
          ToPort: toport,
          IpProtocol: proto,
          GroupId: sgid
        };
      }
      else if (ipsg == 2) {
        var sgparams = {
          GroupId : grantto,
          FromPort: fromport,
          ToPort: toport,
          IpProtocol: proto,
          GroupId: sgid
        };
      }
      ec2.authorizeSecurityGroupIngress(sgparams, function(err, data) {
        console.log('Creating Ingress rule to:', grantto);
        if (err) {
          console.log(err);
          if (err.code === 'InvalidPermission.Duplicate') { callback(null); }
          else { callback(err); }
        }
        else { callback(null); }
      });
    }
  ], function(err) {
    if (err) {
      console.log('Failed to authorize security ingress to:', grantto);
      responseData = { Error: 'Failed to authorize security ingress to:' + grantto };
      sendResponse(event, context, responseStatus, responseData);
    }
  });
}

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
