import boto3
import sys


#
# Share the AWS resources based on the data received from the event.
#
def lambda_handler(event, context):
    print "=== Started aws resources sharing ==="
    if event['ami']:
        share_amis(event['ami'])
    if event['s3']:
        share_s3_bucket(event['s3'])
    if event['rds']:
        share_rds_snapshot(event['rds'])


def share_amis(amitree):
    for amis in amitree:
        for reg in amitree[amis]:
            desaccess = amitree[amis][reg]
            ec2 = boto3.client('ec2', region_name=reg)
            amilist = get_ami_ids(ec2, amis)
            for amiid in amilist:
                exstaccess = get_ami_perms(ec2, amiid)
                addacct = list(set(desaccess) - set(exstaccess))
                remacct = list(set(exstaccess) - set(desaccess))
                modify_ami_perms(ec2, amiid, addacct, remacct)


def get_ami_ids(ec2, aminame):
    print 'Getting list of AMIs with name ' + aminame
    amiids = []
    try:
        amiout = ec2.describe_images(Filters=[{'Name': 'name', 'Values': [aminame + '*']}])
    except Exception as e:
        print "Error: %s" % e
        sys.exit(1)

    for img in amiout['Images']:
        amiids.append(img['ImageId'])
    return amiids


def get_ami_perms(ec2, amiid):
    print 'Getting launch permissions of AMI ID ' + amiid
    acctids = []
    try:
        acctout = ec2.describe_image_attribute(ImageId=amiid, Attribute='launchPermission')
    except Exception as e:
        print "Error: %s" % e
        sys.exit(1)

    for acct in acctout['LaunchPermissions']:
        acctids.append(acct['UserId'])
    return acctids


def modify_ami_perms(ec2, amiid, addacct, remacct):
    print 'Modifying permissions for AMI ID ' + amiid
    addcoll = []
    remcoll = []
    for acct in addacct:
        addcoll.append({'UserId': acct})
    for acct in remacct:
        remcoll.append({'UserId': acct})
    try:
        if addcoll:
            ec2.modify_image_attribute(ImageId=amiid, Attribute='launchPermission',
                                       LaunchPermission={'Add': addcoll})
        if remcoll:
            ec2.modify_image_attribute(ImageId=amiid, Attribute='launchPermission',
                                       LaunchPermission={'Remove': remcoll})
    except Exception as e:
        print "Error: %s" % e
        sys.exit(1)


def share_rds_snapshot(rdstree):
    for snap in rdstree:
        for reg in rdstree[snap]:
            desaccess = rdstree[snap][reg]
            rds = boto3.client('rds', region_name=reg)
            snaplist = [s for s in get_all_snapshots(rds) if snap in s]
            for sn in snaplist:
                exstaccess = get_snap_perms(rds, sn)
                addacct = list(set(desaccess) - set(exstaccess))
                remacct = list(set(exstaccess) - set(desaccess))
                modify_snapshot_perms(rds, sn, addacct, remacct)


def get_all_snapshots(rds):
    try:
        snapout = rds.describe_db_snapshots()
        snaplist = []
        for snap in snapout['DBSnapshots']:
            snaplist.append(snap['DBSnapshotIdentifier'])
        return snaplist
    except Exception as e:
        print "Error: %s" % e
        sys.exit(1)


def get_snap_perms(rds, snapname):
    print 'Getting existing permission to snapshot ' + snapname
    acctids = []
    try:
        acctout = rds.describe_db_snapshot_attributes(DBSnapshotIdentifier=snapname)
    except Exception as e:
        print "Error: %s" % e
        sys.exit(1)

    for acct in acctout['DBSnapshotAttributesResult']['DBSnapshotAttributes']:
        print acct
        if acct['AttributeName'] == 'restore':
            acctids = acct['AttributeValues']
    return acctids


def modify_snapshot_perms(rds, snap, addacct, remacct):
    print 'Modifying permissions for snapshot ' + snap
    try:
        if addacct:
            rds.modify_db_snapshot_attribute(DBSnapshotIdentifier=snap, AttributeName='restore', ValuesToAdd=addacct)
        if remacct:
            rds.modify_db_snapshot_attribute(DBSnapshotIdentifier=snap, AttributeName='restore', ValuesToRemove=remacct)
    except Exception as e:
        print "Error: %s" % e
        sys.exit(1)


def share_s3_bucket(s3bucks):
    s3 = boto3.client('s3')
    for buck in s3bucks:
        set_s3_bucket_policy(s3, buck, s3bucks[buck])


def set_s3_bucket_policy(s3, buck, acctids):
    print 'Setting policy to S3 bucket ' + buck
    if acctids:
        policy = '{ "Version": "2012-10-17", "Id": "ReadBucketPolicy", "Statement": [ { "Sid": "S3ReadAccessToRole",\
                  "Effect": "Allow", "Principal": { "AWS": ['
        for acct in acctids[:-1]:
            policy += '"arn:aws:iam::' + acct + ':root",'
        else:
            policy += '"arn:aws:iam::' + acctids[-1] + ':root"] }, "Action": [ "s3:List*", "s3:Get*" ], "Resource": [\
                       "arn:aws:s3:::' + buck + '/*","arn:aws:s3:::' + buck + '" ] } ] }'
    try:
        if acctids:
            s3.put_bucket_policy(Bucket=buck, Policy=policy)
        else:
            s3.delete_bucket_policy(Bucket=buck)
    except Exception as e:
        print "Error: %s" % e
        sys.exit(1)


if __name__ == '__main__':
    lambda_handler('event', 'handler')
