import boto3
import json
import requests


def lambda_handler(event, context):
    responseStatus = 'SUCCESS'
    responseData = {}
    if event['RequestType'] == 'Delete':
        sendResponse(event, context, responseStatus, responseData)

    responseData = {'Success': 'Test Passed.'}
    sendResponse(event, context, responseStatus, responseData)


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
        print req.text
        print e
        raise


if __name__ == '__main__':
    lambda_handler('event', 'handler')
