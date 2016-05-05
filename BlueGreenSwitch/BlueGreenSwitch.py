import boto3
from botocore.exceptions import ClientError
import json
import requests


def lambda_handler(event, context):
    print event
    print 'Request type is %s' % event['RequestType']
    if event['RequestType'] == 'Delete':
        sendResponse(event, context, 'SUCCESS', {})
        return 0

    live_asg = event['ResourceProperties']['LiveASG']
    non_live_asg = event['ResourceProperties']['NonLiveASG']
    elb_name = event['ResourceProperties']['ELBName']

    try:
        asg = boto3.client('autoscaling')
        asg.attach_load_balancers(
            AutoScalingGroupName=live_asg,
            LoadBalancerNames=[elb_name]
        )
        print 'Successfully attached ELB %s to the ASG %s.' % (elb_name, live_asg)
        if event['RequestType'] == 'Update':
            asg.detach_load_balancers(
                AutoScalingGroupName=non_live_asg,
                LoadBalancerNames=[elb_name]
            )
            print 'Successfully detached ELB %s from the ASG %s.' % (elb_name, non_live_asg)
        responseData = {'Success': 'Completed ELB attach / detach.'}
        sendResponse(event, context, 'SUCCESS', responseData)
    except ClientError as e:
        print 'Received client error: %s' % e
        responseData = {'Failed': 'Received client error: %s' % e}
        sendResponse(event, context, 'FAILED', responseData)


def sendResponse(event, context, responseStatus, responseData):
    responseBody = {'Status': responseStatus,
                    'Reason': 'See the details in CloudWatch Log Stream: ' + context.log_stream_name,
                    'PhysicalResourceId': context.log_stream_name,
                    'StackId': event['StackId'],
                    'RequestId': event['RequestId'],
                    'LogicalResourceId': event['LogicalResourceId'],
                    'Data': responseData}
    print 'RESPONSE BODY:\n' + json.dumps(responseBody)
    try:
        req = requests.put(event['ResponseURL'], data=json.dumps(responseBody))
        if req.status_code != 200:
            print req.text
            raise Exception('Recieved non 200 response while sending response to CFN.')
        return
    except requests.exceptions.RequestException as e:
        print e
        raise


if __name__ == '__main__':
    lambda_handler('event', 'handler')
