from __future__ import print_function
import os
import boto3
import traceback
from collections import OrderedDict

region = os.environ['AWS_DEFAULT_REGION']
url_path = 'https://console.aws.amazon.com/trustedadvisor/home?region=' + region + '#/category/'
colour_map = {'error': '#ff0000', 'warning': '#ffff00', 'ok': '#00ff00'}
to_email = 'noreply@example.com'
from_email = 'noreply@example.com'


def email_notification(SUBJECT, TO, FROM, BODY):
    client = boto3.client('ses')
    try:
        send_response = client.send_email(Source=FROM,
                                          Destination={'ToAddresses': [TO]},
                                          Message={
                                            'Subject': {
                                             'Charset': 'UTF-8',
                                             'Data': SUBJECT,
                                             },
                                            'Body': {
                                             'Html': {
                                              'Charset': 'UTF-8',
                                              'Data': BODY
                                              }
                                             }
                                            })
        print('Successfuly send the email with message ID: ' + send_response['MessageId'])
    except:
        print('Failed to send email, check the stack trace below.')
        traceback.print_exc()


def lambda_handler(event, context):
    try:
        support_client = boto3.client('support', region_name='us-east-1')
        ta_checks = support_client.describe_trusted_advisor_checks(language='en')
        checks_list = {ctgs: [] for ctgs in list(set([checks['category'] for checks in ta_checks['checks']]))}
        for checks in ta_checks['checks']:
            print('Getting check:' + checks['name'])
            try:
                check_summary = support_client.describe_trusted_advisor_check_summaries(
                                checkIds=[checks['id']])['summaries'][0]
                if check_summary['status'] != 'not_available':
                    checks_list[checks['category']].append(
                       [checks['name'], check_summary['status'],
                        str(check_summary['resourcesSummary']['resourcesProcessed']),
                        str(check_summary['resourcesSummary']['resourcesFlagged']),
                        str(check_summary['resourcesSummary']['resourcesSuppressed']),
                        str(check_summary['resourcesSummary']['resourcesIgnored'])])
            except:
                print('Failed to get check: ' + checks['id'] + ' --- ' + checks['name'])
                traceback.print_exc()
                continue
        # print(checks_list)
        email_content = '<style>table, th, td {border: 1px solid black;border-collapse: collapse;}th,' + \
                        ' td{padding: 5px;text-align: left;}</style><table border="1"><tr><th>Category' + \
                        '</th><th>Check</th><th>Status</th><th>Resources Processed</th><th>Resources Flagged</th>' + \
                        '<th>Resources Suppressed</th><th>Resources Ignored</th></tr>'
        for catg, chks in OrderedDict(sorted(checks_list.items())).iteritems():
            first_item = True
            for rit in chks:
                if first_item:
                    email_content += "<tr><th rowspan=" + str(len(checks_list[catg])) + "><a href=\"" \
                                     + url_path + catg.replace("_", "-") + "\">" + catg.replace("_", " ").title() \
                                     + "</a></th>"
                    first_item = False
                else:
                    email_content += "<tr>"
                email_content += "<td>" + rit[0] + "</td><td bgcolor=\"" + colour_map[rit[1]] + "\">" + rit[1] \
                                 + "</td><td>" + rit[2] + "</td><td>" + rit[3] + "</td><td>" + rit[4] + "</td><td>" \
                                 + rit[5] + "</td></tr>"
        email_content += "</table>"
        # print(email_content)
        subject = 'AWS Trusted Advisor Check Summary'
        email_notification(subject, to_email, from_email, email_content)
    except:
        print('Failed! Debug further.')
        traceback.print_exc()


if __name__ == '__main__':
    lambda_handler('event', 'handler')
