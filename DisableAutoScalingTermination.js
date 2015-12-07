/**
*
* Handler called by Lambda function.
* @param {object} event - event parameter gets the attributes from CFN trigger.
* @param {object} context - context parameter used to log details to CloudWatch log stream.
*
*/
exports.handler = function(event, context) {

  console.log('REQUEST RECEIVED:\n', JSON.stringify(event));

  if (event.RequestType == 'Update') {
    sendResponse(event, context, 'SUCCESS');
    return;
  }

  var aws = require('aws-sdk');
  var as = new aws.AutoScaling({region: aws.config.region});
  var ec2 = new aws.EC2({region: aws.config.region});
  var asg = event.ResourceProperties.ASG;
  var responseStatus = 'FAILED';
  var responseData = {};

  // Verifies that auto scaling group was passed
  if (asg) {
    var params = {
      AutoScalingGroupName: asg,
      ScalingProcesses: [
        'HealthCheck',
        'ReplaceUnhealthy',
        'AZRebalance',
        'AlarmNotification',
        'ScheduledActions',
        'AddToLoadBalancer',
        'Terminate'
      ]
    };

    if (event.RequestType == 'Create') {
      as.suspendProcesses(params, function(err, data) {
        if (err) {
          responseData = {Error: 'Failed to suspend processes of autoscaling group' + asg};
          console.log(responseData.Error + ':\n', err);
        }
        else {
          as.describeAutoScalingGroups({AutoScalingGroupNames: [asg]}, function(err, asgdata) {
            if (err) {
              responseData = {Error: 'Failed to get autoscaling group details of ' + asg};
              console.log(responseData.Error + ':\n', err);
            }
            else {
              var iids = [];
              var inslen = asgdata.AutoScalingGroups[0].Instances.length;
              for (var ins = 0; ins < inslen; ins++) {
                iids.push(asgdata.AutoScalingGroups[0].Instances[ins].InstanceId);
              }
              console.log('List of instances in AutoScalingGroup ', iids);
              ec2.describeInstances({InstanceIds: iids}, function(err, insdetails) {
                if (err) {
                  responseData = {Error: 'Failed to get instance publicIps' + iids};
                  console.log(responseData.Error + ':\n', err);
                }
                else {
                  responseData.publicIps = '';
                  for (var i = 0; i < iids.length; i++) {
                    responseData.publicIps += insdetails.Reservations[i].Instances[0].PublicIpAddress;
                    if (i !== iids.length - 1) {
                      responseData.publicIps += ', ';
                    }
                  }
                  responseStatus = 'SUCCESS';
                  console.log('Updated Successfully.');
                }
              });
           }
          });
        }
      });
    }
    else if (event.RequestType == 'Delete') {
      as.resumeProcesses(params, function(err, data) {
        if (err) {
          responseData = {Error: 'Failed to resume processes of autoscaling group' + asg};
          console.log(responseData.Error + ':\n', err);
        }
        else {
          responseStatus = 'SUCCESS';
          console.log('Deleted Successfully.');
        }
      });
    }
    setTimeout(function() {
      sendResponse(event, context, responseStatus, responseData);
    }, 5000);
  }
  else {
    responseData = {Error: 'Autoscaling Group not specified'};
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
