import boto3
from botocore.exceptions import ClientError
import json
import requests


def lambda_handler(event, context):
    print event
    responseData = {}
    print 'Request type is %s' % event['RequestType']
    if event['RequestType'] == 'Delete':
        sendResponse(event, context, 'SUCCESS', {})
        return 0

    cluster_identifier = event['ResourceProperties']['cluster_identifier']

    try:
        rds = boto3.client('rds')
        cluster_details = rds.describe_db_clusters(DBClusterIdentifier=cluster_identifier)
        responseData = {'ReaderEndpoint': cluster_details['DBClusters'][0]['ReaderEndpoint']}
        sendResponse(event, context, 'SUCCESS', responseData)
    except ClientError as e:
        print 'Received client error: %s' % e
        responseData = {'Failed': 'Received client error: %s' % e}
        sendResponse(event, context, 'FAILED', responseData)
    except:
        print 'Received Unkown error'
        responseData = {'Failed': 'Received Unkown error:'}
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
