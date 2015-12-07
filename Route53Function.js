/**
*
* Handler called by Lambda function.
* @param {object} event - event parameter gets the attributes from CFN trigger.
* @param {object} context - context parameter used to log details to CloudWatch log stream.
*
*/
exports.handler = function(event, context) {

  console.log('REQUEST RECEIVED:\n', JSON.stringify(event));
  console.log('Assume Role: ' + event.ResourceProperties.RoleArn);
  var responseStatus = 'FAILED';
  var resourceaction = 'UPSERT';
  var paramsstr = '';

  if (event.RequestType === 'Delete') {
   resourceaction = 'DELETE';
  }

  var params = {
    RoleArn: event.ResourceProperties.RoleArn,
    RoleSessionName: 'CrossAccountRoute53Role',
    DurationSeconds: 900
  };

  var aws = require('aws-sdk');
  var sts = new aws.STS();

  console.log('Going to assume role. ');
  sts.assumeRole(params, function(err, data) {
    if (err) {
      responseData = {Error: 'Failed to assume role'};
      console.log(responseData.Error + ':\n', err);
    }
    else {
      var accessparams = {
        AccessID: data.Credentials.AccessKeyId,
        SecretAccessKey: data.Credentials.SecretAccessKey,
        SessionToken: data.Credentials.SessionToken
      };
      var route53 = new aws.Route53({accessKeyId: data.Credentials.AccessKeyId,
        secretAccessKey: data.Credentials.SecretAccessKey, sessionToken: data.Credentials.SessionToken});
      if (event.ResourceProperties.Type === 'A' && event.ResourceProperties.Alias === 'true') {
        r53params = {
          HostedZoneId: event.ResourceProperties.HostedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: resourceaction,
                ResourceRecordSet: {
                  Name: event.ResourceProperties.Name,
                  Type: event.ResourceProperties.Type,
                  AliasTarget: {
                    DNSName: event.ResourceProperties.DNSName,
                    EvaluateTargetHealth: false,
                    HostedZoneId: event.ResourceProperties.ResourceHostedZoneId
                  }
                }
              }
            ]
          }
        };
      }
      else if (event.ResourceProperties.Type === 'CNAME') {
        r53params = {
          HostedZoneId: event.ResourceProperties.HostedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: resourceaction,
                ResourceRecordSet: {
                  Name: event.ResourceProperties.Name,
                  Type: event.ResourceProperties.Type,
                  ResourceRecords: [
                    {
                      Value: event.ResourceProperties.DNSName
                    }
                  ],
                  TTL: '300',
                }
              }
            ]
          }
        };
      }
      else if (event.ResourceProperties.Type === 'A' && event.ResourceProperties.Alias === 'false') {
        r53params = {
          HostedZoneId: event.ResourceProperties.HostedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: resourceaction,
                ResourceRecordSet: {
                  Name: event.ResourceProperties.Name,
                  Type: event.ResourceProperties.Type,
                  TTL: '300',
                  ResourceRecords: [
                                      {
                                        Value: event.ResourceProperties.IP
                                      }
                                    ]
                }
              }
            ]
          }
        };
      }
      else {
        responseData = {Error: 'Unsupported DNS Type' + event.ResourceProperties.Type};
        console.log(responseData.Error);
        console.log('Currently supports only A record & CNAME record.');
        sendResponse(event, context, responseStatus, responseData);
      }
      console.log('Using the following parameters for Route53.');
      console.log(JSON.stringify(r53params));

      route53.changeResourceRecordSets(r53params, function(err, r53data) {
        if (err) {
          responseData = {Error: 'Failed to configure DNS record'};
          console.log(responseData.Error + ':\n', err);
        }
        else {
          responseStatus = 'SUCCESS';
          responseData = {Success: 'State of DNS record ' + r53data.Status};
          responseData.URL = event.ResourceProperties.Name;
          console.log(r53data);           // successful response
        }
        sendResponse(event, context, responseStatus, responseData);
      });
    }
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
