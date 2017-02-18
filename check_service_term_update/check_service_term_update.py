from __future__ import print_function
from lxml import etree
from requests import get
from datetime import date, timedelta, datetime
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import traceback

# configuration items
TO = 'noreply@example.com'
FROM = 'noreply@example.com'
SMTP_Server = '<SMTP_Server>:<SMTP_Port>'
SMTP_User = '<SMTP user name>'
SMTP_Password = '<SMTP Password>'


def email_notification(SUBJECT, BODY):
    msg = MIMEMultipart()
    msg['subject'] = SUBJECT
    msg['To'] = TO
    msg['From'] = FROM
    HTML_BODY = MIMEText(BODY.encode('utf-8'), 'html')
    msg.attach(HTML_BODY)
    try:
        mserver = smtplib.SMTP_SSL(SMTP_Server)
        # mserver.set_debuglevel(1)
        mserver.login(SMTP_User, SMTP_Password)
        mserver.sendmail(FROM, TO, msg.as_string())
    except smtplib.SMTPException as e:
        print('Failed to send email with the following exception!!!\n' + e)
    except:
        traceback.print_exc()


def lambda_handler(event, context):
    today = date.today() - timedelta(1)
    try:
        web_page = get('https://aws.amazon.com/service-terms/').text.replace('<!DOCTYPE html>\n<!--[if IE 8]>\n', '')
        updated_text = etree.HTML(web_page).xpath('//a[contains(@id,"Last_updated")]')[0].text
        updated_date = updated_text.replace('Last updated: ', '')
        if datetime.date(datetime.strptime(updated_date, "%B %d, %Y")) == today:
            print('Same Date')
            email_content = 'AWS Service Terms got updated on ' + updated_date + '.\nPlease check the URL: ' \
                            + ' https://aws.amazon.com/service-terms/'
            subject = 'AWS Service Terms got updated'
            email_notification(subject, email_content)
        else:
            print('Not Same Date')
        print('Successfully executed the script')
    except:
        subject = 'Service Terms check script failed'
        email_content = 'Failed to execute the script, check it.'
        email_notification(subject, email_content)
        print('Failed! Debug further.')
        traceback.print_exc()
