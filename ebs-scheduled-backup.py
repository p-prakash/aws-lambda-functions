import boto3
import botocore
import json
import time
import sys

config = {
    'tag': 'backup',
    'exclude': ['i-a152b90e'],
    'default': '{"time": {"mon": 23, "tue": 23, "wed": 23, "thu": 23, "fri": 23, "sat": 23, "sun": 23},'
               '"retention": 1}',
    'exclude_name': ['TestScript'],
    'auto-create-tag': 'true'
}
sns_topic = ''


def lambda_handler(event, context):
    print "=== Start parsing EBS backup script. ==="
    ec2 = boto3.client('ec2')
    response = ec2.describe_instances()
    namesuffix = time.strftime('-%Y-%m-%d-%H-%M')
    data = None

    # Get current day + hour (using GMT)
    hh = int(time.strftime("%H", time.gmtime()))
    day = time.strftime("%a", time.gmtime()).lower()

    exclude_list = config['exclude']

    # Loop Volumes.
    try:
        for r in response['Reservations']:
            for ins in r['Instances']:
                for t in ins['Tags']:
                    if t['Key'] == 'Name':
                        for namestr in config['exclude_name']:
                            if namestr in t['Value']:
                                print 'Excluding Instance with ID ' + ins['InstanceId']
                                exclude_list.append(ins['InstanceId'])
                    if (ins['InstanceId'] not in exclude_list) and (not any('ignore' in t['Key'] for t in ins['Tags'])):
                        for tag in ins['Tags']:
                            if tag['Key'] == config['tag']:
                                data = tag['Value']

                        if data is None and config['auto-create-tag'] == 'true':
                            print "Instance %s doesn't contains the tag and auto create is enabled." % ins['InstanceId']
                            create_backup_tag(ins, ec2)
                            data = config['default']
                        schedule = json.loads(data)
                        data = None

                        if hh == schedule['time'][day] and not ins['State']['Name'] == 'terminated':
                            print "Getting the list of EBS volumes attached to \"%s\" ..." % ins['InstanceId']
                            volumes = ins['BlockDeviceMappings']
                            for vol in volumes:
                                vid = vol['Ebs']['VolumeId']
                                print "Creating snapshot of volume \"%s\" ..." % (vid)
                                snap_res = ec2.create_snapshot(VolumeId=vid, Description=vid + namesuffix)
                                if snap_res['State'] == 'error':
                                    notify_topic('Failed to create snapshot for volume with ID %s.\nCheck Cloudwatch \
                                                 logs for more details.' % vid)
                                    sys.exit(1)
                                elif maintain_retention(ec2, vid, schedule['retention']) != 0:
                                    print "Failed to maintain the retention period appropriately."
                    else:
                        print "Instance %s is successfully ignored." % ins['InstanceId']
    except botocore.exceptions.ClientError as e:
        print 'Recieved Boto client error %s' % e
    except KeyError as k:
        if config['auto-create-tag'] == 'true':
            print "Inside KeyError %s" % k
            create_backup_tag(ins, ec2)
    except ValueError:
        # invalid json
        print 'Invalid value for tag \"backup\" on instance \"%s\", please check!' % (ins['InstanceId'])
    print "=== Finished parsing EBS backup script. ==="


def create_backup_tag(instance, ec2):
    if instance['InstanceId'] not in config['exclude']:
        try:
            tag_name = config['tag']
            tag_value = config['default']
            print "About to create tag on instance %s with value: %s" % (instance['InstanceId'], tag_value)
            ec2.create_tags(Resources=[instance['InstanceId']], Tags=[{'Key': tag_name, 'Value': tag_value}])
        except Exception as e:
            print e
    else:
        print "Instance %s is successfully ignored." % instance.id


def maintain_retention(ec2, vid, retention_days):
    try:
        snapls = ec2.describe_snapshots(Filters=[{'Name': 'volume-id', 'Values': [vid]}])
        snapdes = []
        for snap in snapls['Snapshots']:
            snapdes.append({snap['Description']: snap['SnapshotId']})
            snaps = sorted(snapdes)
            while len(snaps) > retention_days:
                print snaps
                snapval = snaps[0].values()[0]
                print 'Deleteing snapshot with ID %s' % snapval
                ec2.delete_snapshot(SnapshotId=snapval)
                snaps.pop(0)
        return 0
    except botocore.exceptions.ClientError as e:
        print 'Recieved Boto client error %s' % e
        return 1
    except:
        print 'Unknown exception in maintain_retention'
        return 1


def notify_topic(msg):
    sns = boto3.client('sns')
    try:
        res = sns.publish(TopicArn=sns_topic, Message=msg, Subject='EBS Volume backup notification.')
        if 'MessageId' not in res:
            print 'Failed to send notification to SNS topic %s' % sns_topic
            return 1
        print 'Sent notification successfully.'
        return 0
    except:
        return 1


if __name__ == '__main__':
    lambda_handler('event', 'handler')
