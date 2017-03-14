from __future__ import print_function
import boto3
import traceback
from botocore.exceptions import ClientError


def lambda_handler(event, context):
    try:
        support_client = boto3.client('support', region_name='us-east-1')
        ta_checks = support_client.describe_trusted_advisor_checks(language='en')
        for checks in ta_checks['checks']:
            try:
                support_client.refresh_trusted_advisor_check(checkId=checks['id'])
                print('Refreshing check: ' + checks['name'])
            except ClientError:
                print('Cannot refresh check: ' + checks['name'])
                continue
    except:
        print('Failed! Debug further.')
        traceback.print_exc()

if __name__ == '__main__':
    lambda_handler('event', 'handler')
