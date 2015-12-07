import boto3
import json
import time

config = {
    'tag': 'schedule',
    'exclude': ['i-b4714ff6', 'i-a217b7e9', 'i-22bee1c7', 'i-f280bcb1', 'i-43a5f9a6', 'i-12f3dcf7'],
    'default': '{"mon": {"start": 7, "stop": 18},"tue": {"start": 7, "stop": 18},"wed": {"start": 7, "stop": 18},'
               '"thu": {"start": 7, "stop": 18}, "fri": {"start": 7, "stop": 18}}'
}
sps = ['Launch', 'Terminate', 'HealthCheck', 'ReplaceUnhealthy', 'AZRebalance']


#
# Loop EC2 instances and check if a 'schedule' tag has been set. Next, evaluate value and start/stop instance if needed.
#
def lambda_handler(event, context):
    print "=== Start parsing AWS schedule."
    ec2 = boto3.client('ec2')
    asc = boto3.client('autoscaling')
    response = ec2.describe_instances()

    # Get current day + hour (using GMT)
    hh = int(time.strftime("%H", time.gmtime()))
    day = time.strftime("%a", time.gmtime()).lower()

    started = []
    stopped = []

    exclude_list = config['exclude']

    # Loop reservations/instances.
    for r in response['Reservations']:
        for ins in r['Instances']:
            if (ins['InstanceId'] not in exclude_list) and (not any('ignore' in t['Key'] for t in ins['Tags'])):
                try:
                    for tag in ins['Tags']:
                        if tag['Key'] == 'schedule':
                            data = tag['Value']
                        if tag['Key'] == 'aws:autoscaling:groupName':
                            asg = tag['Value']

                    if data is None:
                        create_schedule_tag(ins, ec2)
                        data = config['default']
                    schedule = json.loads(data)
                    data = None
                    '''
                    TODO: Be smart to find time and start/stop based on the scheduled window instead of just checking
                          at the hour of start or stop.
                    '''
                    try:
                        if hh == schedule[day]['start'] and not ins['State']['Name'] == 'running':
                            print "Starting instance \"%s\" ..." % (ins['InstanceId'])
                            started.append(ins['InstanceId'])
                            ec2.start_instances(InstanceIds=[ins['InstanceId']])
                    except:
                        pass  # catch exception if 'start' is not in schedule.

                    try:
                        if hh == schedule[day]['stop'] and ins['State']['Name'] == 'running':
                            if asg is not None:
                                print "Suspending autoscaling process for ASG \"%s\" before shutting down \
                                       the instance." % asg
                                asc.suspend_processes(AutoScalingGroupName=asg, ScalingProcesses=sps)
                            print "Stopping instance \"%s\" ..." % (ins['InstanceId'])
                            stopped.append(ins['InstanceId'])
                            ec2.stop_instances(InstanceIds=[ins['InstanceId']])
                    except:
                        pass  # catch exception if 'stop' is not in schedule.
                    asg = None
                except KeyError as e:
                    create_schedule_tag(ins, ec2)
                except ValueError as e:
                    # invalid json
                    print 'Invalid value for tag \"schedule\" on instance \"%s\", please check!' % (ins['InstanceId'])
            else:
                print "Instance %s is successfully ignored." % ins['InstanceId']

    # Fix ELB configuration
    '''
    TODO: Deregister & register from ELB only if instances are not InService.
    '''
    if len(started) > 0:
        print "Instances have been started... Checking instances in Elastic Load Balancer."
        elb = boto3.client('elb')
        lbd = elb.describe_load_balancers()
        for e in lbd['LoadBalancerDescriptions']:
            for inss in e['Instances']:
                if inss['InstanceId'] in started:
                    print "Deregistering instance %s from ELB %s" % (inss['InstanceId'], e['LoadBalancerName'])
                    elb.deregister_instances_from_load_balancer(LoadBalancerName=e['LoadBalancerName'],
                                                                Instances=[{'InstanceId': inss['InstanceId']}])
                    time.sleep(3)
                    print "Registering instance %s with ELB %s" % (inss['InstanceId'], e['LoadBalancerName'])
                    elb.register_instances_with_load_balancer(LoadBalancerName=e['LoadBalancerName'],
                                                              Instances=[{'InstanceId': inss['InstanceId']}])

    print "=== Finished parsing AWS schedule."


def create_schedule_tag(instance, ec2):
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

if __name__ == '__main__':
    lambda_handler('event', 'handler')
